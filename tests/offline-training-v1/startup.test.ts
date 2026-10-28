import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { loadClient } from '../../src/startup.js';

test('entry is readable before JavaScript, with full-page reload instead of a second Game', () => {
  const html = readFileSync(new URL('../../index.html', import.meta.url), 'utf8');
  assert.match(html, /<section id="boot"[^>]*>[\s\S]*正在加载场景/);
  assert.match(html, /<a href="\.\/">重新载入页面<\/a>/);
  assert.match(html, /src="\/src\/boot\.ts"/);
  assert.doesNotMatch(html, /src="\/src\/client\.ts"/);
});

test('slow startup keeps the same import pending and eventually finishes', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const events: string[] = [];
  let resolve!: () => void, calls = 0;
  const pending = loadClient(() => { calls++; return new Promise<void>(r => { resolve = r; }); }, {
    slow: () => events.push('slow'), failed: () => events.push('failed'), finished: () => events.push('finished'),
  });
  t.mock.timers.tick(12_000);
  assert.deepEqual(events, ['slow']);
  t.mock.timers.tick(120_000);
  assert.deepEqual(events, ['slow']);
  resolve(); await pending;
  assert.equal(calls, 1);
  assert.deepEqual(events, ['slow', 'finished']);
});

test('module download/evaluation failure is shown, not left blank or retried in-place', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const failure = new TypeError('Failed to fetch dynamically imported module');
  let shown: unknown, calls = 0;
  await loadClient(async () => { calls++; throw failure; }, {
    slow: () => assert.fail('settled import timer must be cleared'),
    failed: error => { shown = error; }, finished: () => assert.fail('not loaded'),
  });
  t.mock.timers.tick(120_000);
  assert.equal(shown, failure); assert.equal(calls, 1);
});

test('successful startup removes its pending slow notice', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let finished = false;
  await loadClient(async () => {}, {
    slow: () => assert.fail('settled import timer must be cleared'),
    failed: () => assert.fail('not failed'), finished: () => { finished = true; },
  });
  t.mock.timers.tick(120_000);
  assert.equal(finished, true);
});
