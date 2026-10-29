import test from 'node:test';
import assert from 'node:assert/strict';
import { qualityCaptureOptions, CAPTURE_SIZE } from '../../src/candidates/offline-training-v1/capture/quality-route.js';
import { CAMERAS } from '../../src/capture/cameras.js';
import { prepareReplay } from '../../src/candidates/offline-training-v1/capture/replay.js';
import { CaptureLifetime } from '../../src/capture/lifetime.js';
const route = '?gameplay=offline-training-v1&match=complete-v1&squads=offline-v1&environment=courtyard-v1&art=standards-v1';
test('quality capture requires explicit current route; existing three camera presets and 720p', () => {
  assert.equal(qualityCaptureOptions(route), null);
  assert.deepEqual(CAPTURE_SIZE, { width: 1280, height: 720 });
  assert.equal(qualityCaptureOptions(route + '&qualityCapture=gameplay')!.camera, undefined);
  for (const name of ['courtyard-gap', 'cross-lane'] as const) assert.deepEqual(qualityCaptureOptions(route + '&qualityCapture=' + name)!.camera, CAMERAS[name]);
  for (const key of ['gameplay','match','squads','environment','art']) {
    const p = new URLSearchParams(route); p.delete(key); p.set('qualityCapture','gameplay');
    assert.throws(() => qualityCaptureOptions('?' + p));
  }
  for (const suffix of ['&shot=gameplay','&artCapture=wall-lamp-observer','&contentSet=characters-v1','&seed=2','&t=10','&input=x','&frames=2','&art=standards-v1','&qualityCapture=gameplay']) assert.throws(() => qualityCaptureOptions(route + '&qualityCapture=gameplay' + suffix));
  assert.throws(() => qualityCaptureOptions(route + '&qualityCapture=unknown'));
});
test('frame stepping continues normal nine-bot commands deterministically; disposal blocks it', async () => {
  const lifetime = new CaptureLifetime();
  try {
    const a = await prepareReplay(lifetime), b = await prepareReplay(lifetime);
    const initial = a.game.stateHash;
    assert.equal(a.game.state.tick, 120); assert.equal(a.botIds.length, 9);
    assert.ok(a.game.state.actors.find(actor => actor.id === 'player')!.hp > 0);
    for (let frame = 1; frame <= 60; frame++) {
      a.advance(); b.advance();
      assert.equal(a.game.state.tick, 120 + frame);
      assert.equal(a.game.stateHash, b.game.stateHash);
      assert.deepEqual(a.commands, b.commands);
    }
    assert.notEqual(initial, a.game.stateHash);
    assert.equal(a.commands.length, 180);
    lifetime.dispose(); assert.throws(() => a.advance(), /cancelled/);
  } finally { lifetime.dispose(); }
});
