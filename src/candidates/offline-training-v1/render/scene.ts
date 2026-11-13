type ObserverCamera = { position: { x: number; y: number; z: number }; yaw: number; pitch: number; fov: number };
type DressingFactory = (scene: THREE.Scene, track: { geometry(geometry: THREE.BufferGeometry): void; material(material: THREE.Material): void; texture(texture: THREE.Texture): void }) => void;
import * as THREE from 'three';
import { AiMaterials, FullAiMaterials, aiMaterialsEnabled } from './ai-materials.js';
import { fullAiMaterialsEnabled, type KitSurface } from './ai-surface.js';
import { createLightingPost } from './lighting-post.js';
import { createCourtyardSky, type CourtyardSky } from './courtyard-sky.js';
import { LIGHTING_ID, lightingEnabled, renderRole } from './lighting-style.js';
import { ArtStandards, artEnabled, type ArtSlot } from './art-standards.js';
import { KIT, environmentEnabled, makeKitWall, kitTexture, floorPixels, kitBudget, createWallGrime, courtyardFaces, wallSeamGeometry } from './environment-kit.js';
import { groundLevels, groundUV, createGroundSurface } from './ground.js';
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
  private lighting = lightingEnabled(globalThis.location?.search ?? '');
  private post: ReturnType<typeof createLightingPost> | undefined;
  private sky: CourtyardSky | undefined;
  private environment = environmentEnabled(globalThis.location?.search ?? '');
  private environmentPresented = false;
  private artPresented = false;
  private aiMaterials: AiMaterials | FullAiMaterials | undefined;
  private art: ArtStandards | undefined;
  private artSlots: ArtSlot[] = [];
  get info() { return { ...(this.aiMaterials ? { materials: this.aiMaterials.info } : {}), lighting: { id:this.lighting?LIGHTING_ID:'baseline', environment:this.lighting?'hemisphere-and-ambient':'hemisphere', ao:this.lighting?'deterministic-ssao-half-resolution':'none', grade:this.lighting?'cool-shadows-warm-highlights':'none' }, ...(this.art ? { art: { ...this.art.info, active: this.artPresented } } : {}), ...(this.environment ? { environment: { id: KIT.id, active: this.environmentPresented, budget: kitBudget(MAP.walls.length), evidence: 'offline-estimate' } } : {}), memory: { ...this.renderer.info.memory }, calls: this.renderer.info.render.calls }; }
  readonly renderer!: THREE.WebGLRenderer;
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
  private dressingTextures = new Set<THREE.Texture>();
  private readonly captureSize?: { width: number; height: number };
  private readonly dressingFactory?: DressingFactory;
  constructor(canvas: HTMLCanvasElement, captureSize?: { width: number; height: number }, dressingFactory?: DressingFactory) {
    this.captureSize = captureSize; this.dressingFactory = dressingFactory;
    this.geometries.add(this.flash.geometry); this.materials.add(this.flash.material);
    try {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance', preserveDrawingBuffer: !!captureSize });
    this.renderer.setPixelRatio(captureSize ? 1 : Math.min(devicePixelRatio, 1.5));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    const sky = this.environment ? KIT.sky : YARD.sky;
    const fog = this.lighting ? 0xafbdbd : sky;
    this.scene.background = new THREE.Color(fog);
    this.scene.fog = new THREE.Fog(fog, this.lighting ? 46 : 32, this.lighting ? 118 : 80);
    // Sky and ground bounce only. The single sun still carries the modelling and
    // the long shadows; no second directional or broad omni light is added.
    this.scene.add(new THREE.HemisphereLight(this.lighting?0x9fbcd8:0xb9e7ff, this.lighting?0x6a6352:0x32413b, this.lighting?0.62:2.1));
    const sun = new THREE.DirectionalLight(this.lighting?0xffe4b8:0xffdba8, this.lighting?3.55:2.6);
    // Schooled from the rear-right: the west wall, north training wall and both
    // equipment clusters keep a continuous lit face, while the canopy side falls
    // into a readable cool shade instead of a single black wall.
    if (this.lighting) sun.position.set(18, 21, 16); else sun.position.set(-26, 22, 10);
    this.scene.add(sun); this.scene.add(sun.target);
    if(this.lighting){
      sun.target.position.set(0, 0, -1); sun.target.updateMatrixWorld();
      this.renderer.toneMapping=THREE.ACESFilmicToneMapping;this.renderer.toneMappingExposure=1.02;
      this.renderer.shadowMap.enabled=true;this.renderer.shadowMap.type=THREE.PCFSoftShadowMap;
      sun.castShadow=true;sun.shadow.mapSize.set(2048,2048);
      // The cascade covers the training floor and low props only; the far wall
      // caps and the observation block stay outside it, keeping texels dense.
      Object.assign(sun.shadow.camera,{left:-17,right:17,top:17,bottom:-17,near:1,far:70});
      sun.shadow.camera.updateProjectionMatrix();sun.shadow.normalBias=.03;sun.shadow.bias=-.00016;
      this.sky=createCourtyardSky(this.renderer,sun.position);
      this.scene.add(this.sky.mesh);
      this.geometries.add(this.sky.mesh.geometry);this.materials.add(this.sky.mesh.material);
      if(this.sky.environment){
        this.scene.environment=this.sky.environment.texture;this.scene.environmentIntensity=.45;
      }
      this.post=createLightingPost(this.renderer,this.scene,this.camera);
    }
    const floor=this.box(this.scene, [0, -0.15, 0], [27, 0.3, 37], 0xffffff);
    const base=groundLevels[0]!,texture=this.environment ? kitTexture(floorPixels(),256,256) : new THREE.DataTexture(base.rgba,base.size,base.size);
    if (!this.environment) {
      texture.mipmaps=groundLevels.map(mip=>({data:mip.rgba,width:mip.size,height:mip.size}));
      texture.minFilter=THREE.LinearMipmapLinearFilter;
    }
    texture.colorSpace=THREE.SRGBColorSpace;texture.wrapS=texture.wrapT=THREE.RepeatWrapping;
    texture.magFilter=THREE.LinearFilter;texture.anisotropy=1;texture.needsUpdate=true;this.textures.add(texture);
    const positions=floor.geometry.getAttribute('position'),uv=floor.geometry.getAttribute('uv');
    for(let i=0;i<positions.count;i++)uv.setXY(i,...(this.environment ? [positions.getX(i)/4,-positions.getZ(i)/4] as const : groundUV(positions.getX(i),-positions.getZ(i))));uv.needsUpdate=true;
    const material=floor.material as THREE.MeshStandardMaterial;material.map=texture;material.roughness=.95;material.metalness=0;
    // Presentation-only floor dressing shares one courtyard-space frame: broad
    // wear and traffic in albedo, plus a shallow bump and a polished-path mask.
    const groundSurface=createGroundSurface(Math.min(4,(this.renderer.capabilities?.getMaxAnisotropy?.() ?? 1)));
    if(groundSurface){
      const overlayUv=new Float32Array(positions.count*2);
      for(let i=0;i<positions.count;i++){overlayUv[i*2]=(positions.getX(i)+13.5)/27;overlayUv[i*2+1]=(-positions.getZ(i)+18.5)/37;}
      floor.geometry.setAttribute('uv1',new THREE.BufferAttribute(overlayUv,2));
      groundSurface.roughness.channel=1;groundSurface.bump.channel=1;
      material.roughnessMap=groundSurface.roughness;material.roughness=1;
      material.bumpMap=groundSurface.bump;material.bumpScale=.014;
      material.onBeforeCompile=shader=>{
        shader.uniforms.groundWear={value:groundSurface.overlay};
        shader.vertexShader='varying vec2 vGroundWearUv;\n'+shader.vertexShader;
        shader.vertexShader=shader.vertexShader.replace('#include <uv_vertex>',`#include <uv_vertex>
#ifdef USE_UV1
vGroundWearUv=uv1;
#else
vGroundWearUv=vec2(.5);
#endif`);
        shader.fragmentShader='uniform sampler2D groundWear; varying vec2 vGroundWearUv;\n'+shader.fragmentShader;
        shader.fragmentShader=shader.fragmentShader.replace('#include <map_fragment>',`#include <map_fragment>
#ifdef USE_MAP
vec4 groundWearTexel=texture2D(groundWear,vGroundWearUv);
diffuseColor.rgb*=mix(vec3(1.0),groundWearTexel.rgb,.8);
#endif`);
      };
      material.customProgramCacheKey=()=>'courtyard-ground-wear-v1';
      for(const surfaceTexture of [groundSurface.overlay,groundSurface.roughness,groundSurface.bump])this.textures.add(surfaceTexture);
    }
    const aiWalls: KitSurface[] = [];
    let aiWall: THREE.Mesh<THREE.BufferGeometry,THREE.MeshStandardMaterial> | undefined;
    for (const wall of MAP.walls) {
      if (this.environment) {
        const piece = makeKitWall(wall);
        aiWalls.push({ id: wall.id, mesh: piece.mesh });
        if(wall.id==='left-divider')aiWall=piece.mesh;
        this.scene.add(piece.mesh); this.geometries.add(piece.geometry); this.materials.add(piece.material); this.textures.add(piece.texture);
        if (wall.id === 'center-dogleg' || wall.id === 'site-cover') this.artSlots.push({ id: wall.id, position: toThree({ ...wall.center, y: wall.center.y - wall.half.y }), fallback: [piece.mesh] });
        continue;
      }
      const texture=new THREE.DataTexture(wallStrip(wall),1,128);texture.colorSpace=THREE.SRGBColorSpace;texture.needsUpdate=true;this.textures.add(texture);
      const side=new THREE.MeshStandardMaterial({map:texture,roughness:.95,metalness:0}),top=new THREE.MeshStandardMaterial({color:YARD.cap,roughness:.9});
      const geometry=new THREE.BoxGeometry(wall.half.x*2,wall.half.y*2,wall.half.z*2);
      // Keep identical box triangles, but batch the five painted faces together.
      const indices=Array.from(geometry.index!.array);geometry.setIndex([...indices.slice(0,12),...indices.slice(18),...indices.slice(12,18)]);geometry.clearGroups();geometry.addGroup(0,30,0);geometry.addGroup(30,6,1);
      const mesh=new THREE.Mesh(geometry,[side,top]);
      mesh.position.set(...toThree(wall.center));this.scene.add(mesh);this.geometries.add(geometry);this.materials.add(side);this.materials.add(top);
    }
    if (this.environment && this.dressingFactory) this.dressingFactory(this.scene, {
      geometry: geometry => this.geometries.add(geometry),
      material: material => this.materials.add(material),
      // Dressing textures have their own ownership set: the kit's measured
      // floor/wall texture budget stays unchanged.
      texture: texture => this.dressingTextures.add(texture),
    });
    if (this.environment) {
      // Two non-shadowing work lamps reveal the galvanised canopy underside and
      // make the covered training bay legible without lifting the open yard.
      // Their pools stop at the canopy edge so the sun stays the key light.
      for (const z of [4, 11]) {
        const workLight = new THREE.PointLight(0xffc982, 9, 7.5, 2);
        workLight.position.set(-8.4, 2.7, -z); this.scene.add(workLight);
      }
      const faces = courtyardFaces(MAP.walls);
      // Rain wash and a proud contact plinth separate wall foot from floor.
      const grime = createWallGrime();
      if (grime) {
        this.materials.add(grime.material); this.textures.add(grime.texture);
        for (const face of faces) {
          // Half-metre dust and rain band at the foot, its uneven top crossing
          // the painted plinth so it reads as weathering rather than a stripe.
          const plane = new THREE.PlaneGeometry(face.width, 1.2);
          const planeUv = plane.getAttribute('uv');
          for (let i = 0; i < planeUv.count; i++) planeUv.setX(i, planeUv.getX(i) * Math.max(1, face.width / 4));
          planeUv.needsUpdate = true;
          const mesh = new THREE.Mesh(plane, grime.material);
          mesh.position.set(face.center.x, .6, face.center.z);
          mesh.rotation.y = face.rotationY;
          this.scene.add(mesh); this.geometries.add(plane);
        }
      }
      // Panel seams are actual thin geometry, so the sun rakes over them.
      const seams = wallSeamGeometry(faces);
      if (seams) {
        const seamMaterial = new THREE.MeshStandardMaterial({ color: 0x6d746d, roughness: .82, metalness: .08 });
        const mesh = new THREE.Mesh(seams, seamMaterial);
        this.scene.add(mesh); this.geometries.add(seams); this.materials.add(seamMaterial);
      }
      // Maintenance bays get their own warm work light; the roller-door lamp is
      // deliberately short-range so its bloom cannot rival the sun.
      for (const [x, z] of [[3.15, 16.75], [-5.1, -2.6]] as const) {
        const bayLight = new THREE.PointLight(0xffc17a, 3.2, 4.2, 2);
        bayLight.position.set(x, 2.55, -z); this.scene.add(bayLight);
      }
    }
    if (fullAiMaterialsEnabled(globalThis.location?.search ?? '')) { this.aiMaterials = new FullAiMaterials(); void this.aiMaterials.start(material, aiWalls); }
    else if(aiWall && aiMaterialsEnabled(globalThis.location?.search ?? '')) {this.aiMaterials=new AiMaterials();void this.aiMaterials.start(material,aiWall);}
    for (const [i, route] of MAP.routes.entries()) {
      const x = route[0]!.x;
      for (let z = -15; z < 8; z += 2.7) this.box(this.scene, toThree({ x, y: 0.015, z }), [0.12, 0.02, 1], i === 1 ? 0xf8b44c : 0x55bab2, true);
      this.box(this.scene, toThree({ x, y: 0.02, z: -16 }), [2.5, 0.04, 0.15], 0xf8b44c, true);
    }
    const ring = new THREE.Mesh(new THREE.RingGeometry(MAP.siteRadius - 0.08, MAP.siteRadius, 48), new THREE.MeshBasicMaterial({ color: 0xffc666, side: THREE.DoubleSide }));
    this.geometries.add(ring.geometry); this.materials.add(ring.material);
    ring.rotation.x = -Math.PI / 2; ring.position.set(...toThree({ ...MAP.site, y: 0.025 })); this.scene.add(ring);
    for (const x of [-11.5, 11.5]) for (const z of [-13, 6, 15]) {
      const pole = this.box(this.scene, toThree({ x, y: 2.5, z }), [0.12, 5, 0.12], 0x26323b);
      const head = this.box(this.scene, toThree({ x, y: 4.8, z }), [0.8, 0.12, 0.35], 0xffe7ad, true);
      if (x === -11.5 && z === -13) this.artSlots.push({ id: 'lamp-existing', position: toThree({ x, y: 0, z }), fallback: [pole, head] });
    }
    this.box(this.bomb, [0, 0.18, 0], [0.44, 0.36, 0.35], 0x16252d);
    this.box(this.bomb, [0, 0.38, 0], [0.3, 0.06, 0.12], 0xf6a738, true);
    this.scene.add(this.bomb);
    this.makeWeapon(this.rifle, false); this.makeWeapon(this.pistol, true);
    this.weapon.add(this.rifle, this.pistol, this.flash); this.flash.position.set(0.01, 0.03, -0.7); this.flash.visible = false;
    this.weapon.userData.lightingCue=true;
    this.camera.add(this.weapon); this.scene.add(this.camera);
    if (artEnabled(globalThis.location?.search ?? '')) { this.art = new ArtStandards(this.scene, this.artSlots, undefined, undefined, this.aiMaterials instanceof FullAiMaterials ? this.aiMaterials.registerArt : undefined); void this.art.start(); }
    this.resize();
    } catch (error) { this.dispose(); throw error; }
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
    const w = this.captureSize?.width ?? canvas.clientWidth, h = this.captureSize?.height ?? canvas.clientHeight;
    this.renderer.setSize(w, h, false); this.camera.aspect = w / Math.max(1, h); this.camera.updateProjectionMatrix();
    this.post?.resize(w,h,this.renderer.getPixelRatio());
  }
  render(state: GameState, player: Actor, yaw: number, pitch: number, now: number, dt: number, observer?: ObserverCamera) {
    this.environmentPresented = false; this.artPresented = false;
    const pose = weaponPose(state, player), effects=this.feedback.update(state,now);
    cameraPose(this.camera, observer?.position ?? eye(player), observer?.yaw ?? yaw, observer?.pitch ?? pitch);
    const fov = observer?.fov ?? 80;
    if (this.camera.fov !== fov) { this.camera.fov = fov; this.camera.updateProjectionMatrix(); }
    this.weapon.position.set(pose.x, pose.y, pose.z);
    this.weapon.rotation.set(pose.pitch, 0, pose.roll, 'ZYX');
    this.weapon.visible = !observer && player.hp > 0;
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
      if (!observer && actor.id === player.id) continue;
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
    if(this.post){
      if(this.sky)this.sky.mesh.position.copy(this.camera.position);
      // Include late-loaded art and actors, without changing meshes or their materials.
      this.scene.traverse(o=>{if(o instanceof THREE.Mesh){const world=renderRole(o)==='world';o.castShadow=world&&!o.userData.noShadow;o.receiveShadow=world;for(const m of Array.isArray(o.material)?o.material:[o.material])if(m instanceof THREE.MeshBasicMaterial)m.toneMapped=false;}});
      this.post.render();
    }else this.renderer.render(this.scene, this.camera);
    this.environmentPresented = this.environment; this.artPresented = this.art?.info.state === 'ready';
  }
  reset() {this.artPresented=false;this.environmentPresented=false;this.feedback.reset();for(const mesh of this.impacts)mesh.visible=false;}
  dispose() { this.artPresented=false; this.art?.dispose(); this.aiMaterials?.dispose(); this.sky?.dispose(); this.post?.dispose(); if(this.lighting)this.scene.traverse(o=>{if(o instanceof THREE.DirectionalLight)o.shadow.dispose();}); this.environmentPresented=false;for (const g of this.geometries) g.dispose(); for (const m of this.materials) m.dispose(); for(const t of this.textures)t.dispose(); for(const t of this.dressingTextures)t.dispose(); this.renderer?.dispose(); }
}
