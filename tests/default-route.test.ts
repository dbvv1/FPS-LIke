import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveHomeSearch, reviewedTrainingSearch, legacySearch, groundCandidateSearch } from '../src/default-route.js';
import { offlineTrainingCandidateEnabled, movementCandidateEnabled, trainingFeelEnabled } from '../src/candidate-route.js';
test('unparameterized home selects the complete visually reviewed training route without unreviewed feel', () => {
  for (const home of ['', '?']) {
    const search = resolveHomeSearch(home);
    assert.equal(search, reviewedTrainingSearch);
    assert.equal(offlineTrainingCandidateEnabled(search), true);
    assert.equal(trainingFeelEnabled(search), false);
    const p = new URLSearchParams(search);
    for (const [key, value] of Object.entries({match:'complete-v1', squads:'offline-v1', environment:'courtyard-v1', art:'standards-v1', lighting:'courtyard-light-v1'})) assert.equal(p.get(key), value);
  }
});
test('legacy, ground, historical capture and all explicit queries preserve their exact meaning', () => {
  for (const search of [legacySearch, groundCandidateSearch, '?shot=gameplay', '?contentSet=characters-v1', '?gameplay=movement-v2', '?gameplay=offline-training-v1', '?unknown=1', '?gameplay=offline-training-v1&gameplay=movement-v2']) assert.equal(resolveHomeSearch(search), search);
  assert.equal(offlineTrainingCandidateEnabled(legacySearch), false);
  assert.equal(movementCandidateEnabled(legacySearch), false);
  assert.equal(trainingFeelEnabled(groundCandidateSearch), true);
});
