import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { basename, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { PNG } from 'pngjs';
import { CAMERAS, CAPTURE_SIZE } from '../src/capture/cameras.js';
import { parseCaptureConfig } from '../src/capture/config.js';
import { captureBuildInvocation, createCaptureRun } from '../tools/capture-support.js';

// Execute the real script with only browser/process boundaries mocked. No browser
// launches or rendered-pixel claims: this tests filesystem/provenance orchestration.
const scriptUrl = new URL('../tools/capture.mjs', import.meta.url);
const source = readFileSync(scriptUrl, 'utf8').replace(/^#!.*\n/, '').replace(/^import .*;\n/gm, '')
  .replaceAll('import.meta.url', JSON.stringify(scriptUrl.href));
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
const image = new PNG({ width: 64, height: 64 });
for (let i = 0; i < image.data.length; i += 4) { image.data[i] = (i / 4) & 255; image.data[i + 1] = (i / 1024) & 255; image.data[i + 2] = 100; image.data[i + 3] = 255; }
const png = PNG.sync.write(image);
async function invoke(out: string, commit: string, input: string, frames: number, platform: NodeJS.Platform = 'linux') {
  const buildCalls: { file: string; args: string[]; options: Record<string, unknown> }[] = [];
  const values = { out, shot: 'gameplay', seed: '1', t: '0', input, frames: String(frames), repeat: '1', software: false, headed: false, 'require-gpu': true, 'check-live': false };
  const processStub = { platform, env: { ComSpec: 'C:\\Windows\\System32\\cmd.exe' }, exitCode: undefined as number | undefined };
  let printed = '';
  function page() {
    const window: { __shot: Record<string, unknown>; __shotNext: (frame: number) => boolean } = { __shot: {}, __shotNext: () => false };
    return { on() {}, async goto(url: string) {
      const config = parseCaptureConfig(new URL(url).search)!;
      window.__shot = { ready: true, frame: 0, t: 0, virtualTick: 0, backend: 'three-webgl2', ...config,
        renderer: 'ANGLE (NVIDIA GeForce RTX 5070)', rendererClass: 'gpu', unmasked: true,
        camera: { name: 'gameplay' }, stateHash: 'mock-state-0', viewport: { ...CAPTURE_SIZE, pixelRatio: 1, bufferWidth: 1280, bufferHeight: 720 } };
      window.__shotNext = (frame: number) => {
        assert.equal(frame, window.__shot.frame);
        if (frame === frames - 1) return false;
        window.__shot.frame = frame + 1; window.__shot.virtualTick = frame + 1; window.__shot.t = (frame + 1) / 60;
        window.__shot.stateHash = `mock-state-${frame + 1}`; return true;
      };
    }, async waitForFunction() {}, locator: () => ({ async waitFor() {} }), async waitForTimeout() {},
    async evaluate(fn: Function, argument?: unknown) {
      return structuredClone(new Function('window', 'argument', `return (${fn.toString()})(argument)`)(window, argument));
    }, async screenshot() { return png; }, async close() {} };
  }
  const deps = { assert, parseArgs: () => ({ values }), mkdir, writeFile, resolve, join, basename, fileURLToPath, createHash, PNG, CAMERAS, CAPTURE_SIZE, parseCaptureConfig, createCaptureRun, captureBuildInvocation,
    process: processStub, console: { log: (value: string) => { printed = value; } },
    execFileSync: (file: string, args: string[], options: Record<string, unknown>) => {
      if (file === 'git') return args[0] === 'rev-parse' ? commit : '';
      buildCalls.push({ file, args, options }); return '';
    },
    preview: async () => ({ httpServer: { address: () => ({ port: 12345 }), closeAllConnections() {}, close(callback: Function) { callback(); } } }),
    chromium: { async launch() { return { version: () => 'mock-no-browser', async newContext() { return { async route() {}, async newPage() { return page(); }, async close() {} }; }, async close() {} }; } },
  };
  await new AsyncFunction(...Object.keys(deps), source)(...Object.values(deps));
  const report = JSON.parse(printed);
  assert.equal(processStub.exitCode, undefined, printed); assert.equal(report.passed, true, printed);
  return { report, buildCalls };
}

test('actual capture script isolates changed commits/inputs and long-to-short sequences in one output root', async () => {
  const root = await mkdtemp(join(tmpdir(), 'fps-capture-script-'));
  try {
    const cases = [
      { commit: 'a'.repeat(40), input: 'idle', frames: 3 },
      { commit: 'a'.repeat(40), input: 'advance-fire', frames: 1 },
      { commit: 'b'.repeat(40), input: 'advance-fire', frames: 2 },
      { commit: 'b'.repeat(40), input: 'advance-fire', frames: 1 },
    ];
    const outputs: string[] = [];
    for (const item of cases) {
      const { report } = await invoke(root, item.commit, item.input, item.frames);
      outputs.push(report.outputDirectory);
      assert.equal(report.sourceCommit, item.commit); assert.equal(report.parameters.input, item.input);
      assert.equal(report.shots.length, item.frames);
      const stored = JSON.parse(await readFile(join(report.outputDirectory, 'report.json'), 'utf8'));
      assert.deepEqual(stored, report);
      const sequences = (await readdir(report.outputDirectory)).filter(name => name !== 'report.json');
      assert.equal(sequences.length, 1);
      assert.deepEqual((await readdir(join(report.outputDirectory, sequences[0]!))).sort(),
        Array.from({ length: item.frames }, (_, i) => `${String(i).padStart(5, '0')}`).flatMap(frame => [`${frame}.json`, `${frame}.png`]).sort());
      for (const entry of report.shots) {
        assert.equal(entry.runId, report.runId); assert.equal(entry.sourceCommit, item.commit); assert.equal(entry.input, item.input);
      }
    }
    assert.equal(new Set(outputs).size, cases.length);
    assert.equal((await readdir(root)).length, cases.length, 'No shared report or overwritten sequence at output-root level');
    // Earlier long sequence is preserved rather than deleted to hide stale-tail risk.
    assert.ok(await readFile(join(outputs[0]!, (await readdir(outputs[0]!)).find(name => name !== 'report.json')!, '00002.png')));
  } finally { await rm(root, { recursive: true, force: true }); }
});
test('atomic output allocation separates simultaneous runs with identical version and input', async () => {
  const root = await mkdtemp(join(tmpdir(), 'fps-capture-exclusive-'));
  try {
    const paths = await Promise.all(Array.from({ length: 5 }, () => createCaptureRun(root, 'a'.repeat(40), 'idle')));
    assert.equal(new Set(paths).size, 5);
    await assert.rejects(createCaptureRun(root, 'a'.repeat(40), '../escape'), /Invalid/);
  } finally { await rm(root, { recursive: true, force: true }); }
});
test('Windows build dispatch uses explicit cmd.exe and a fixed non-interpolated command, not execFile npm.cmd', async () => {
  assert.deepEqual(captureBuildInvocation('win32'), { file: 'cmd.exe', args: ['/d', '/s', '/c', 'npm.cmd run build'] });
  for (const platform of ['linux', 'darwin'] as const) assert.deepEqual(captureBuildInvocation(platform), { file: 'npm', args: ['run', 'build'] });
  const root = await mkdtemp(join(tmpdir(), 'fps capture windows & argv '));
  try {
    const { buildCalls } = await invoke(root, 'c'.repeat(40), 'idle', 1, 'win32');
    assert.equal(buildCalls.length, 1);
    assert.equal(buildCalls[0]!.file, 'C:\\Windows\\System32\\cmd.exe');
    assert.deepEqual(buildCalls[0]!.args, ['/d', '/s', '/c', 'npm.cmd run build']);
    assert.equal(buildCalls[0]!.options.shell, false); assert.equal(buildCalls[0]!.options.windowsHide, true);
    assert.ok(!buildCalls[0]!.args.join(' ').includes(root), 'Filesystem values are never interpolated into shell command text');
  } finally { await rm(root, { recursive: true, force: true }); }
});
