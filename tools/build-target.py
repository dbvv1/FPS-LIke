"""Bake one authorized source stance into shared Three/Canvas geometry.

Run Blender with --factory-startup --disable-autoexec, the original soldier.blend,
then --python tools/build-target.py. The original remains unchanged.
"""
import bpy
import hashlib
import json
import math
from pathlib import Path
from mathutils import Vector

def write_editable():
    out=Path('assets/characters/relay-guard')
    data=json.loads((out/'guard.json').read_text())
    vertices,faces=data['vertices'],data['faces']
    # Editable, privacy-clean derived source: bake the chosen stance, retain separate
    # face materials, and rebuild in an empty file instead of publishing source paths.
    bpy.ops.wm.read_factory_settings(use_empty=True)
    for screen in bpy.data.screens:
        for area in screen.areas:
            for space in area.spaces:
                if space.type == 'FILE_BROWSER' and space.params:
                    space.params.directory = b'//'
    bpy.context.scene.render.filepath = '//'
    bpy.context.preferences.filepaths.save_version = 0
    mesh = bpy.data.meshes.new('RelayGuard_stance')
    mesh.from_pydata([(x, -z, y) for x, y, z in vertices], [], [f['indices'] for f in faces])
    obj = bpy.data.objects.new('RelayGuard_stance', mesh); bpy.context.collection.objects.link(obj)
    colors = sorted(set(f['color'] for f in faces))
    for color in colors:
        material = bpy.data.materials.new(f'paint_{color:06x}')
        channels = [((color>>s)&255)/255 for s in [16,8,0]]
        material.diffuse_color = tuple(c/12.92 if c<=.04045 else ((c+.055)/1.055)**2.4 for c in channels)+(1,)
        mesh.materials.append(material)
    for polygon, face in zip(mesh.polygons, faces): polygon.material_index=colors.index(face['color'])
    bpy.ops.wm.save_as_mainfile(filepath=str((out/'relay-guard.blend').resolve()))

if '--editable' in __import__('sys').argv:
    write_editable()
    raise SystemExit(0)

source = Path(bpy.data.filepath)
out = Path('assets/characters/relay-guard')
out.mkdir(parents=True, exist_ok=True)
source_hash = hashlib.sha256(source.read_bytes()).hexdigest()
if source_hash != 'dee84d920eba04121234e5d4b2d693f6148792b902d8cf23afedfa59e17a19c7':
    raise ValueError('Expected the recorded Casti_131 soldier.blend source')
bpy.context.scene.frame_set(0)
bpy.context.view_layer.update()
socket = bpy.data.objects['Gun_Position_M']
old_socket = socket.matrix_world.copy()
gun = bpy.data.objects['Assault_Rifle']
old_gun = gun.matrix_world.copy()
# Use the source's own aiming and visor controls, not cross-character IK.
aim = bpy.data.objects['Aim_Control_Male']
camera = bpy.data.objects['FPS_Camera']
bpy.context.view_layer.update()
forward = (camera.matrix_world.to_3x3() @ Vector((0, 0, -1))).normalized()
# The source camera has its own local rotation; a guessed control Euler angle
# still aimed 20 degrees upward. Rotate its actual forward to the sim's +Z.
rotation = forward.rotation_difference(Vector((0, 1, 0)))
aim.rotation_mode = 'QUATERNION'
aim.rotation_quaternion = rotation @ aim.matrix_world.to_quaternion()
rig = bpy.data.objects['Soldier_Male']
for name in ['HEAD', 'VISOR']:
    rig.pose.bones[name].rotation_quaternion = (1, 0, 0, 0)
bpy.context.view_layer.update()
gun.matrix_world = socket.matrix_world @ old_socket.inverted() @ old_gun
actual_forward = (camera.matrix_world.to_3x3() @ Vector((0, 0, -1))).normalized()
gun_forward = (gun.matrix_world.to_3x3() @ Vector((0, 1, 0))).normalized()
if (gun_forward-Vector((0, 1, 0))).length > 1e-5:
    raise ValueError('Source weapon and camera must share horizontal +Y')
if (actual_forward-Vector((0, 1, 0))).length > 1e-5:
    raise ValueError('Source camera must face horizontal +Y after native aim-control adaptation')
for name in ['soldier.png', 'gear.png']:
    image = bpy.data.images[name]
    image.filepath = str(source.parent / name)
    image.reload()
bpy.context.view_layer.update()

body = bpy.data.objects['Soldier_Male_Mesh']
evaluated = body.evaluated_get(bpy.context.evaluated_depsgraph_get())
mesh = evaluated.to_mesh()
points = [evaluated.matrix_world @ v.co for v in mesh.vertices]
groups = [body.vertex_groups[max(v.groups, key=lambda g: g.weight).group].name for v in body.data.vertices]
head = [p for p, group in zip(points, groups) if group in ['HEAD', 'VISOR']]
center = Vector([(min(p[i] for p in head) + max(p[i] for p in head)) / 2 for i in range(3)])
floor = min(p.z for p in points)
scale = 1.62 / (center.z - floor)
evaluated.to_mesh_clear()

vertices, faces, head_indices, torso_indices = [], [], [], []
for obj, image_name in [(body, 'soldier.png'), (gun, 'gear.png')]:
    evaluated = obj.evaluated_get(bpy.context.evaluated_depsgraph_get())
    mesh = evaluated.to_mesh()
    image = bpy.data.images[image_name]
    pixels = list(image.pixels)
    width, height = image.size
    offset = len(vertices)
    for i, vertex in enumerate(mesh.vertices):
        p = evaluated.matrix_world @ vertex.co
        # Blender Z-up / +Y forward -> simulation Y-up / +Z forward.
        vertices.append([round(v, 6) for v in ((p.x-center.x)*scale, (p.z-floor)*scale, (p.y-center.y)*scale)])
        if obj == body:
            if groups[i] in ['HEAD', 'VISOR']: head_indices.append(offset+i)
            if groups[i] in ['RIBS', 'ABD']: torso_indices.append(offset+i)
    uv = mesh.uv_layers.active
    for polygon in mesh.polygons:
        # Back-mounted accessories are not needed for this threat silhouette.
        if obj == body and all(groups[i] in ['RIBS.001', 'RIBS.002'] for i in polygon.vertices):
            continue
        u = sum(uv.data[i].uv.x for i in polygon.loop_indices)/len(polygon.loop_indices)
        v = sum(uv.data[i].uv.y for i in polygon.loop_indices)/len(polygon.loop_indices)
        ix = min(width-1, max(0, int(u*width))); iy = min(height-1, max(0, int(v*height)))
        # Byte-image pixels retain their encoded sRGB values in this Blender API.
        srgb = [round(255*c) for c in pixels[(iy*width+ix)*4:(iy*width+ix)*4+3]]
        color = (srgb[0]<<16)|(srgb[1]<<8)|srgb[2]
        # This axis conversion reverses handedness.
        indices = [offset+i for i in reversed(polygon.vertices)]
        faces.append({'indices': indices, 'color': color, 'part': 'body' if obj == body else 'weapon'})
    evaluated.to_mesh_clear()

data = {'vertices': vertices, 'faces': faces, 'head': head_indices, 'torso': torso_indices,
        'sourceSha256': source_hash, 'scale': scale, 'pose': 'source frame 0, source-camera horizontal aim, closed visor',
        'aimForward': [round(actual_forward.x,6),round(actual_forward.z,6),round(actual_forward.y,6)],
        'weaponForward': [round(gun_forward.x,6),round(gun_forward.z,6),round(gun_forward.y,6)]}
(out/'guard.json').write_text(json.dumps(data, separators=(',', ':'))+'\n')
print(json.dumps({'vertices':len(vertices),'faces':len(faces),'scale':scale,'headRadius':max(math.dist(vertices[i],[0,1.62,0]) for i in head_indices)}))
