import assert from 'node:assert/strict';
import { connect } from 'node:net';
export const OFFLINE_QUERY = '?gameplay=offline-training-v1&match=complete-v1&squads=offline-v1&environment=courtyard-v1';
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
  assert.equal(hud.teamStatusHidden, false);
  assert.match(hud.teamStatus, /己方 5\/5 · 敌方 5\/5/);
  assert.doesNotMatch(hud.goal, /存活/, 'survivor counts belong to #team-status, not the objective sentence');
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
