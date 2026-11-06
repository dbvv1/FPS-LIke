import * as THREE from 'three';
import { DAMAGE_CUE_COLOR, DAMAGE_RECTS } from './combat-feedback.js';

export function createDamageFrame() {
  const vertices: number[] = [];
  for (const [x, y, width, height] of DAMAGE_RECTS) {
    const left = x - width / 2, right = x + width / 2, bottom = y - height / 2, top = y + height / 2;
    vertices.push(left, bottom, 0, right, bottom, 0, right, top, 0, left, bottom, 0, right, top, 0, left, top, 0);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  geometry.computeVertexNormals();
  const material = new THREE.MeshBasicMaterial({ color: DAMAGE_CUE_COLOR, transparent: true, opacity: 0, depthTest: false, depthWrite: false, fog: false, toneMapped: false });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.userData.lightingCue = true; mesh.renderOrder = 100; mesh.visible = false; mesh.position.z = -.25;
  return { mesh, geometry, material,
    update(strength: number, camera: THREE.PerspectiveCamera) {
      const height = .25 * Math.tan(camera.fov * Math.PI / 360);
      mesh.scale.set(height * camera.aspect, height, 1);
      material.opacity = Math.max(0, Math.min(1, strength)) * .55;
      mesh.visible = material.opacity > 0;
    },
    reset() { mesh.visible = false; material.opacity = 0; },
  };
}
