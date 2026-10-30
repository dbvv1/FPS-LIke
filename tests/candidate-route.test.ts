import test from 'node:test';
import assert from 'node:assert/strict';
import { movementCandidateEnabled } from '../src/candidate-route.js';
test('movement v2 requires one exact opt-in and combines with character/capture parameters', () => {
 for (const query of ['', '?gameplay=', '?gameplay=other', '?gameplay=movement-v2&gameplay=movement-v2', '?contentSet=characters-v1']) assert.equal(movementCandidateEnabled(query), false);
 for (const query of ['?gameplay=movement-v2', '?gameplay=movement-v2&contentSet=characters-v1', '?shot=gameplay&gameplay=movement-v2']) assert.equal(movementCandidateEnabled(query), true);
});

import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
// Only legacy client scheduling/input debt disposal changed by owner request on 2026-10-30.
// All simulation, content, HUD and rendering hashes remain the frozen baseline.
test('legacy modules retain frozen bytes except explicitly reviewed slow-frame scheduling revision', () => {
 const files = {
  "src/client.ts": "43229bc71256b05182892cf7405b3f51be2fdbbe920035470da55ca38b9f9416",
  "src/render/scene.ts": "81f8ed6ac190ae33ca1fb98d6cda10e27a7c2765a2b29fef63031698191ea714",
  "src/content/difficulty.ts": "9ed2633b2dd9237a5b1940236a488690209cf619e4530c7f1434410dd03d9936",
  "src/content/freeze.ts": "35a31a790068d822e35110ff2d1a6c7a345f6aeeef9d5a256caa66336b3374ee",
  "src/content/map.ts": "2431dfef756bfddaa4893e058bdf59f38ac17f83d56e50712620e2707151a3af",
  "src/content/navigation.json": "bd3bbe9a5efbfbd1f1dfc68c0b950c160a7afc847e1c73b927c4915afda7f42a",
  "src/content/weapons.ts": "909d47bbb43d91fb18551d47428fab302fcf37409f3c8040a974a55f00080e3d",
  "src/input/controls.ts": "2466e371773b78d9aa6ef7c419f1c95406c53119dcf6d149af67ace23975561e",
  "src/input/sensitivity.ts": "fea34368ef71f88f6d855056a739181606d7ca9bb55f3407368021ff356e3d09",
  "src/render/arm.ts": "e5053cf75b9858118ec9c455221f7f621a21c34d9880e8afeb743cca85ba09d3",
  "src/render/audio.ts": "ca0d294cfc08d329d00428693e78a832c7acb2d09de337b5d72efad94b10bf76",
  "src/render/canvas-weapon.ts": "67385b8e17659410a8cb3762e2d16e7efb4284b13146dd2a1a74b66ac2e2b306",
  "src/render/canvas.ts": "9e4dfd2df4130ceacac56b9f25fa9ac936cb4a3a54007b5c6c4b4447e9f9b5d5",
  "src/render/coordinates.ts": "e00ba621c026f132878a92c5b94f77fe2fb355d79afafcdcf97c03c506e770af",
  "src/render/feedback.ts": "2dc35af6a6feff98e17950897cd2cf98aefc3e13d21773e397bca248abeff950",
  "src/render/ground.ts": "1c1655f78ec45f7273dca73f3de6a39b0b480c40d6a7969559a6fc8c15d62fa1",
  "src/render/rifle.ts": "1f070a0295ae683f63162392032dd40a80961bee234f3cbec3d5a60ec39b2753",
  "src/render/synth.ts": "df32da6ae43b7474a8d94da74f65d58998e8da39c5bd09acbbb03a6e6d98999d",
  "src/render/target.ts": "6dd8b214c5ff903f99e19b47817130e2300d61665255c0ec2ba60fd0056861ef",
  "src/render/weapon.ts": "a2f354dfab49229d5e88a1a565c52464ae139fdef7632200c4b76deea2428292",
  "src/render/yard.ts": "1e9511e85e1e867b5fcc2794e4043363f80884e5116d9fcc76cb3286349fbcb3",
  "src/sim/bot.ts": "7409ec0b024ba98d7942c7912e17cb40b3769bd15eb5abde205736cba8b34ff5",
  "src/sim/game.ts": "5deba0247d7fa88201134a2eefcd6af8940bebd957c7aedfdd28f8fa117b9771",
  "src/sim/index.ts": "8fa3b3ca768d020511a6c16d3b28c86d0a9aba3d4c0b557a0eab2e7b5e478a0c",
  "src/sim/math.ts": "1f078f53bc72ee483ed833b3441d62d10c2300107c74174f6d789a5438a608d2",
  "src/sim/navigation.ts": "408d6c6bf3c3952af88f3e804a3fbf830ddab78f22753ce8494505b366032f01",
  "src/sim/physics.ts": "4c848b816a1aaf927518036e5adeb38d5ca5dafa07495016657e7b4057e0bdac",
  "src/sim/types.ts": "c6fee3aff3ebbe69fb434fe94487df00a18cab7d633d5abfcee4d7fb31e4ace0",
  "src/ui/hud.ts": "16d94ee45e728b795dab48f25e7b0d353423da4808b78fd0e1e8214682ab0a0b",
  "src/ui/sensitivity-menu.ts": "30d9ecbf72853722fc00b26d9f48b1ada06dee64c9d3994c9cdb23f3013624f9",
  "src/ui/style.css": "58e861d051adacba252bb71b7154af19df4746e7f011774973667cd36784648b"
};
 for (const [path, sha] of Object.entries(files)) assert.equal(createHash('sha256').update(readFileSync(new URL('../' + path, import.meta.url))).digest('hex'), sha, path);
});

import { parseCaptureConfig as baseCapture } from '../src/capture/config.js';
import { parseCaptureConfig as movementCapture } from '../src/candidates/movement-v2/capture/config.js';
test('capture rejects asynchronous character content in both namespaces', () => {
 for (const parse of [baseCapture, movementCapture]) {
  assert.throws(() => parse('?shot=gameplay&contentSet=characters-v1'), /Character content capture is not supported/);
  assert.equal(parse('?contentSet=characters-v1'), null);
 }
});
