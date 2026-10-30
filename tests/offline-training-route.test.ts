import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { movementCandidateEnabled, offlineTrainingCandidateEnabled } from '../src/candidate-route.js';
import hashes from './fixtures/offline-training-v13-base-hashes.json';

test('offline training is one exact opt-in, disjoint from movement and default entries', () => {
  for (const q of ['', '?match=complete-v1&squads=offline-v1', '?contentSet=characters-v1', '?gameplay=movement-v2', '?gameplay=', '?gameplay=offline-training-v2', '?gameplay=offline-training-v1&gameplay=offline-training-v1', '?gameplay=offline-training-v1&gameplay=movement-v2']) assert.equal(offlineTrainingCandidateEnabled(q), false);
  for (const q of ['?gameplay=offline-training-v1', '?gameplay=offline-training-v1&match=complete-v1&squads=offline-v1&environment=courtyard-v1']) {
    assert.equal(offlineTrainingCandidateEnabled(q), true);
    assert.equal(movementCandidateEnabled(q), false);
  }
});
// Keep the historical v13 fixture intact. Only the two owner-authorized legacy
// slow-frame scheduling files receive new pinned hashes; no guard is removed.
const reviewedLegacyScheduling = {
  "src/client.ts": "43229bc71256b05182892cf7405b3f51be2fdbbe920035470da55ca38b9f9416",
  "src/input/controls.ts": "2466e371773b78d9aa6ef7c419f1c95406c53119dcf6d149af67ace23975561e"
};
test('v13 frozen modules plus reviewed legacy scheduling retain their exact bytes', () => {
  for (const [file, hash] of Object.entries({...hashes, ...reviewedLegacyScheduling})) assert.equal(createHash('sha256').update(readFileSync(new URL('../'+file, import.meta.url))).digest('hex'), hash, file);
});
test('offline client and stylesheet load only through the lazy candidate entry', () => {
  const boot = readFileSync(new URL('../src/boot.ts', import.meta.url), 'utf8');
  assert.match(boot, /offlineTrainingCandidateEnabled\(location.search\)\s*\? import\('\.\/candidates\/offline-training-v1\/entry.js'\)/);
  assert.doesNotMatch(boot, /import ['"].*offline-training/);
  const entry = readFileSync(new URL('../src/candidates/offline-training-v1/entry.ts', import.meta.url), 'utf8');
  assert.match(entry, /import '\.\/ui\/style.css'/);
  assert.match(entry, /await import\('\.\/client.js'\)/);
});

import { validateOfflineTrainingOptions } from '../src/candidate-route.js';
test('offline training rejects unsupported character/capture combinations rather than pretending to activate them', () => {
  for (const q of ['?shot=gameplay', '?shot=', '?contentSet=characters-v1', '?contentSet=']) assert.throws(() => validateOfflineTrainingOptions(q), /does not support/);
  assert.doesNotThrow(() => validateOfflineTrainingOptions('?gameplay=offline-training-v1&match=complete-v1&squads=offline-v1&environment=courtyard-v1'));
});
