import * as THREE from 'three';
import { KIT } from './environment-kit.js';

export const FULL_MATERIALS_ID = 'ai-courtyard-full-v1';
export function fullAiMaterialsEnabled(search: string) {
  const p = new URLSearchParams(search);
  return p.getAll('materials').length === 1 && p.get('materials') === FULL_MATERIALS_ID &&
    p.getAll('environment').length === 1 && p.get('environment') === KIT.id;
}
export type KitSurface = { id: string; mesh: THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial> };
export function atlasBaseColor(id: string) { return id.endsWith('-cover') ? 0x9aaba8 : KIT.plaster; }
/** Separate side-band attributes: authored atlas UVs, vertex colors and triangles never change. */
export function surfaceAttributes(mesh: THREE.Mesh, vertexPalette: boolean) {
  mesh.updateWorldMatrix(true, false);
  const g = mesh.geometry, p = g.getAttribute('position'), n = g.getAttribute('normal'), c = g.getAttribute('color');
  if (!p || !n || (vertexPalette && !c)) throw Error('ai-surface-contract');
  const uv = new Float32Array(p.count * 2), mask = new Float32Array(p.count);
  const origin = new THREE.Vector3().setFromMatrixPosition(mesh.matrixWorld);
  const normalMatrix = new THREE.Matrix3().getNormalMatrix(mesh.matrixWorld);
  const point = new THREE.Vector3(), normal = new THREE.Vector3(), plaster = new THREE.Color(KIT.plaster);
  for (let i = 0; i < p.count; i++) {
    point.fromBufferAttribute(p, i).applyMatrix4(mesh.matrixWorld).sub(origin);
    normal.fromBufferAttribute(n, i).applyMatrix3(normalMatrix).normalize();
    uv[i * 2] = (Math.abs(normal.x) > Math.abs(normal.z) ? point.z : point.x) / 4;
    uv[i * 2 + 1] = point.y / 4;
    const vertical = Math.abs(normal.y) < .7;
    const isPlaster = !vertexPalette || Math.hypot(c!.getX(i) - plaster.r, c!.getY(i) - plaster.g, c!.getZ(i) - plaster.b) < .005;
    mask[i] = vertical && isPlaster ? 1 : 0;
  }
  return { uv: new THREE.BufferAttribute(uv, 2), mask: new THREE.BufferAttribute(mask, 1), eligibleVertices: mask.reduce((a, b) => a + b, 0) };
}
export function bindSurface(mesh: THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>, texture: THREE.Texture, kind: 'atlas' | 'vertex', baseColor: number = KIT.plaster) {
  const { uv, mask, eligibleVertices } = surfaceAttributes(mesh, kind === 'vertex');
  if (!eligibleVertices) throw Error('ai-surface-empty');
  const geometry = mesh.geometry, material = mesh.material;
  const oldUV = geometry.getAttribute('aiSurfaceUv'), oldMask = geometry.getAttribute('aiSurfaceMask');
  const oldHook = material.onBeforeCompile, oldKey = material.customProgramCacheKey;
  geometry.setAttribute('aiSurfaceUv', uv); geometry.setAttribute('aiSurfaceMask', mask);
  material.onBeforeCompile = (shader, renderer) => {
    oldHook.call(material, shader, renderer);
    shader.uniforms.aiPlaster = { value: texture };
    shader.uniforms.aiOriginalPlaster = { value: new THREE.Color(baseColor) };
    shader.vertexShader = 'attribute vec2 aiSurfaceUv; attribute float aiSurfaceMask; varying vec2 vAiSurfaceUv; varying float vAiSurfaceMask;\n' + shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace('#include <uv_vertex>', '#include <uv_vertex>\nvAiSurfaceUv=aiSurfaceUv; vAiSurfaceMask=aiSurfaceMask;');
    shader.fragmentShader = 'uniform sampler2D aiPlaster; uniform vec3 aiOriginalPlaster; varying vec2 vAiSurfaceUv; varying float vAiSurfaceMask;\n' + shader.fragmentShader;
    if (kind === 'atlas') shader.fragmentShader = shader.fragmentShader.replace('#include <map_fragment>', `
#ifdef USE_MAP
vec4 sampledDiffuseColor=texture2D(map,vMapUv);
float plasterMask=(1.0-smoothstep(0.01,0.04,distance(sampledDiffuseColor.rgb,aiOriginalPlaster)))*vAiSurfaceMask;
sampledDiffuseColor.rgb=mix(sampledDiffuseColor.rgb,texture2D(aiPlaster,vAiSurfaceUv).rgb,plasterMask);
diffuseColor*=sampledDiffuseColor;
#endif`);
    else shader.fragmentShader = shader.fragmentShader.replace('#include <color_fragment>', `
#if defined(USE_COLOR) || defined(USE_COLOR_ALPHA)
// Replace the plaster vertex tint, rather than multiply it by another albedo.
vec3 aiVertexColor=mix(vColor.rgb,texture2D(aiPlaster,vAiSurfaceUv).rgb,vAiSurfaceMask);
diffuseColor.rgb*=aiVertexColor;
#ifdef USE_COLOR_ALPHA
diffuseColor.a*=vColor.a;
#endif
#endif`);
  };
  material.customProgramCacheKey = () => FULL_MATERIALS_ID + ':' + kind;
  material.needsUpdate = true;
  let restored = false;
  return { eligibleVertices, restore() {
    if (restored) return; restored = true;
    material.onBeforeCompile = oldHook; material.customProgramCacheKey = oldKey; material.needsUpdate = true;
    if (oldUV) geometry.setAttribute('aiSurfaceUv', oldUV); else geometry.deleteAttribute('aiSurfaceUv');
    if (oldMask) geometry.setAttribute('aiSurfaceMask', oldMask); else geometry.deleteAttribute('aiSurfaceMask');
  } };
}
