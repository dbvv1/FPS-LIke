import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import source from '../../assets/weapons/rx24-rifle.json';
import { weaponParts, weaponMesh, weaponMuzzle, weaponPose, weaponPartPosition } from '../../src/candidates/offline-training-v1/render/weapon.js';
import { Game } from '../../src/candidates/offline-training-v1/sim/game.js';

test('one licensed rifle source is actually consumed with its detachable magazine and barrel-end muzzle', () => {
  const obj = readFileSync(new URL('../../assets/weapons/quaternius/AssaultRifle2_1.obj', import.meta.url));
  assert.equal(createHash('sha256').update(obj).digest('hex'), source.sourceSha256);
  const parts = weaponParts('rifle');
  for (const authored of source.parts) {
    const consumed = parts.find(part => part.id === authored.id);
    assert.ok(consumed); assert.deepEqual(weaponMesh(consumed), authored.mesh);
  }
  const magazines = parts.filter(part => part.role === 'magazine');
  assert.ok(magazines.length > 0);
  assert.ok(magazines.every(part => part.id?.startsWith('rifle-4-')));
  for (const part of parts) {
    const mesh = weaponMesh(part);
    assert.ok(mesh.vertices.every(vertex => vertex.length === 3 && vertex.every(Number.isFinite)));
    assert.ok(mesh.faces.every(face => face.length >= 3 && face.every(index => Number.isInteger(index) && index >= 0 && index < mesh.vertices.length)));
  }
  const front = Math.min(...source.parts.flatMap(part => part.mesh.vertices.map(v => v[2]! + part.position[2]!)));
  assert.ok(Math.abs(weaponMuzzle('rifle')[2] - front) < 1e-6);
  assert.deepEqual(weaponMuzzle('rifle'), source.muzzle);
  assert.equal(Object.isFrozen(weaponMuzzle('rifle')), true);
});

test('reload palm contacts an actual magazine face throughout exit and insertion, then returns to its foregrip', async () => {
  const part = source.parts.find(part => part.id === source.grip.partId)!;
  assert.ok(part.mesh.faces.some(face => JSON.stringify(face) === JSON.stringify(source.grip.face)));
  const surface = [0,1,2].map(axis => source.grip.face.reduce((sum,index) => sum + part.mesh.vertices[index]![axis]! + part.position[axis]!, 0) / source.grip.face.length);
  surface.forEach((n,axis) => assert.ok(Math.abs(n-source.grip.surface[axis]!) < 1e-6));
  const game = await Game.create(1);
  try {
    const state=game.state,actor=state.actors[0]!,parts=weaponParts('rifle');
    const hand=parts.find(part=>part.id==='support-palm')!,mag=parts.find(part=>part.id===source.grip.partId)!;
    actor.reload={weapon:'rifle',end:114000};
    for(const progress of [.18,.22,.35,.5,.65,.75,.78]){
      state.time=114000*progress;const pose=weaponPose(state,actor),palm=weaponPartPosition(hand,pose),magPosition=weaponPartPosition(mag,pose);
      const contact=surface.map((n,axis)=>n+magPosition[axis]!-mag.position[axis]!);
      assert.ok(Math.abs(palm[0]+Math.max(...weaponMesh(hand).vertices.map(v=>v[0]))-contact[0]!)<=.00201,'inner palm touches the real side face, not just its center');
      assert.ok(Math.abs(palm[1]-contact[1]!)<1e-6);assert.ok(Math.abs(palm[2]-contact[2]!)<1e-6);
    }
    state.time=114000;assert.deepEqual(weaponPartPosition(hand,weaponPose(state,actor)),hand.position);
    assert.ok(parts.some(part=>part.role==='bolt'),'visible closure part remains present');
  } finally {game.dispose();}
});
