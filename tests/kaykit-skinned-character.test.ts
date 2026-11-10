import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { KayKitCharacterSlot, remapKayKitParent } from '../src/render/kaykit-skinned-character.js';

test('unused skinned slot does not load or change the rigid fallback', () => {
  const slot = new KayKitCharacterSlot();
  assert.equal(slot.status, 'off'); assert.equal(slot.character, null);
  slot.dispose(); slot.dispose(); assert.equal(slot.status, 'disposed');
});
test('missing, failed and invalid sources keep the slot in fallback', async () => {
  for (const loader of [async () => null, async () => { throw new Error('HTTP 404'); },
    async () => ({ character: new THREE.Group(), motion: new THREE.Group(), animations: [] })]) {
    const slot = new KayKitCharacterSlot(); await slot.load(loader);
    assert.equal(slot.status, 'fallback'); assert.equal(slot.character, null); assert.ok(slot.error);
    slot.dispose(); assert.equal(slot.status, 'disposed');
  }
});
test('dispose cancels pending load; late success/failure cannot resurrect a slot', async () => {
  for (const fail of [false, true]) {
    const slot = new KayKitCharacterSlot();
    let release!: () => void;
    const pending = slot.load(async signal => {
      await new Promise<void>(resolve => { release = resolve; });
      assert.equal(signal.aborted, true);
      if (fail) throw new Error('late failure');
      return { character: new THREE.Group(), motion: new THREE.Group(), animations: [] };
    });
    assert.equal(slot.status, 'loading'); slot.dispose(); release(); await pending;
    assert.equal(slot.status, 'disposed'); assert.equal(slot.character, null); assert.equal(slot.error, null);
    await slot.load(async () => { assert.fail('Disposed slot must not load'); });
  }
});
test('parent adapter rejects missing hierarchy rather than silently dropping tracks', () => {
  assert.throws(() => remapKayKitParent(new THREE.Group(), new THREE.Group(), new THREE.AnimationClip()), /Unique node/);
});
