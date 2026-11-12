import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { movementCandidateEnabled, offlineTrainingCandidateEnabled } from '../src/candidate-route.js';
import hashes from './fixtures/offline-training-v13-base-hashes.json';

// Accepted terminal-lifetime repair; all unrelated frozen modules stay pinned.
const reviewedTerminalLifetime = { "src/client.ts": "7a8a596907901d8e4ee092d45818a8e9c51e96d118f60dd0724136f3092c2a7c" };

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
// Owner-requested 1280x720 offscreen capture. Historical fixture stays intact.
const fixedCaptureRevision = {
  "src/render/scene.ts": "4ff87f9c38280059dcdea7da61868ff228cf7edb84fa8af774d1644a8bda96cc",
  "src/capture/client.ts": "15c85b5a3142fb4dc9cca7eb330eb3ac9fac28e4cadcdd00ff6dc2c263d091d9",
  "src/candidates/movement-v2/render/scene.ts": "4ff87f9c38280059dcdea7da61868ff228cf7edb84fa8af774d1644a8bda96cc",
  "src/candidates/movement-v2/capture/client.ts": "4b852c784cc1e88dc8761cab17d93640794513459991e19b5b72d92bc5225bda"
};

// Reviewed lock teardown and foreground slow-frame intent repair; simulation hashes remain unchanged.
const reviewedLockDisposal = {
  "src/input/controls.ts": "554fa96989ebe86d1c25d87e677791e2f669f23425773808b6c373c250e35784",
  "src/candidates/movement-v2/input/controls.ts": "b18b0be72114f1a45074a6747d0e951b2d4868d943442bdf596f9212a76160fc"
};

// Owner-requested player-facing menu cleanup; historical fixtures and simulation stay pinned.
const reviewedPlayerMenu = {
  "src/ui/hud.ts": "7800b29ec5482ed4025d67efe6079ca3bdf25f19f144ee5cea16016fab02db9a",
  "src/candidates/movement-v2/ui/hud.ts": "ba84d40108f69831a41cb740d469847e1c8426322b248dd760b5f00aa1d46fa5"
};

test('v13 frozen modules plus authorized scheduling/capture changes retain their exact bytes', () => {
  for (const [file, hash] of Object.entries({...hashes, ...reviewedLegacyScheduling, ...fixedCaptureRevision, ...reviewedLockDisposal, ...reviewedTerminalLifetime, ...reviewedPlayerMenu})) assert.equal(createHash('sha256').update(readFileSync(new URL('../'+file, import.meta.url))).digest('hex'), hash, file);
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
