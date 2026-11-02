import { FULL_MATERIALS_ID, bindSurface, atlasBaseColor, type KitSurface } from './ai-surface.js';
import * as THREE from 'three';
const groundURL = new URL('../../../../assets/environment/ai-courtyard-v1/ground.webp', import.meta.url).href;
const wallURL = new URL('../../../../assets/environment/ai-courtyard-v1/wall.webp', import.meta.url).href;
import { KIT } from './environment-kit.js';

export const AI_MATERIALS_ID = 'ai-courtyard-v1';
export function aiMaterialsEnabled(search: string) {
  const p = new URLSearchParams(search);
  return p.getAll('materials').length === 1 && p.get('materials') === AI_MATERIALS_ID && p.getAll('environment').length === 1 && p.get('environment') === 'courtyard-v1';
}
/** Two original albedo standards on existing geometry; no additional render pass. */
export class AiMaterials {
  private state: 'loading' | 'ready' | 'fallback' = 'loading';
  private disposed = false;
  private textures: THREE.Texture[] = [];
  get info() { return { id: AI_MATERIALS_ID, state: this.state, scope: 'floor-and-left-divider', tileMetres: 4, dimensions: [1254,1254], colorSpace: 'srgb', mipmaps: true, anisotropy: 1, transferBytes: 263916, estimatedRGBA8MipBytes: 16768144, actualGPUFormat: 'not-observed', extraPasses: 0 }; }
  async start(floor: THREE.MeshStandardMaterial, wall: THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>) {
    const loader = new THREE.TextureLoader();
    // Retain every successful load even if its sibling fails or disposal wins the race.
    const load = async (url: string) => {
      const t = await loader.loadAsync(url);
      if (this.disposed) { t.dispose(); throw new Error('Material owner disposed'); }
      this.textures.push(t); t.colorSpace = THREE.SRGBColorSpace;
      t.wrapS = t.wrapT = THREE.RepeatWrapping; t.generateMipmaps = true;
      t.minFilter = THREE.LinearMipmapLinearFilter; t.magFilter = THREE.LinearFilter; t.anisotropy = 1;
      return t;
    };
    try {
      const [ground, plaster] = await Promise.all([load(groundURL), load(wallURL)]);
      if (this.disposed) return;
      // Existing floor UV already expresses a 4 m repeat. Keep all wall atlas paint.
      const pos = wall.geometry.getAttribute('position'), normal = wall.geometry.getAttribute('normal');
      const uv = new Float32Array(pos.count * 2);
      for (let i=0;i<pos.count;i++) {
        uv[i*2] = (Math.abs(normal.getX(i)) > .5 ? pos.getZ(i) : pos.getX(i)) / 4;
        uv[i*2+1] = (Math.abs(normal.getY(i)) > .5 ? pos.getZ(i) : pos.getY(i)) / 4;
      }
      wall.geometry.setAttribute('aiSurfaceUv', new THREE.BufferAttribute(uv,2));
      const originalPlaster = new THREE.Color(KIT.plaster);
      wall.material.onBeforeCompile = shader => {
        shader.uniforms.aiPlaster = {value:plaster}; shader.uniforms.aiOriginalPlaster = {value:originalPlaster};
        shader.vertexShader = 'attribute vec2 aiSurfaceUv; varying vec2 vAiSurfaceUv;\n' + shader.vertexShader;
        shader.vertexShader = shader.vertexShader.replace('#include <uv_vertex>', '#include <uv_vertex>\nvAiSurfaceUv=aiSurfaceUv;');
        shader.fragmentShader = 'uniform sampler2D aiPlaster; uniform vec3 aiOriginalPlaster; varying vec2 vAiSurfaceUv;\n' + shader.fragmentShader;
        shader.fragmentShader = shader.fragmentShader.replace('#include <map_fragment>', `
#ifdef USE_MAP
vec4 sampledDiffuseColor=texture2D(map,vMapUv);
float plasterMask=1.0-smoothstep(0.01,0.04,distance(sampledDiffuseColor.rgb,aiOriginalPlaster));
sampledDiffuseColor.rgb=mix(sampledDiffuseColor.rgb,texture2D(aiPlaster,vAiSurfaceUv).rgb,plasterMask);
diffuseColor*=sampledDiffuseColor;
#endif`);
      };
      wall.material.customProgramCacheKey = () => AI_MATERIALS_ID;
      wall.material.needsUpdate = true; floor.map = ground; floor.needsUpdate = true;
      this.state = 'ready';
    } catch {
      this.state = 'fallback';
      // Promise.allSettled is unnecessary: late successful loads remain owned until disposal.
    }
  }
  dispose() { this.disposed=true; for(const t of this.textures)t.dispose(); this.textures=[]; }
}

/** Whole-courtyard candidate. Its texture lifetime is independent of authored GLB lifetime. */
export class FullAiMaterials {
  private disposed = false;
  private started = false;
  private state: 'idle' | 'loading' | 'ready' | 'fallback' | 'disposed' = 'idle';
  private textures = new Set<THREE.Texture>();
  private plaster: THREE.Texture | undefined;
  private restoreFloor: (() => void) | undefined;
  private wallBindings: ReturnType<typeof bindSurface>[] = [];
  private wallIds: string[] = [];
  private roots = new Map<THREE.Object3D, { id: string; bindings: ReturnType<typeof bindSurface>[] }>();
  get info() { return { id: FULL_MATERIALS_ID, state: this.state, scope: 'floor-and-all-courtyard-walls', wallIds: [...this.wallIds], atlasSideVertices: this.wallBindings.reduce((n,b)=>n+b.eligibleVertices,0), registeredRoots: this.roots.size, authoredCoverage: [...this.roots.values()].filter(r=>r.bindings.length).map(r=>({id:r.id, plasterVertices:r.bindings.reduce((n,b)=>n+b.eligibleVertices,0)})), authoredIds: [...this.roots.values()].filter(r => r.bindings.length).map(r => r.id), tileMetres: 4, dimensions: [1254,1254], colorSpace: 'srgb', mipmaps: true, anisotropy: 1, transferBytes: 263916, estimatedRGBA8MipBytes: 16768144, actualGPUFormat: 'not-observed', extraPasses: 0 }; }
  private bindRoot(root: THREE.Object3D, record: { id: string; bindings: ReturnType<typeof bindSurface>[] }) {
    if (!this.plaster || this.disposed || record.bindings.length) return;
    try {
      root.traverse(o => {
        if (!(o instanceof THREE.Mesh)) return;
        if (!(o.material instanceof THREE.MeshStandardMaterial) || o.material.name !== 'Shared_Matte_VertexPalette' || !o.material.vertexColors) throw Error('ai-authored-material-contract');
        record.bindings.push(bindSurface(o as THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>, this.plaster!, 'vertex'));
      });
      if (!record.bindings.length) throw Error('ai-authored-empty');
    } catch (error) { for (const binding of record.bindings) binding.restore(); record.bindings = []; throw error; }
  }
  /** Called only after ArtStandards validates its unchanged, texture-free source. */
  registerArt = (id: string, root: THREE.Object3D): (() => void) => {
    if (this.disposed || (id !== 'center-dogleg' && id !== 'site-cover')) return () => {};
    if (this.roots.has(root)) throw Error('ai-authored-duplicate');
    const record = { id, bindings: [] as ReturnType<typeof bindSurface>[] };
    this.roots.set(root, record);
    try { this.bindRoot(root, record); } catch (error) { this.roots.delete(root); throw error; }
    return () => { for (const b of record.bindings) b.restore(); record.bindings = []; this.roots.delete(root); };
  };
  async start(floor: THREE.MeshStandardMaterial, walls: KitSurface[]) {
    if (this.started || this.disposed) return;
    this.started = true; this.state = 'loading';
    const loader = new THREE.TextureLoader();
    const load = async (url: string) => {
      const t = await loader.loadAsync(url);
      if (this.disposed) { t.dispose(); throw Error('ai-disposed'); }
      this.textures.add(t); t.colorSpace = THREE.SRGBColorSpace;
      t.wrapS = t.wrapT = THREE.RepeatWrapping; t.generateMipmaps = true;
      t.minFilter = THREE.LinearMipmapLinearFilter; t.magFilter = THREE.LinearFilter; t.anisotropy = 1;
      return t;
    };
    try {
      const [ground, plaster] = await Promise.all([load(groundURL), load(wallURL)]);
      if (this.disposed) return;
      this.plaster = plaster;
      for (const wall of walls) { this.wallBindings.push(bindSurface(wall.mesh, plaster, 'atlas', atlasBaseColor(wall.id))); this.wallIds.push(wall.id); }
      for (const [root, record] of this.roots) this.bindRoot(root, record);
      const original = floor.map; this.restoreFloor = () => { floor.map = original; floor.needsUpdate = true; };
      floor.map = ground; floor.needsUpdate = true; this.state = 'ready';
    } catch {
      this.restoreSurfaces(); this.state = this.disposed ? 'disposed' : 'fallback';
    }
  }
  private restoreSurfaces() {
    this.restoreFloor?.(); this.restoreFloor = undefined;
    for (const b of this.wallBindings) b.restore(); this.wallBindings = []; this.wallIds = [];
    for (const record of this.roots.values()) { for (const b of record.bindings) b.restore(); record.bindings = []; }
    this.plaster = undefined;
  }
  dispose() {
    if (this.disposed) return; this.disposed = true;
    this.restoreSurfaces(); this.roots.clear();
    for (const t of this.textures) t.dispose(); this.textures.clear(); this.state = 'disposed';
  }
}
