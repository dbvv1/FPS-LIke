import * as THREE from 'three';
import { groundLevels, groundUV } from './ground.js';
import { YARD, wallStrip } from './yard.js';
import { Feedback } from './feedback.js';
import { targetTriangles, targetVertices, targetColor } from './target.js';
import { MAP } from '../content/map.js';
import { eye } from '../sim/physics.js';
import { type Actor, type GameState } from '../sim/types.js';
import { weaponParts, weaponPose, weaponMesh, weaponPartPosition, weaponMuzzle } from './weapon.js';
import { cameraPose, toThree } from './coordinates.js';
export class View {
  readonly backend = 'three-webgl2';
  get info() { return { memory: { ...this.renderer.info.memory }, calls: this.renderer.info.render.calls }; }
  readonly renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(80, 1, 0.05, 100);
  private feedback = new Feedback();
  private impacts: THREE.Mesh[] = [];
  private actors = new Map<string, THREE.Mesh<THREE.BufferGeometry,THREE.MeshStandardMaterial>>();
  private weapon = new THREE.Group();
  private rifle = new THREE.Group();
  private pistol = new THREE.Group();
  private flash = new THREE.Mesh(new THREE.SphereGeometry(0.065, 6, 4), new THREE.MeshBasicMaterial({ color: 0xffda73, depthTest: false }));
  private bomb = new THREE.Group();
  private geometries = new Set<THREE.BufferGeometry>();
  private materials = new Set<THREE.Material>();
  private textures = new Set<THREE.Texture>();
  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.scene.background = new THREE.Color(YARD.sky);
    this.scene.fog = new THREE.Fog(YARD.sky, 32, 80);
    this.scene.add(new THREE.HemisphereLight(0xb9e7ff, 0x32413b, 2.1));
    const sun = new THREE.DirectionalLight(0xffdba8, 2.6); sun.position.set(-8, 18, -4); this.scene.add(sun);
    const floor=this.box(this.scene, [0, -0.15, 0], [27, 0.3, 37], 0xffffff);
    const base=groundLevels[0]!,texture=new THREE.DataTexture(base.rgba,base.size,base.size);
    texture.mipmaps=groundLevels.map(mip=>({data:mip.rgba,width:mip.size,height:mip.size}));
    texture.colorSpace=THREE.SRGBColorSpace;texture.wrapS=texture.wrapT=THREE.RepeatWrapping;
    texture.minFilter=THREE.LinearMipmapLinearFilter;texture.magFilter=THREE.LinearFilter;texture.anisotropy=1;texture.needsUpdate=true;this.textures.add(texture);
    const positions=floor.geometry.getAttribute('position'),uv=floor.geometry.getAttribute('uv');
    for(let i=0;i<positions.count;i++)uv.setXY(i,...groundUV(positions.getX(i),-positions.getZ(i)));uv.needsUpdate=true;
    const material=floor.material as THREE.MeshStandardMaterial;material.map=texture;material.roughness=.95;material.metalness=0;
    for (const wall of MAP.walls) {
      const texture=new THREE.DataTexture(wallStrip(wall),1,128);texture.colorSpace=THREE.SRGBColorSpace;texture.needsUpdate=true;this.textures.add(texture);
      const side=new THREE.MeshStandardMaterial({map:texture,roughness:.95,metalness:0}),top=new THREE.MeshStandardMaterial({color:YARD.cap,roughness:.9});
      const geometry=new THREE.BoxGeometry(wall.half.x*2,wall.half.y*2,wall.half.z*2);
      // Keep identical box triangles, but batch the five painted faces together.
      const indices=Array.from(geometry.index!.array);geometry.setIndex([...indices.slice(0,12),...indices.slice(18),...indices.slice(12,18)]);geometry.clearGroups();geometry.addGroup(0,30,0);geometry.addGroup(30,6,1);
      const mesh=new THREE.Mesh(geometry,[side,top]);
      mesh.position.set(...toThree(wall.center));this.scene.add(mesh);this.geometries.add(geometry);this.materials.add(side);this.materials.add(top);
    }
    for (const [i, route] of MAP.routes.entries()) {
      const x = route[0]!.x;
      for (let z = -15; z < 8; z += 2.7) this.box(this.scene, toThree({ x, y: 0.015, z }), [0.12, 0.02, 1], i === 1 ? 0xf8b44c : 0x55bab2, true);
      this.box(this.scene, toThree({ x, y: 0.02, z: -16 }), [2.5, 0.04, 0.15], 0xf8b44c, true);
    }
    const ring = new THREE.Mesh(new THREE.RingGeometry(MAP.siteRadius - 0.08, MAP.siteRadius, 48), new THREE.MeshBasicMaterial({ color: 0xffc666, side: THREE.DoubleSide }));
    ring.rotation.x = -Math.PI / 2; ring.position.set(...toThree({ ...MAP.site, y: 0.025 })); this.scene.add(ring);
    for (const x of [-11.5, 11.5]) for (const z of [-13, 6, 15]) {
      this.box(this.scene, toThree({ x, y: 2.5, z }), [0.12, 5, 0.12], 0x26323b);
      this.box(this.scene, toThree({ x, y: 4.8, z }), [0.8, 0.12, 0.35], 0xffe7ad, true);
    }
    this.box(this.bomb, [0, 0.18, 0], [0.44, 0.36, 0.35], 0x16252d);
    this.box(this.bomb, [0, 0.38, 0], [0.3, 0.06, 0.12], 0xf6a738, true);
    this.scene.add(this.bomb);
    this.makeWeapon(this.rifle, false); this.makeWeapon(this.pistol, true);
    this.weapon.add(this.rifle, this.pistol, this.flash); this.flash.position.set(0.01, 0.03, -0.7); this.flash.visible = false;
    this.camera.add(this.weapon); this.scene.add(this.camera);
    this.resize();
    this.scene.traverse(o => { if (o instanceof THREE.Mesh || o instanceof THREE.LineSegments) { this.geometries.add(o.geometry); for (const m of Array.isArray(o.material) ? o.material : [o.material]) this.materials.add(m); } });
  }
  private box(parent: THREE.Object3D, pos: readonly number[], scale: readonly number[], color: number, emissive = false) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(scale[0]!, scale[1]!, scale[2]!), emissive ? new THREE.MeshBasicMaterial({ color }) : new THREE.MeshStandardMaterial({ color, roughness: 0.8, metalness: 0.15 }));
    mesh.position.set(pos[0]!, pos[1]!, pos[2]!); parent.add(mesh);
    this.geometries.add(mesh.geometry); this.materials.add(mesh.material);
    return mesh;
  }
  private makeWeapon(parent: THREE.Group, pistol: boolean) {
    for (const part of weaponParts(pistol ? 'pistol' : 'rifle')) {
      const data=weaponMesh(part),positions:number[]=[];
      for(const face of data.faces)for(let i=1;i<face.length-1;i++)for(const index of [face[0]!,face[i]!,face[i+1]!])positions.push(...data.vertices[index]!);
      const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.computeVertexNormals();
      const mesh=new THREE.Mesh(geometry,new THREE.MeshStandardMaterial({color:part.color,roughness:.8,metalness:.12}));
      mesh.position.set(...part.position);mesh.rotation.x=part.tilt??0;mesh.userData.part=part;parent.add(mesh);
      this.geometries.add(geometry);this.materials.add(mesh.material);
    }
  }
  resize() {
    const canvas = this.renderer.domElement;
    const w = canvas.clientWidth, h = canvas.clientHeight;
    this.renderer.setSize(w, h, false); this.camera.aspect = w / Math.max(1, h); this.camera.updateProjectionMatrix();
  }
  render(state: GameState, player: Actor, yaw: number, pitch: number, now: number, dt: number) {
    const pose = weaponPose(state, player), effects=this.feedback.update(state,now);
    cameraPose(this.camera, eye(player), yaw, pitch);
    this.weapon.position.set(pose.x, pose.y, pose.z);
    this.weapon.rotation.set(pose.pitch, 0, pose.roll, 'ZYX');
    this.weapon.visible = player.hp > 0;
    this.rifle.visible = player.weapon === 'rifle'; this.pistol.visible = player.weapon === 'pistol';
    for (const group of [this.rifle, this.pistol]) for (const part of group.children) {
      const source=part.userData.part;
      part.position.set(...weaponPartPosition(source,pose));
      if(source.arm){
        const mesh=part as THREE.Mesh, data=weaponMesh(source,pose), positions=mesh.geometry.getAttribute('position');let n=0;
        for(const face of data.faces)for(let i=1;i<face.length-1;i++)for(const index of [face[0]!,face[i]!,face[i+1]!])positions.setXYZ(n++,...data.vertices[index]!);
        positions.needsUpdate=true;mesh.geometry.computeVertexNormals();mesh.geometry.computeBoundingSphere();
      }
    }
    this.flash.position.set(...weaponMuzzle(player.weapon));
    this.flash.visible = pose.flash > 0; this.flash.scale.setScalar(.6 + pose.flash * .7);
    for (const actor of state.actors) {
      if (actor.id === player.id) continue;
      let model = this.actors.get(actor.id);
      if (!model) {
        const geometry=new THREE.BufferGeometry(),colors:number[]=[];
        geometry.setAttribute('position',new THREE.Float32BufferAttribute(new Float32Array(targetTriangles.length*9),3));
        for(const face of targetTriangles){const color=new THREE.Color(targetColor(face.color,actor.team===player.team,face.region));for(let i=0;i<3;i++)colors.push(color.r,color.g,color.b);}
        geometry.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));
        const material=new THREE.MeshStandardMaterial({vertexColors:true,roughness:.85,metalness:.08});
        model=new THREE.Mesh(geometry,material);model.frustumCulled=false;
        this.geometries.add(geometry);this.materials.add(material);this.scene.add(model);this.actors.set(actor.id,model);
      }
      const reaction=this.feedback.actor(actor),vertices=targetVertices(actor,reaction.fall-reaction.flinch);
      const positions=model.geometry.getAttribute('position') as THREE.BufferAttribute;
      let offset=0;
      for(const face of targetTriangles)for(const index of [...face.indices].reverse()){
        const [x,y,z]=vertices[index]!;positions.setXYZ(offset++,x,y,-z);
      }
      positions.needsUpdate=true;model.geometry.computeVertexNormals();model.visible=reaction.visible;
    }
    const visibleImpacts=effects.filter(e=>e.age<180&&e.shot.impact!.kind!=='range');
    while(this.impacts.length<visibleImpacts.length){
      const mesh=new THREE.Mesh(new THREE.SphereGeometry(.035,5,3),new THREE.MeshBasicMaterial({color:0xe6c49a,depthWrite:false}));
      this.scene.add(mesh);this.geometries.add(mesh.geometry);this.materials.add(mesh.material);this.impacts.push(mesh);
    }
    for(const [i,mesh]of this.impacts.entries()){
      const event=visibleImpacts[i];mesh.visible=!!event;if(!event)continue;
      const impact=event.shot.impact!,dx=impact.origin.x-impact.end.x,dy=impact.origin.y-impact.end.y,dz=impact.origin.z-impact.end.z,length=Math.hypot(dx,dy,dz)||1;
      mesh.position.set(...toThree({x:impact.end.x+dx/length*.018,y:impact.end.y+dy/length*.018,z:impact.end.z+dz/length*.018}));
      mesh.scale.setScalar((1-event.age/180)*(impact.kind==='actor'?1.2:1.8));
    }
    this.bomb.visible = state.bomb.planted || !state.bomb.carrier;
    this.bomb.position.set(...toThree(state.bomb.position));
    this.renderer.render(this.scene, this.camera);
  }
  reset() {this.feedback.reset();for(const mesh of this.impacts)mesh.visible=false;}
  dispose() { for (const g of this.geometries) g.dispose(); for (const m of this.materials) m.dispose(); for(const t of this.textures)t.dispose(); this.renderer.dispose(); }
}
