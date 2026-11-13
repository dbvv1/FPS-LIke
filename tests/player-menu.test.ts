import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

for (const path of ['src/ui/hud.ts', 'src/candidates/movement-v2/ui/hud.ts', 'src/candidates/offline-training-v1/ui/hud.ts']) {
  test(`${path}: player menu contains no candidate or diagnostic navigation`, () => {
    const source = readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
    const menu = source.match(/element\('menu'\)\.innerHTML = `([\s\S]*?)`;/)![1]!;
    assert.doesNotMatch(menu, /候选|运行诊断|version-links|<details|<a\b/);
    // Preserve the passive receipt node used by existing smoke clients, but
    // remove its visible toggle and accessibility-tree exposure.
    assert.match(menu, /<div id="diagnostics" aria-hidden="true"><pre id="debug-state" hidden><\/pre><\/div>/);
    for (const id of ['start', 'next', 'restart', 'audio', 'difficulty', 'aim-settings-host', 'lock-error']) {
      assert.match(menu, new RegExp(`id="${id}"`));
    }
  });
}
