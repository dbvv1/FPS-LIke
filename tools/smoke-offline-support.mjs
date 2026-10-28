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
