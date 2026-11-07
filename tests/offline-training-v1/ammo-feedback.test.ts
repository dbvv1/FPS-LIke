import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../../src/candidates/offline-training-v1/sim/game.js';
import { WEAPONS } from '../../src/candidates/offline-training-v1/content/weapons.js';
import { type WeaponId } from '../../src/candidates/offline-training-v1/sim/types.js';
import { Hud } from '../../src/candidates/offline-training-v1/ui/hud.js';
import { MouseSensitivity } from '../../src/candidates/offline-training-v1/input/sensitivity.js';

// DOM stand-ins verify the actual HUD consumer, not browser layout or input.
function installHud() {
  const elements = new Map<string, any>();
  const element = (id: string): any => {
    if (!elements.has(id)) elements.set(id, {
      hidden: false, open: false, textContent: '', innerHTML: '', value: '', dataset: {}, firstChild: { textContent: '' },
      style: { setProperty() {}, width: '' },
      classList: { add() {}, remove() {}, toggle() {} },
      addEventListener() {}, querySelector: element, focus() {},
      showModal() { this.open = true; }, close() { this.open = false; },
    });
    return elements.get(id);
  };
  const prior = Object.getOwnPropertyDescriptor(globalThis, 'document');
  Object.defineProperty(globalThis, 'document', { configurable: true, value: { getElementById: element } });
  const hud = new Hud(() => {}, () => {}, () => {}, () => {}, new MouseSensitivity(() => ({ getItem: () => null, setItem() {}, removeItem() {} })));
  return { hud, element, restore() {
    if (prior) Object.defineProperty(globalThis, 'document', prior);
    else Reflect.deleteProperty(globalThis, 'document');
  } };
}
const player = (game: Game) => game.state.actors.find(actor => actor.id === 'player')!;
function switchTo(game: Game, weapon: WeaponId) {
  game.step([{ actorId: 'player', type: 'switch', weapon }]);
  assert.equal(player(game).weapon, weapon);
}
function spendTo(game: Game, ammo: number) {
  let guard = 0;
  while (player(game).weapons[player(game).weapon].ammo > ammo) {
    assert.ok(++guard < 2000 && game.state.phase === 'live');
    // Fire above the arena using real commands. No snapshot is modified.
    game.step([{ actorId: 'player', type: 'shoot', yaw: 0, pitch: 1.4 }]);
  }
}
function reload(game: Game) {
  game.step([{ actorId: 'player', type: 'reload' }]);
  assert.ok(player(game).reload);
  for (let i = 0; player(game).reload; i++) { assert.ok(i < 120); game.step(); }
}
function consumeReserve(game: Game) {
  while (player(game).weapons[player(game).weapon].reserve > 0) { spendTo(game, 0); reload(game); }
}

for (const weapon of ['rifle', 'pistol'] as const) test(`HUD guides an exhausted ${weapon} to the loaded alternative instead of an impossible reload`, async () => {
  const game = await Game.create(1, [{ id: 'player', team: 'amber' }, { id: 'bot', team: 'blue' }]), dom = installHud();
  const update = () => {
    const state = game.state, before = JSON.stringify(state);
    dom.hud.update(state, state.actors.find(actor => actor.id === 'player')!, 0);
    assert.equal(JSON.stringify(state), before, 'HUD must remain read-only');
    return dom.element('reload').textContent;
  };
  try {
    switchTo(game, weapon);
    assert.equal(update(), '');
    spendTo(game, Math.floor(WEAPONS[weapon].magazine * .2));
    assert.equal(update(), '弹药偏低 · R 换弹');
    spendTo(game, 0);
    assert.equal(update(), '弹匣已空 · R 换弹');
    game.step([{ actorId: 'player', type: 'reload' }]);
    assert.match(update(), /退出弹匣/);
    assert.equal(dom.element('reload-progress').hidden, false);
    while (player(game).reload) game.step();
    consumeReserve(game);
    spendTo(game, Math.floor(WEAPONS[weapon].magazine * .2));
    assert.equal(update(), '备用弹药耗尽');
    spendTo(game, 0);
    const alternative = weapon === 'rifle' ? 'pistol' : 'rifle';
    const key = alternative === 'rifle' ? '1' : '2', name = alternative === 'rifle' ? '步枪' : '手枪';
    assert.equal(update(), `弹药耗尽 · ${key} 切换${name}`);
    game.step([{ actorId: 'player', type: 'reload' }]);
    assert.equal(player(game).reload, null, 'the old R hint asks for a command that Game rejects');
    assert.equal(update(), `弹药耗尽 · ${key} 切换${name}`);
    assert.equal(dom.element('reload-progress').hidden, true);
    switchTo(game, alternative);
    assert.equal(update(), '');
    const before = player(game).weapons[alternative].ammo;
    spendTo(game, before - 1);
    assert.equal(game.state.shots.at(-1)!.weapon, alternative, 'the advised switch reaches a usable weapon');
  } finally { game.dispose(); dom.restore(); }
});

test('a defeated squad player gets waiting feedback instead of unusable controls, then recovers next round', async () => {
  const specs = [
    { id: 'player', team: 'amber' as const, position: { x: 0, y: 0, z: 0 } },
    ...Array.from({ length: 4 }, (_, i) => ({ id: `amber-${i}`, team: 'amber' as const })),
    { id: 'enemy', team: 'blue' as const, position: { x: 0, y: 0, z: 5 } },
    ...Array.from({ length: 4 }, (_, i) => ({ id: `blue-${i}`, team: 'blue' as const })),
  ];
  const game = await Game.create(1, specs, {}, { formation: 'squads-v1' }), dom = installHud();
  const update = () => { const state = game.state, hash = game.stateHash; dom.hud.update(state, state.actors.find(actor => actor.id === 'player')!, 0); assert.equal(game.stateHash, hash); };
  const pauseMenu = () => { dom.element('fatal').hidden = true; dom.element('menu').open = false; const state = game.state; dom.hud.menu(true, state, state.actors.find(actor => actor.id === 'player')!); };
  try {
    spendTo(game, 3); update(); assert.equal(dom.element('reload').textContent, '弹药偏低 · R 换弹');
    game.step([{ actorId: 'enemy', type: 'shoot', yaw: Math.PI, pitch: 0 }]);
    for (let tick = 0; tick < 6; tick++) game.step();
    game.step([{ actorId: 'enemy', type: 'shoot', yaw: Math.PI, pitch: 0 }]);
    assert.equal(player(game).hp, 0); assert.equal(game.state.phase, 'live');
    const defeated = player(game);
    game.step([{ actorId: 'player', type: 'move', x: 1, z: 0 }, { actorId: 'player', type: 'reload' }, { actorId: 'player', type: 'interact', held: true }, { actorId: 'player', type: 'shoot', yaw: 1, pitch: 0 }]);
    assert.deepEqual(player(game), defeated, 'Game rejects dead-player commands while the round continues');
    update();
    assert.equal(dom.element('goal').textContent, '你已被击倒 · 等待本回合结束');
    assert.equal(dom.element('team-status').textContent, '己方 4/5 · 敌方 5/5');
    assert.equal(dom.element('reload').textContent, '');
    assert.equal(dom.element('crosshair').hidden, true); assert.equal(dom.element('hint').hidden, true);
    pauseMenu(); assert.match(dom.element('menu-description').textContent, /已被击倒/);
    assert.doesNotMatch(dom.element('menu-description').textContent, /按住 E/);
    assert.equal(dom.element('start').hidden, false, 'Continue still advances the remaining round');
    while (game.state.phase === 'live') game.step();
    update(); assert.equal(dom.element('goal').textContent, '你已被击倒 · 本回合已结束');
    pauseMenu(); assert.match(dom.element('menu-description').textContent, /回合时间结束/);
    assert.equal(dom.element('next').hidden, false);
    game.nextRound(); update(); // No HUD reset: live state itself restores the affordances.
    assert.equal(player(game).hp, 100);
    assert.equal(dom.element('crosshair').hidden, false); assert.equal(dom.element('hint').hidden, false);
    assert.equal(dom.element('reload').textContent, '');
    assert.doesNotMatch(dom.element('goal').textContent, /击倒/);
    pauseMenu(); assert.doesNotMatch(dom.element('menu-description').textContent, /已被击倒/);
  } finally { game.dispose(); dom.restore(); }
});

test('HUD distinguishes an empty reloadable alternative, two exhausted guns, and the next-round refill', async () => {
  const game = await Game.create(1, [{ id: 'player', team: 'amber' }, { id: 'bot', team: 'blue' }]), dom = installHud();
  const update = () => { const state = game.state; dom.hud.update(state, state.actors.find(actor => actor.id === 'player')!, 0); return dom.element('reload').textContent; };
  try {
    switchTo(game, 'pistol'); spendTo(game, 0);
    switchTo(game, 'rifle'); consumeReserve(game); spendTo(game, 0);
    assert.equal(update(), '弹药耗尽 · 2 切换手枪后 R 换弹');
    switchTo(game, 'pistol'); reload(game);
    assert.equal(update(), '');
    consumeReserve(game); spendTo(game, 0);
    assert.equal(update(), '双武器弹药耗尽');
    switchTo(game, 'rifle');
    assert.equal(update(), '双武器弹药耗尽');
    while (game.state.phase === 'live') game.step();
    game.nextRound(); dom.hud.reset();
    assert.equal(update(), '');
    assert.equal(player(game).weapons.rifle.ammo, WEAPONS.rifle.magazine);
    assert.equal(dom.element('reload-progress').hidden, true);
  } finally { game.dispose(); dom.restore(); }
});
