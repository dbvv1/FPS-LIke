import * as THREE from 'three';
export const LIGHTING_ID = 'courtyard-light-v1';
export function lightingEnabled(search:string) {
  const values=new URLSearchParams(search).getAll('lighting');
  return values.length===1&&values[0]===LIGHTING_ID;
}
/** Camera-mounted weapon and emissive gameplay cues retain their own depth/shader path. */
export function renderRole(object:THREE.Object3D):'world'|'cue' {
  for(let node:THREE.Object3D|null=object;node;node=node.parent)if(node.userData.lightingCue)return 'cue';
  const material=(object as THREE.Mesh).material;
  return (Array.isArray(material)?material:[material]).some(m=>m instanceof THREE.MeshBasicMaterial)?'cue':'world';
}
