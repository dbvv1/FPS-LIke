import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { Game } from '../../src/candidates/offline-training-v1/sim/game.js';
import { Soundscape } from '../../src/candidates/offline-training-v1/render/audio.js';
import { resultAudioPolicyFromSearch, resultCueUrls, settledResultCue } from '../../src/candidates/offline-training-v1/render/result-audio.js';

class Source {
  buffer: { tag?: string } | null = null;
  onended: (() => void) | null = null;
  disconnected = false;
  constructor(private owner: Context) {}
  connect() { return this; }
  disconnect() { this.disconnected = true; }
  start() { if (this.owner.rejectStart) throw new Error('device reset'); this.owner.started.push(this); }
  stop() { this.owner.stops++; this.onended?.(); }
}
class Context {
  static last: Context;
  state = 'running'; sampleRate = 48000; destination = {};
  started: Source[] = []; stops = 0; closed = 0; rejectStart = false;
  decoded: string[] = [];
  constructor() { Context.last = this; }
  createBuffer(_channels: number, length: number) { return { length, tag: 'combat', copyToChannel() {} }; }
  createBufferSource() { return new Source(this); }
  createGain() { return { gain: { value: 0 }, connect() { return this; }, disconnect() {} }; }
  createStereoPanner() { return { pan: { value: 0 }, connect() { return this; }, disconnect() {} }; }
  async decodeAudioData(bytes: ArrayBuffer) {
    assert.equal(Buffer.from(bytes).toString('ascii', 0, 4), 'RIFF');
    const tag = createHash('sha256').update(Buffer.from(bytes)).digest('hex'); this.decoded.push(tag);
    return { tag } as unknown as AudioBuffer;
  }
  async resume() { this.state = 'running'; }
  async close() { this.closed++; this.state = 'closed'; }
}
const player = (game: Game) => game.state.actors.find(actor => actor.id === 'player')!;
const flush = () => new Promise<void>(resolve => setImmediate(resolve));
function install() {
  const audio = globalThis.AudioContext, fetch = globalThis.fetch;
  const requests: string[] = [];
  globalThis.AudioContext = Context as unknown as typeof AudioContext;
  globalThis.fetch = (async (url: string | URL | Request) => {
    requests.push(String(url));
    return new Response(readFileSync(new URL(String(url))));
  }) as typeof globalThis.fetch;
  return { requests, restore() { globalThis.AudioContext = audio; globalThis.fetch = fetch; } };
}
async function shortGame() { return Game.create(1, [{ id: 'player', team: 'amber' }, { id: 'bot', team: 'blue' }], { roundTicks: 1 }); }

test('result audio opt-in accepts exactly one known value; all other URLs remain baseline', () => {
  for (const input of ['', '?matchAudio=other', '?matchAudio=result-cues-v1&matchAudio=result-cues-v1', '?matchAudio=result-cues-v1&matchAudio=other']) assert.equal(resultAudioPolicyFromSearch(input), 'baseline');
  assert.equal(resultAudioPolicyFromSearch('?matchAudio=result-cues-v1&match=complete-v1'), 'result-cues-v1');
});
test('default Soundscape does not fetch/decode samples or play a settled round cue', async () => {
  const env = install(), game = await shortGame(), sound = new Soundscape('baseline');
  try { await sound.unlock(); game.step(); sound.update(game.state, player(game), 0, []); assert.deepEqual(env.requests, []); assert.equal(Context.last.started.length, 0); }
  finally { sound.dispose(); game.dispose(); env.restore(); }
});
test('actual settled results play once per round, follow team across side swaps, and preserve simulation', async () => {
  const env = install(), game = await shortGame(), sound = new Soundscape('result-cues-v1');
  try {
    await sound.unlock(); assert.equal(env.requests.length, 2); assert.equal(sound.resultAudioState.ready, true);
    const expected = ['round-loss', 'round-loss', 'round-loss', 'round-win', 'round-win', 'round-win'];
    for (let round = 1; round <= 6; round++) {
      game.step(); const hash = game.stateHash, cue = settledResultCue(game.state, player(game));
      assert.equal(cue?.cue, expected[round - 1]);
      sound.update(game.state, player(game), 0, []); sound.update(game.state, player(game), 0, []);
      assert.equal(Context.last.started.length, round); assert.equal(game.stateHash, hash);
      const wanted = createHash('sha256').update(readFileSync(new URL(resultCueUrls[cue!.cue]))).digest('hex');
      assert.equal(Context.last.started.at(-1)!.buffer!.tag, wanted);
      if (round < 6) { game.nextRound(); sound.reset(); }
    }
    assert.equal(env.requests.length, 2, 'round reset retains decoded immutable samples');
  } finally { sound.dispose(); game.dispose(); env.restore(); }
});
test('a fresh match after reset can use the same result identity once', async () => {
  const env = install(), first = await shortGame(), second = await shortGame(), sound = new Soundscape('result-cues-v1');
  try { await sound.unlock(); first.step(); sound.update(first.state, player(first), 0, []); sound.reset(); second.step(); sound.update(second.state, player(second), 0, []); assert.equal(Context.last.started.length, 2); }
  finally { sound.dispose(); first.dispose(); second.dispose(); env.restore(); }
});
test('muted result is consumed and cannot replay after unmute', async () => {
  const env = install(), game = await shortGame(), sound = new Soundscape('result-cues-v1');
  try { await sound.unlock(); sound.enabled = false; game.step(); sound.update(game.state, player(game), 0, []); assert.equal(sound.resultAudioState.decision, 'inactive'); sound.enabled = true; sound.update(game.state, player(game), 0, []); assert.equal(Context.last.started.length, 0); }
  finally { sound.dispose(); game.dispose(); env.restore(); }
});
test('a result seen before loading is skipped rather than delayed until samples arrive', async () => {
  const env = install(), game = await shortGame(), sound = new Soundscape('result-cues-v1');
  const original = globalThis.fetch; let release!: () => void; const gate = new Promise<void>(resolve => { release = resolve; });
  globalThis.fetch = (async (...args: Parameters<typeof fetch>) => { await gate; return original(...args); }) as typeof fetch;
  try { const loading = sound.unlock(); game.step(); sound.update(game.state, player(game), 0, []); assert.equal(sound.resultAudioState.decision, 'not-ready'); release(); await loading; sound.update(game.state, player(game), 0, []); assert.equal(Context.last.started.length, 0); }
  finally { release(); sound.dispose(); game.dispose(); env.restore(); }
});
test('existing combat voices take priority without queuing or replaying the result', async () => {
  const env = install(), game = await shortGame(), sound = new Soundscape('result-cues-v1');
  try {
    await sound.unlock(); const p = player(game); game.step([{ actorId: p.id, type: 'shoot', yaw: 0, pitch: 0 }]);
    assert.ok(game.state.sounds.some(s => s.kind === 'shot'));
    sound.update(game.state, p, 0, []); assert.equal(sound.resultAudioState.decision, 'combat');
    assert.ok(Context.last.started.length > 0); assert.ok(Context.last.started.every(s => s.buffer?.tag === 'combat'));
    for (const source of Context.last.started) source.onended?.();
    const count = Context.last.started.length; sound.update(game.state, p, 0, []); assert.equal(Context.last.started.length, count);
  } finally { sound.dispose(); game.dispose(); env.restore(); }
});
test('HTTP failure is optional and never blocks simulation or replays an old result', async () => {
  const env = install(), game = await shortGame(), sound = new Soundscape('result-cues-v1');
  const good = globalThis.fetch; globalThis.fetch = (async () => new Response(null, { status: 503 })) as typeof fetch;
  try { await sound.unlock(); assert.equal(sound.resultAudioState.loadFailed, true); game.step(); sound.update(game.state, player(game), 0, []); assert.equal(sound.resultAudioState.decision, 'not-ready'); globalThis.fetch = good; await sound.unlock(); sound.update(game.state, player(game), 0, []); assert.equal(Context.last.started.length, 0); }
  finally { sound.dispose(); game.dispose(); env.restore(); }
});
test('dispose aborts owned fetch and late bytes cannot revive the soundscape', async () => {
  const env = install(), game = await shortGame(), sound = new Soundscape('result-cues-v1');
  const original = globalThis.fetch; let release!: () => void; const gate = new Promise<void>(resolve => { release = resolve; });
  const signals: AbortSignal[] = [];
  globalThis.fetch = (async (url: string | URL | Request, options?: RequestInit) => { signals.push(options!.signal as AbortSignal); await gate; return original(url, options); }) as typeof fetch;
  try { const loading = sound.unlock(); await flush(); const context = Context.last; sound.dispose(); assert.ok(signals.every(s => s.aborted)); release(); await loading; await sound.unlock(); game.step(); sound.update(game.state, player(game), 0, []); assert.equal(context.closed, 1); assert.equal(Context.last, context); assert.equal(sound.resultAudioState.ready, false); assert.equal(context.started.length, 0); }
  finally { release(); sound.dispose(); game.dispose(); env.restore(); }
});
test('muting an active result stops its voice immediately and dispose is idempotent', async () => {
  const env = install(), game = await shortGame(), sound = new Soundscape('result-cues-v1');
  try { await sound.unlock(); game.step(); sound.update(game.state, player(game), 0, []); const source = Context.last.started[0]!; sound.enabled = false; assert.equal(Context.last.stops, 1); assert.equal(source.disconnected, true); sound.dispose(); sound.dispose(); assert.equal(Context.last.closed, 1); }
  finally { game.dispose(); env.restore(); }
});
test('optional source start failure is contained and never retried on the next frame', async () => {
  const env = install(), game = await shortGame(), sound = new Soundscape('result-cues-v1');
  try { await sound.unlock(); Context.last.rejectStart = true; game.step(); assert.doesNotThrow(() => sound.update(game.state, player(game), 0, [])); assert.equal(sound.resultAudioState.decision, 'inactive'); Context.last.rejectStart = false; sound.update(game.state, player(game), 0, []); assert.equal(Context.last.started.length, 0); }
  finally { sound.dispose(); game.dispose(); env.restore(); }
});

test('decode rejection is contained without a fallback cue or changing result state', async () => {
  const env = install(), game = await shortGame(), sound = new Soundscape('result-cues-v1');
  globalThis.fetch = (async () => new Response('not a WAV')) as typeof fetch;
  try { await sound.unlock(); assert.equal(sound.resultAudioState.loadFailed, true); game.step(); const hash = game.stateHash; sound.update(game.state, player(game), 0, []); assert.equal(game.stateHash, hash); assert.equal(Context.last.started.length, 0); }
  finally { sound.dispose(); game.dispose(); env.restore(); }
});
test('concurrent unlock shares pending loads and dispose rejects late decode completion', async () => {
  const env = install(), sound = new Soundscape('result-cues-v1');
  const decode = Context.prototype.decodeAudioData; let release!: () => void; const gate = new Promise<void>(resolve => { release = resolve; });
  Context.prototype.decodeAudioData = async function(bytes: ArrayBuffer) { await gate; return decode.call(this, bytes); };
  try {
    const first = sound.unlock(), second = sound.unlock(); await flush();
    assert.equal(env.requests.length, 2); sound.dispose(); release(); await Promise.all([first, second]);
    assert.equal(Context.last.decoded.length, 2, 'the in-flight decoder really completed');
    assert.equal(sound.resultAudioState.ready, false); assert.equal(Context.last.closed, 1);
  } finally { release(); sound.dispose(); Context.prototype.decodeAudioData = decode; env.restore(); }
});

test('partial failure retains the in-flight sibling and retries only the missing sample', async () => {
  const env = install(), sound = new Soundscape('result-cues-v1');
  const original = globalThis.fetch; let release!: () => void; const gate = new Promise<void>(resolve => { release = resolve; });
  const attempts = new Map<string, number>();
  globalThis.fetch = (async (url: string | URL | Request, options?: RequestInit) => {
    const key = String(url); attempts.set(key, (attempts.get(key) ?? 0) + 1);
    if (key === resultCueUrls['round-win'] && attempts.get(key) === 1) return new Response(null, { status: 503 });
    if (key === resultCueUrls['round-loss']) await gate;
    return original(url, options);
  }) as typeof fetch;
  try {
    const first = sound.unlock(); await flush(); const second = sound.unlock(); await flush();
    assert.deepEqual([...attempts.values()], [1, 1]); release(); await Promise.all([first, second]);
    assert.equal(sound.resultAudioState.loadFailed, true); assert.equal(sound.resultAudioState.ready, false);
    await sound.unlock(); assert.equal(attempts.get(resultCueUrls['round-win']), 2); assert.equal(attempts.get(resultCueUrls['round-loss']), 1);
    assert.equal(sound.resultAudioState.ready, true); assert.equal(sound.resultAudioState.loadFailed, false);
  } finally { release(); sound.dispose(); env.restore(); }
});
