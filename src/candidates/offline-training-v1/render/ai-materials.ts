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
