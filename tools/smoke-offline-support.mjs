import assert from 'node:assert/strict';
import { connect } from 'node:net';
// Node >=24 (repository runtime): native type stripping shares the product route.
import { resolveHomeSearch, reviewedTrainingSearch } from '../src/default-route.ts';
export const OFFLINE_QUERY = '?gameplay=offline-training-v1&match=complete-v1&squads=offline-v1&environment=courtyard-v1';
export const REVIEWED_QUERY = reviewedTrainingSearch;
export const FULL_MATERIALS_QUERY = REVIEWED_QUERY + '&materials=ai-courtyard-full-v1';
export function smokeEntry(query = '') {
  assert.equal(typeof query, 'string');
  assert.ok(query === '' || query.startsWith('?'), 'Smoke query must start with ?');
  assert.ok(!new URLSearchParams(query).has('smoke'), 'Fixed-tape smoke is not a natural full-match entry');
  const allowed = ['', '?', '?gameplay=legacy-v1', '?contentSet=characters-v1',
    '?gameplay=movement-v2', '?gameplay=movement-v2&contentSet=characters-v1', OFFLINE_QUERY,
    OFFLINE_QUERY + '&art=standards-v1', OFFLINE_QUERY + '&art=standards-v1&materials=ai-courtyard-full-v1',
    REVIEWED_QUERY, FULL_MATERIALS_QUERY];
  assert.ok(allowed.includes(query), 'Unsupported smoke entry; use an exact supported route');
  const effective = resolveHomeSearch(query);
  const litFullMaterials = effective === FULL_MATERIALS_QUERY;
  const fullMaterials = litFullMaterials || effective === OFFLINE_QUERY + '&art=standards-v1&materials=ai-courtyard-full-v1';
  const lit = litFullMaterials || effective === REVIEWED_QUERY;
  const artStandards = lit || fullMaterials || effective === OFFLINE_QUERY + '&art=standards-v1';
  const offline = effective === OFFLINE_QUERY || artStandards;
  // Do not silently certify unsupported/duplicate options as a complete-match run.
  assert.ok(offline || effective === '?gameplay=legacy-v1' || effective === '?contentSet=characters-v1', 'Unsupported resolved smoke entry');
  return { effective, offline, artStandards, fullMaterials, lit };
}

// Read-only rAF observer. This measures frame intervals, not GPU time or input latency.
// Keep raw samples, including menus and hidden frames, so exclusions remain auditable.
export function installFrameObserver() {
  const samples = [];
  let previous, previousRound, previousRunning = false, previousVisible = false, id;
  function frame(now) {
    const state = window.fpsClient.state(), snapshot = window.fpsClient.snapshot();
    const running = state.running && snapshot.phase !== 'over', visible = !document.hidden;
    if (previous !== undefined) samples.push({ startMs: previous, endMs: now, ms: now - previous, round: snapshot.round,
      running, visible, phase: snapshot.phase,
      active: running && previousRunning && previousRound === snapshot.round && visible && previousVisible });
    previous = now; previousRound = snapshot.round; previousRunning = running; previousVisible = visible;
    id = requestAnimationFrame(frame);
  }
  id = requestAnimationFrame(frame);
  window.fpsSmokeFrames = { stop: () => { cancelAnimationFrame(id); return samples; } };
}
export function summarizeMatchFrames(samples, requireComplete = true) {
  assert.ok(Array.isArray(samples) && samples.length > 0, 'Missing frame observations');
  let previousEnd;
  for (const s of samples) {
    assert.ok(Number.isFinite(s.ms) && s.ms > 0, 'Invalid frame interval');
    assert.ok(Number.isFinite(s.startMs) && Number.isFinite(s.endMs) && s.endMs > s.startMs, 'Missing or invalid frame boundaries');
    assert.ok(Math.abs(s.endMs - s.startMs - s.ms) < 1e-6, 'Frame duration does not match boundaries');
    if (previousEnd !== undefined) assert.equal(s.startMs, previousEnd, 'Gap or overlap in frame observations');
    previousEnd = s.endMs;
    assert.ok(Number.isInteger(s.round) && s.round >= 1 && s.round <= 6, 'Invalid frame round');
    assert.equal(typeof s.active, 'boolean');
  }
  const stats = values => {
    if (!values.length) return { count: 0 };
    const sorted = [...values].sort((a,b) => a-b);
    return { count: values.length, totalMs: values.reduce((a,b) => a+b, 0),
      meanMs: values.reduce((a,b) => a+b, 0) / values.length,
      medianMs: sorted[Math.ceil(sorted.length * .5)-1], p95Ms: sorted[Math.ceil(sorted.length * .95)-1],
      p99Ms: sorted[Math.ceil(sorted.length * .99)-1], maxMs: sorted.at(-1), over50Ms: values.filter(v=>v>50).length };
  };
  const rounds = Array.from({length:6}, (_,i) => ({ round:i+1, ...stats(samples.filter(s=>s.active && s.round===i+1).map(s=>s.ms)) }));
  if (requireComplete) assert.ok(rounds.every(r=>r.count>0), 'Missing active frame observations for one or more rounds');
  return { metric: 'requestAnimationFrame interval; observer overhead included; not GPU time',
    clock: 'performance timeline milliseconds since page time origin',
    startMs: samples[0].startMs, endMs: samples.at(-1).endMs,
    observedSpanMs: samples.at(-1).endMs - samples[0].startMs,
    scope: requireComplete
      ? 'first to last recorded rAF across six natural rounds and final UI restart; active excludes paused/hidden/round-boundary intervals'
      : 'partial observation only: first to last recorded rAF before failure; no six-round or restart completion claim',
    all: stats(samples.map(s=>s.ms)), active: stats(samples.filter(s=>s.active).map(s=>s.ms)), rounds };
}
export function assertOfflineReady(state, snapshot, hud) {
  assert.equal(state.ready, true);
  assert.equal(state.squads?.version, 'offline-v1');
  assert.equal(state.squads?.formation, 'squads-v1');
  assert.equal(new Set(state.squads?.botIds).size, 9, 'Nine distinct live bot controllers');
  assert.equal(snapshot.actors.length, 10);
  assert.equal(snapshot.actors.filter(a => a.team === 'amber').length, 5);
  assert.equal(snapshot.actors.filter(a => a.team === 'blue').length, 5);
  assert.deepEqual([...state.squads.botIds].sort(), snapshot.actors.filter(a => a.id !== 'player').map(a => a.id).sort());
  assert.equal(state.environment?.id, 'courtyard-v1');
  assert.equal(state.environment?.active, true);
  assert.equal(state.match?.complete, false);
  assert.equal(state.match?.rounds.length, 0);
  assert.match(hud.progress, /1 \/ 6 回合/);
  assert.match(hud.goal, /存活 5:5/);
  assert.match(hud.title, /回合 1 \/ 6/);
}
export function assertMatchReset(state, snapshot) {
  assert.equal(snapshot.tick, 0);
  assert.equal(snapshot.round, 1);
  assert.deepEqual(snapshot.score, { amber: 0, blue: 0 });
  assert.equal(state.match?.rounds.length, 0);
  assert.equal(state.match?.complete, false);
  assert.equal(snapshot.actors.find(a => a.id === 'player').weapons.pistol.ammo, 10);
}
export async function finishOfflineRound(page, report) {
  // Ordinary page input only: wall-clock round progression, never fpsClient mutation.
  await page.locator('#start').click();
  await page.waitForFunction(() => window.fpsClient.state().running);
  await page.waitForFunction(() => window.fpsClient.snapshot().phase === 'over', null, { timeout: 120_000 });
  const settled = await page.evaluate(() => ({ state: window.fpsClient.state(), snapshot: window.fpsClient.snapshot() }));
  assert.equal(settled.state.match.rounds.length, 1);
  assert.equal(settled.snapshot.round, 1);
  assert.ok(settled.snapshot.result);
  report.offlineCoverage.completedRounds = settled.state.match.rounds;
  await page.locator('#next').click();
  await page.waitForFunction(() => window.fpsClient.snapshot().round === 2 && window.fpsClient.state().running);
  assert.equal(await page.evaluate(() => window.fpsClient.state().match.rounds.length), 1);
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => !window.fpsClient.state().running);
  report.stages.push('natural first-round result, UI next round preserves match record');
}
export async function finishOfflineMatch(page, report) {
  // Only ordinary UI input and read-only observations. Never fast-forward or mutate the game.
  await page.locator('#start').click();
  await page.waitForFunction(() => window.fpsClient.state().running);
  // Rules: 70s round + up to 25s planted bomb; 180s allows render/settlement overhead.
  // A stalled/paused game still fails; do not inject ticks or force outcomes.
  report.offlineCoverage.roundTimeoutMs = 180_000;
  let firstSide;
  for (let round = 1; round <= 6; round++) {
    report.offlineCoverage.pendingRound = round;
    await page.waitForFunction(n => window.fpsClient.snapshot().phase === 'over'
      && window.fpsClient.state().match.rounds.length === n, round, { timeout: 180_000 });
    await page.locator('#next').waitFor({ state: 'visible' });
    const settled = await page.evaluate(() => ({ state: window.fpsClient.state(), snapshot: window.fpsClient.snapshot(),
      hud: { title: document.getElementById('match-title').textContent,
        description: document.getElementById('match-description').textContent,
        next: document.getElementById('next').textContent,
        recap: [...document.querySelectorAll('#match-rounds li')].map(item => item.textContent) } }));
    const { state, snapshot, hud } = settled;
    const actor = snapshot.actors.find(a => a.id === 'player');
    assert.equal(snapshot.round, round); assert.ok(snapshot.result);
    assert.equal(snapshot.phase, 'over'); assert.equal(state.match.rounds.length, round);
    assert.deepEqual(state.match.rounds.map(r => r.round), Array.from({ length: round }, (_, i) => i + 1));
    assert.equal(snapshot.score.amber + snapshot.score.blue, round);
    assert.equal(state.match.wins + state.match.losses, round);
    assert.equal(hud.recap.length, round);
    firstSide ??= actor.side;
    assert.ok(['attack', 'defend'].includes(firstSide));
    const expectedSide = round <= 3 ? firstSide : firstSide === 'attack' ? 'defend' : 'attack';
    assert.equal(actor.side, expectedSide);
    assert.equal(state.match.rounds[round - 1].side, expectedSide);
    assert.equal(state.match.complete, round === 6);
    if (round === 3) {
      assert.match(hud.title, /半场结束.*交换攻守/);
      assert.match(hud.next, /交换攻守.*第 4 回合/);
      report.offlineCoverage.halftime = settled;
    }
    if (round === 4) report.offlineCoverage.sideSwitch = { before: firstSide, after: actor.side };
    report.offlineCoverage.completedRounds = state.match.rounds;
    report.offlineCoverage.roundEvidence ??= [];
    report.offlineCoverage.roundEvidence.push(settled);
    if (round < 6) {
      await page.locator('#next').click();
      await page.waitForFunction(n => window.fpsClient.snapshot().round === n
        && window.fpsClient.state().running && window.fpsClient.state().match.rounds.length === n - 1, round + 1);
    } else {
      assert.match(hud.title, /整场胜利|整场失利|双方战平/);
      assert.match(hud.description, /最终比分/); assert.match(hud.next, /再打一场/);
      report.offlineCoverage.finalResult = settled;
    }
  }
  // The final next button invokes the existing whole-match restart, not a seventh round.
  await page.locator('#next').click();
  await page.waitForFunction(() => window.fpsClient.snapshot().tick === 0
    && window.fpsClient.state().match.rounds.length === 0 && !window.fpsClient.state().match.complete);
  const reset = await page.evaluate(() => ({ state: window.fpsClient.state(), snapshot: window.fpsClient.snapshot() }));
  assertMatchReset(reset.state, reset.snapshot);
  assert.equal(reset.state.running, false);
  report.offlineCoverage.endRestart = reset;
  report.offlineCoverage.pendingRound = null;
  report.offlineCoverage.endRestartReset = true;
  report.stages.push('six natural rounds, halftime UI and side switch, final result and UI new-match reset');
}
export async function verifyRestartPlayable(page, report) {
  await page.locator('#start').click();
  await page.waitForFunction(() => window.fpsClient.state().running && window.fpsClient.snapshot().tick > 2);
  const advanced = await page.evaluate(() => ({ state: window.fpsClient.state(), snapshot: window.fpsClient.snapshot() }));
  assert.equal(advanced.snapshot.round, 1); assert.equal(advanced.state.match.rounds.length, 0);
  assert.equal(advanced.state.running, true); assert.ok(advanced.snapshot.tick > 2);
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => !window.fpsClient.state().running);
  const paused = await page.evaluate(() => window.fpsClient.snapshot().tick);
  await page.waitForTimeout(200);
  assert.equal(await page.evaluate(() => window.fpsClient.snapshot().tick), paused);
  report.offlineCoverage.restartedPlay = { advanced, pausedTick: paused, pauseObservationMs: 200 };
  report.offlineCoverage.fullMatchPlaythrough = true;
  report.offlineCoverage.unverified = ['human visual/audio quality'];
  report.stages.push('new match starts advancing and Escape freezes its clock');
}
export function portClosed(port) {
  return new Promise((resolve, reject) => {
    const socket = connect({ host: '127.0.0.1', port });
    socket.once('connect', () => { socket.destroy(); resolve(false); });
    socket.once('error', error => error.code === 'ECONNREFUSED' ? resolve(true) : reject(error));
    socket.setTimeout(2000, () => { socket.destroy(); reject(new Error('Preview port closure probe timed out')); });
  });
}
export function browserExitReceipt(log) {
  const launched = [...log.matchAll(/\[pid=(\d+)\]/g)].map(match => match[1]);
  const exits = [...log.matchAll(/\[pid=(\d+)\] <process did exit: exitCode=([^,]+), signal=([^>]+)>/g)]
    .map(match => ({ pid: Number(match[1]), exitCode: match[2], signal: match[3] }));
  assert.ok(launched.length > 0, 'Missing owned browser PID evidence');
  const receipt = exits.find(exit => exit.pid === Number(launched[0]));
  assert.ok(receipt, 'Missing owned browser process exit evidence');
  assert.equal(receipt.exitCode, '0');
  assert.equal(receipt.signal, 'null');
  return receipt;
}
