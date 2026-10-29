#!/usr/bin/env python3
"""Blender background-only authoring. Draft assets, NOT a game scene.
Run: blender --background --factory-startup --disable-autoexec --python tools/build.py
No external packages, images, model weights, services, drivers or downloads.
"""
import argparse, collections, hashlib, json, math, pathlib, sys
import bpy
from mathutils import Vector
ROOT=pathlib.Path(__file__).resolve().parents[1]
p=argparse.ArgumentParser(); p.add_argument('--render',action='store_true'); p.add_argument('--output',default='models'); args=p.parse_args(sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else [])
OUT=(ROOT/args.output).resolve(); assert OUT.is_relative_to(ROOT), 'output must stay within the draft directory'; OUT.mkdir(parents=True,exist_ok=True)
C=json.loads((ROOT/'contract.json').read_text()); S=json.loads((ROOT/'style.json').read_text()); P=S['palette']
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.context.preferences.filepaths.save_version=0
scene=bpy.context.scene; scene.unit_settings.system='METRIC'; scene.unit_settings.scale_length=1
scene.render.engine='CYCLES'; scene.cycles.device='CPU'; scene.cycles.samples=64; scene.cycles.use_denoising=False
scene.render.threads_mode='FIXED'; scene.render.threads=4
scene.view_settings.view_transform='Standard'; scene.view_settings.look='Medium High Contrast'; scene.view_settings.exposure=0; scene.view_settings.gamma=1
scene['status']='ENGINEERING DRAFT. Offline Cycles CPU preview only. Not an in-game capture. Not adopted.'
scene['contract_main_commit']=C['mainCommit']; scene['contract_running_commit']=C['runningCommit']
scene['source_method']='Original editable procedural bpy geometry; NOT neural-model-generated.'

def linear(s):
    q=[int(s[i:i+2],16)/255 for i in (1,3,5)]
    return [v/12.92 if v<=.04045 else ((v+.055)/1.055)**2.4 for v in q]+[1]

body=bpy.data.materials.new('Shared_Matte_VertexPalette'); body.use_nodes=True; body.use_backface_culling=True
bs=body.node_tree.nodes.get('Principled BSDF'); bs.inputs['Roughness'].default_value=S['roughness']; bs.inputs['Metallic'].default_value=S['metallic']
col=body.node_tree.nodes.new('ShaderNodeVertexColor'); col.layer_name='Color'; body.node_tree.links.new(col.outputs['Color'],bs.inputs['Base Color'])
lightmat=bpy.data.materials.new('Lamp_Unlit_Opaque'); lightmat.use_nodes=True; lightmat.use_backface_culling=True
nodes=lightmat.node_tree.nodes; nodes.clear(); out=nodes.new('ShaderNodeOutputMaterial'); color=nodes.new('ShaderNodeVertexColor'); color.layer_name='Color'; lightmat.node_tree.links.new(color.outputs['Color'],out.inputs['Surface'])


def ring(width,depth,bevel,inset,with_panels=False):
    x=width/2-inset; y=depth/2-inset; b=min(bevel,x*.3,y*.3)
    # Counterclockwise octagonal profile with optional 2 m panel/inspection color boundaries.
    def points(span):
        vals=[.07,.13,.28,.34,1.02,1.08,1.95,2,2.07,2.13]
        return sorted({round(v-span/2,7) for v in vals if -span/2+2*bevel < v-span/2 < span/2-2*bevel}) if with_panels else []
    xs=points(width); ys=points(depth)
    pts=[(-x+b,-y)]+[(v,-y) for v in xs]+[(x-b,-y),(x,-y+b)]+[(x,v) for v in ys]+[(x,y-b),(x-b,y)]+[(v,y) for v in reversed(xs)]+[(-x+b,y),(-x,y-b)]+[(-x,v) for v in reversed(ys)]+[(-x,-y+b)]
    return pts


def make_mesh(name,width,depth,height,z0,levels,bevel,color_fn,with_panels=False,material_fn=None):
    vertices=[]; rings=[]
    for z,inset in levels:
        r=ring(width,depth,bevel,inset,with_panels)
        if rings: assert len(r)==len(rings[0])
        start=len(vertices); vertices.extend([(x,y,z0+z) for x,y in r]); rings.append(list(range(start,start+len(r))))
    faces=[]; colors=[]; materials=[]
    for k in range(len(rings)-1):
        for i in range(len(rings[k])):
            j=(i+1)%len(rings[k]); face=(rings[k][i],rings[k][j],rings[k+1][j],rings[k+1][i]); faces.append(face)
            co=[sum(vertices[v][axis] for v in face)/4 for axis in range(3)]
            a,b=vertices[face[0]],vertices[face[1]]; dx,dy=abs(a[0]-b[0]),abs(a[1]-b[1])
            width_axis=dx>dy
            local_u=co[0]+width/2 if width_axis else co[1]+depth/2
            colors.append(color_fn(co[2]-z0,local_u,'side'))
            materials.append(material_fn(co[2]-z0,'side') if material_fn else 0)
    for ids,cap,z in [(tuple(reversed(rings[0])),'bottom',0),(tuple(rings[-1]),'top',height)]:
        faces.append(ids); colors.append(color_fn(z,0,cap)); materials.append(material_fn(z,cap) if material_fn else 0)
    mesh=bpy.data.meshes.new(name); mesh.from_pydata(vertices,[],faces); mesh.update()
    obj=bpy.data.objects.new(name,mesh); scene.collection.objects.link(obj); mesh.materials.append(body)
    if material_fn: mesh.materials.append(lightmat)
    colors_attr=mesh.color_attributes.new(name='Color',type='FLOAT_COLOR',domain='CORNER')
    for poly,color,mi in zip(mesh.polygons,colors,materials):
        poly.material_index=mi; poly.use_smooth=False
        for li in poly.loop_indices: colors_attr.data[li].color=linear(color)
    # Each original box part is checked independently; disjoint lamp union cannot gain side brackets.
    lower=[-width/2,-depth/2,z0]; upper=[width/2,depth/2,z0+height]
    for v in mesh.vertices:
        assert all(lower[i]-1e-6<=v.co[i]<=upper[i]+1e-6 for i in range(3)),(name,tuple(v.co))
    counts=collections.Counter(tuple(sorted(e)) for f in faces for e in zip(f,f[1:]+f[:1]))
    assert all(n==2 for n in counts.values()),f'{name}: nonmanifold'
    obj['source_part_box_blender_min']=lower; obj['source_part_box_blender_max']=upper
    obj['collision']='NONE: visual draft only, original simulation remains authoritative'
    obj['bounds_test']='all vertices within original component box'
    return obj


def wall_piece(piece,cover=False):
    w,h,d=piece['sizeXYZ']; plinth=min(.68,h*.28); bevel=S['coverBevel' if cover else 'wallBevel']; inset=S['coverFaceInset' if cover else 'wallFaceInset']
    zs={0,bevel,.09,plinth,plinth+.07,plinth+.09,h-.10,h-bevel,h}
    if not cover:
        zs.update([h-.44,h-.30]+[plinth+v for v in (.22,.28,.62,.68)])
        # Inspection slat color boundaries are derived from the existing .14 m recipe, not texture noise.
        for n in range(math.ceil(h/.14)):
            for v in [n*.14,n*.14+.055]:
                if plinth+.28<v<plinth+.62: zs.add(v)
    zs=sorted({round(z,7) for z in zs if 0<=z<=h})
    levels=[(z,bevel if z==0 or z==h else (inset if plinth+.09<=z<=h-.10 else 0)) for z in zs]
    def color(z,u,face):
        if face in ('top','bottom'): return P['trim']
        if z<.09:return P['recess']
        if z>h-.10:return P['trim']
        if z<plinth:return P['base']
        if z<plinth+.07:return P['orange']
        seam=u%2
        if seam<.07 or seam>1.95:return P['seam']
        if seam<.13:return P['trim']
        if not cover and h-.44<z<h-.30:return P['base']
        bay=u%4
        if not cover and .28<bay<1.08 and plinth+.22<z<plinth+.68:
            if bay<.34 or bay>1.02 or z<plinth+.28 or z>plinth+.62:return P['trim']
            return P['recess'] if z%.14<.055 else P['base']
        return P['plaster']  # Draft unifies wall/low cover upper panel. Not a claim of original cover color.
    obj=make_mesh(piece['id'],w,d,h,0,levels,bevel,color,True)
    obj['source_box_id']=piece['sourceBoxId']; obj['draft_revision']=S['revision']
    return [obj]

assets={}
assets[C['pieces'][0]['id']]=wall_piece(C['pieces'][0])
assets[C['pieces'][1]['id']]=wall_piece(C['pieces'][1],True)
pole=C['pieces'][2]['originalParts'][0]; head=C['pieces'][2]['originalParts'][1]
w,h,d=pole['sizeXYZ']; b=S['poleBevel']
po=make_mesh('lamp-pole',w,d,h,0,[(0,b),(b,0),(h-b,0),(h,b)],b,lambda z,u,f: C['material']['lampPoleOriginalHex'])
w,h,d=head['sizeXYZ']; b=S['headBevel']
he=make_mesh('lamp-head',w,d,h,head['localBottomCenter'][1],[(0,b),(b,0),(h-b,0),(h,b)],b,
    lambda z,u,f:C['material']['lampFaceOriginalHex'],False,
    lambda z,f:1)
assets[C['pieces'][2]['id']]=[po,he]


def mesh_stats(objs):
    tris=0; vertices=0; mats=set(); components=[]
    for obj in objs:
        mesh=obj.data; mesh.calc_loop_triangles(); tris+=len(mesh.loop_triangles); vertices+=len(mesh.vertices)
        mats.update(mesh.materials[p.material_index].name for p in mesh.polygons)
        components.append({'name':obj.name,'vertices':len(mesh.vertices),'triangles':len(mesh.loop_triangles),'originalPartBoundsBlender':{'min':list(obj['source_part_box_blender_min']),'max':list(obj['source_part_box_blender_max'])},'allVerticesWithinPartBox':True,'closedTwoManifold':True})
    return {'sourceVertices':vertices,'triangles':tris,'materialCount':len(mats),'materials':sorted(mats),'components':components}

manifest={'schema':C['schema'],'status':C['status'],'method':'Editable bpy procedural geometry, not neural-generated','mainCommit':C['mainCommit'],'runningCommit':C['runningCommit'],'blenderVersion':bpy.app.version_string,'styleRevision':S['revision'],'units':'meters','exportAxis':'Y-up, bottom-center pivot','notGameCapture':True,'noGameSourceChanged':True,'noExternalDownloadsOrServices':True,'assets':[]}
for piece in C['pieces']:
    name=piece['id']; objs=assets[name]; stats=mesh_stats(objs)
    assert stats['triangles']<=C['budget']['hardMaximumTrisPerPiece']
    bpy.ops.object.select_all(action='DESELECT')
    export_objects=[]
    for obj in objs:
        copy=obj.copy(); copy.data=obj.data.copy(); scene.collection.objects.link(copy); copy.select_set(True); export_objects.append(copy)
    bpy.context.view_layer.objects.active=export_objects[0]
    if len(export_objects)>1: bpy.ops.object.join()
    export_object=bpy.context.view_layer.objects.active; export_object.name=name+'-export'
    path=OUT/(name+'.glb')
    bpy.ops.export_scene.gltf(filepath=str(path),export_format='GLB',use_selection=True,export_yup=True,export_apply=True,export_texcoords=False,export_normals=True,export_materials='EXPORT',export_vertex_color="MATERIAL",export_all_vertex_colors=False,export_attributes=False,export_extras=False,export_cameras=False,export_lights=False,export_animations=False,export_draco_mesh_compression_enable=False)
    bpy.data.objects.remove(export_object,do_unlink=True)
    raw=path.read_bytes(); manifest['assets'].append({'id':name,'file':path.relative_to(ROOT).as_posix(),'dimensionsXYZ':piece['sizeXYZ'],'sourceStats':stats,'glbBytes':len(raw),'sha256':hashlib.sha256(raw).hexdigest(),'textureBytes':0,'adopted':False})
# Preview arrangement does not alter the exported local-pivot models. Explicitly not the game layout.
positions={'wall-center-dogleg':(-2.6,0,0),'low-cover-site':(0.25,0,0),'lamp-existing':(2.35,0,0)}
for name,objs in assets.items():
    for obj in objs: obj.location=positions[name]
# Embed editable build sources and locked contract in .blend.
for filename in ['tools/build.py','contract.json','style.json']:
    txt=bpy.data.texts.new(filename); txt.write((ROOT/filename).read_text())
world=bpy.data.worlds.new('Offline_Studio_World'); scene.world=world; world.use_nodes=True; world.node_tree.nodes['Background'].inputs['Color'].default_value=(.22,.29,.34,1); world.node_tree.nodes['Background'].inputs['Strength'].default_value=.7
sun_data=bpy.data.lights.new('Offline_Studio_Key','SUN'); sun_data.energy=2.1; sun_data.angle=.12; sun_data.color=(1,.92,.80)
sun=bpy.data.objects.new('Offline_Studio_Key',sun_data); scene.collection.objects.link(sun); sun.rotation_euler=(math.radians(30),math.radians(-24),math.radians(-28))
cam_data=bpy.data.cameras.new('Offline_Array_Camera'); cam=bpy.data.objects.new('Offline_Array_Camera',cam_data); scene.collection.objects.link(cam); scene.camera=cam
cam.location=(8,-15,9); target=Vector((-.4,0,2.2)); cam.rotation_euler=(target-cam.location).to_track_quat('-Z','Y').to_euler(); cam_data.type='ORTHO'; cam_data.ortho_scale=10
scene.render.resolution_x=1440; scene.render.resolution_y=1000; scene.render.resolution_percentage=100; scene.render.film_transparent=False
# Only preview objects: floor and label are intentionally excluded from the exported GLBs.
bpy.ops.mesh.primitive_plane_add(size=200,location=(0,0,-.025)); floor=bpy.context.object; floor.name='PREVIEW_ONLY_floor'; fm=bpy.data.materials.new('PREVIEW_ONLY_floor_material'); fm.diffuse_color=(.22,.26,.28,1); fm.use_nodes=True; fm.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value=(.22,.26,.28,1); fm.node_tree.nodes['Principled BSDF'].inputs['Roughness'].default_value=1; floor.data.materials.append(fm)
# Camera-facing diagnostic type belongs only to the offline scene, never any GLB.
labelmat=bpy.data.materials.new('PREVIEW_ONLY_label'); labelmat.use_nodes=True
ln=labelmat.node_tree.nodes; ln.clear(); lo=ln.new('ShaderNodeOutputMaterial'); le=ln.new('ShaderNodeEmission'); le.inputs['Color'].default_value=(.93,.96,.97,1); le.inputs['Strength'].default_value=1; labelmat.node_tree.links.new(le.outputs[0],lo.inputs['Surface'])
for text,y,size in [('ENGINEERING DRAFT  /  THREE ENVIRONMENT STANDARDS',3.08,.17),('CYCLES CPU OFFLINE ARRAY - NOT A GAME CAPTURE - NOT ADOPTED',2.82,.115),('WALL 2.2 x 3.4 x 1.2 m     LOW COVER 2.2 x 0.8 x 1.1 m     LAMP 0.8 x 5 x 0.35 m',-3.14,.105)]:
    curve=bpy.data.curves.new('PREVIEW_ONLY_label','FONT'); curve.body=text; curve.size=size
    obj=bpy.data.objects.new('PREVIEW_ONLY_label',curve); scene.collection.objects.link(obj); obj.rotation_euler=cam.rotation_euler
    obj.location=cam.location+cam.rotation_euler.to_quaternion()@Vector((-4.65,y,-10)); curve.materials.append(labelmat)
# Save before rendering; no GPU device is enabled, all lighting is preview-only.
bpy.ops.object.select_all(action='DESELECT'); blend=OUT/'fps-three-standards-draft-01.blend'; bpy.ops.wm.save_as_mainfile(filepath=str(blend),compress=True)
manifest['blend']={'file':blend.relative_to(ROOT).as_posix(),'bytes':blend.stat().st_size,'sha256':hashlib.sha256(blend.read_bytes()).hexdigest(),'editableTextBlocks':['tools/build.py','contract.json','style.json'],'previewScene':'Offline studio array, NOT game layout, NOT game renderer'}
manifest['inputs']=[{'file':p,'sha256':hashlib.sha256((ROOT/p).read_bytes()).hexdigest()} for p in ['tools/build.py','contract.json','style.json']]
(OUT/'manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
if args.render:
    scene.render.image_settings.file_format='PNG'; scene.render.filepath=str(ROOT/'previews'/'offline-array-draft-01.png'); bpy.ops.render.render(write_still=True)
print('DRAFT_RESULT '+json.dumps(manifest,indent=2))
