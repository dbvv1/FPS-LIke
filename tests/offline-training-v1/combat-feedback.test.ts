import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../../src/candidates/offline-training-v1/sim/game.js';
import { angles } from '../../src/candidates/offline-training-v1/sim/math.js';
import { eye } from '../../src/candidates/offline-training-v1/sim/physics.js';
import { Feedback } from '../../src/candidates/offline-training-v1/render/feedback.js';
import { damageCue, impactAppearance, DAMAGE_RECTS, DAMAGE_CUE_COLOR } from '../../src/candidates/offline-training-v1/render/combat-feedback.js';
import { CanvasView } from '../../src/candidates/offline-training-v1/render/canvas.js';
import { css } from '../../src/candidates/offline-training-v1/render/yard.js';
import type { PlayerSpec } from '../../src/candidates/offline-training-v1/sim/types.js';
const duel: PlayerSpec[] = [{ id: 'player', team: 'amber', position: { x: 0, y: 0, z: 0 } }, { id: 'enemy', team: 'blue', position: { x: 0, y: 0, z: 5 } }];
const actor = (game: Game, id = 'player') => game.state.actors.find(a => a.id === id)!;
const shoot = (game: Game, from: string, to: string, at = 0) => ({ actorId: from, type: 'shoot' as const, ...angles(eye(actor(game, from)), eye(actor(game, to))), at });

test('one real crossfire yields independent own-hit and self-damage facts without changing aim or simulation', async () => {
  const game = await Game.create(1, duel), feedback = new Feedback();
  try {
    game.step([shoot(game, 'player', 'enemy', 100), shoot(game, 'enemy', 'player', 500)]);
    const state = game.state, player = actor(game), hash = game.stateHash, effects = feedback.update(state, 1000);
    assert.equal(player.hp, 16); assert.equal(actor(game, 'enemy').hp, 16);
    assert.ok(damageCue(effects, player) > .95);
    assert.equal(impactAppearance(state, player, effects[0]!).kind, 'enemy-head');
    assert.equal(impactAppearance(state, player, effects[1]!).kind, 'ordinary');
    assert.equal(game.stateHash, hash);
    const strength = damageCue(effects, player); assert.equal(strength, damageCue(feedback.update(state, 9000), player), 'pause does not invent elapsed simulation time');
  } finally { game.dispose(); }
});
test('damage reads authoritative actor impacts, never HP loss alone or missing legacy impact', async () => {
  const game = await Game.create(1, duel), feedback = new Feedback();
  try {
    game.step([shoot(game, 'enemy', 'player')]); const state = game.state;
    assert.ok(damageCue(feedback.update(state, 0), actor(game)) > 0);
    feedback.reset(); const legacy = { ...state, shots: state.shots.map(({ impact: _impact, ...shot }) => shot) };
    assert.equal(damageCue(feedback.update(legacy, 10), actor(game)), 0);
    assert.equal(damageCue([], { ...actor(game), hp: 0 }), 0);
  } finally { game.dispose(); }
});
test('friendly damage still hurts, but own friendly hits never receive enemy kill presentation', async () => {
  const specs: PlayerSpec[] = [...duel, { id: 'friend', team: 'amber', position: { x: 0, y: 0, z: 2 } }];
  const game = await Game.create(1, specs), feedback = new Feedback();
  try {
    game.step([shoot(game, 'player', 'friend')]); let state = game.state, effects = feedback.update(state, 0);
    assert.equal(impactAppearance(state, actor(game), effects[0]!).kind, 'friendly');
    assert.equal(impactAppearance(state, actor(game), effects[0]!).enemy, false);
    assert.ok(damageCue(effects, actor(game, 'friend')) > 0);
    for (let i=0;i<30;i++) game.step(); game.step([shoot(game, 'player', 'friend')]);
    state = game.state; effects = feedback.update(state, 1000);
    assert.equal(state.shots.at(-1)!.impact!.killed, true);
    assert.equal(impactAppearance(state, actor(game), effects.at(-1)!).kind, 'friendly');
    assert.equal(impactAppearance(state, null, effects.at(-1)!).kind, 'ordinary', 'observer has no local success channel');
  } finally { game.dispose(); }
});
test('hit classification uses immutable killed and rejects unknown targets rather than late HP credit', async () => {
  const game = await Game.create(1, duel), feedback = new Feedback();
  try {
    game.step([shoot(game, 'player', 'enemy')]);
    for(let i=0;i<12;i++)game.step();game.step([shoot(game,'player','enemy')]);
    const state = game.state, effects = feedback.update(state, 1000), player = actor(game);
    assert.equal(state.phase, 'over'); assert.equal(impactAppearance(state, player, effects[0]!).kind, 'enemy-head');
    assert.equal(impactAppearance(state, player, effects[1]!).kind, 'enemy-kill');
    assert.equal(impactAppearance({ ...state, actors: [player] }, player, effects[1]!).kind, 'ordinary');
  } finally { game.dispose(); }
});
test('real fatal incoming hit expires on the settled tail and does not survive next-round reset', async () => {
  const game = await Game.create(1, duel), feedback = new Feedback();
  try {
    game.step([shoot(game, 'enemy', 'player')]); for(let i=0;i<30;i++)game.step();game.step([shoot(game,'enemy','player')]);
    const state=game.state, player=actor(game); assert.equal(state.phase,'over');assert.equal(player.hp,0);
    assert.ok(damageCue(feedback.update(state,1000),player)>0);
    assert.equal(damageCue(feedback.update(state,1401),player),0);
    feedback.reset(); game.nextRound(); assert.equal(damageCue(feedback.update(game.state,1500),actor(game)),0);
  } finally { game.dispose(); }
});

test('Canvas fallback actually draws the same damage brackets and keeps center clear across reset', async () => {
  const rectangles: { color: string; alpha: number; xy: number[] }[] = [];
  const saved: { color: string; alpha: number }[] = [];
  const context = { fillStyle:'', globalAlpha:1, createImageData:(width:number,height:number)=>({width,height,data:new Uint8ClampedArray(width*height*4)}), putImageData(){}, createLinearGradient(){return{addColorStop(){}};}, fillRect(...xy:number[]){rectangles.push({color:String(this.fillStyle),alpha:this.globalAlpha,xy});}, beginPath(){},moveTo(){},lineTo(){},stroke(){},fill(){},closePath(){},fillText(){},clearRect(){},save(){saved.push({color:this.fillStyle,alpha:this.globalAlpha});},restore(){const value=saved.pop()!;this.fillStyle=value.color;this.globalAlpha=value.alpha;} };
  const canvas={clientWidth:320,clientHeight:240,width:0,height:0,getContext:()=>context};
  const game=await Game.create(1,duel), view=new CanvasView(canvas as unknown as HTMLCanvasElement);
  try {
    game.step([shoot(game,'player','enemy',100),shoot(game,'enemy','player',500)]);
    const hash=game.stateHash;view.render(game.state,actor(game),0,0,0,1/60);
    const bars=rectangles.filter(r=>r.color===css(DAMAGE_CUE_COLOR)&&r.alpha<1);
    assert.equal(bars.length,DAMAGE_RECTS.length);assert.equal(view.info.combatFeedback.damageActive,true);
    assert.ok(view.info.combatFeedback.enemyImpactSubmissions>0);assert.equal(game.stateHash,hash);
    for(const bar of bars){const[x,y,w,h]=bar.xy;assert.ok(x!>=0&&x!+w!<=canvas.width&&y!>=0&&y!+h!<=canvas.height);assert.ok(x!+w!<canvas.width*.15||x!>canvas.width*.85);}
    assert.equal(context.globalAlpha,1);
    view.reset();assert.deepEqual(view.info.combatFeedback,{damageActive:false,enemyImpactSubmissions:0});
    view.dispose();assert.equal(view.info.combatFeedback.damageActive,false);
  } finally {game.dispose();view.dispose();}
});

test('real body hits differ from head/kill while world and range shots remain ordinary impacts', async () => {
  const game=await Game.create(1,duel), wall=await Game.create(1);
  try {
    const player=actor(game), enemy=actor(game,'enemy');
    game.step([{actorId:'player',type:'shoot',...angles(eye(player),{...enemy.position,y:.95})}]);
    let effects=new Feedback().update(game.state,0);
    assert.equal(effects[0]!.shot.part,'body');assert.equal(impactAppearance(game.state,actor(game),effects[0]!).kind,'enemy-body');
    assert.equal(damageCue(effects,actor(game)),0);
    for(let i=0;i<12;i++)game.step();game.step([{actorId:'player',type:'shoot',yaw:0,pitch:1.4}]);
    effects=new Feedback().update(game.state,1000);assert.equal(effects.at(-1)!.shot.impact!.kind,'range');
    assert.equal(impactAppearance(game.state,actor(game),effects.at(-1)!).kind,'ordinary');
    const p=wall.state.actors.find(a=>a.side==='attack')!;wall.step([{actorId:p.id,type:'shoot',yaw:0,pitch:0}]);
    effects=new Feedback().update(wall.state,0);assert.equal(effects[0]!.shot.impact!.kind,'world');assert.equal(impactAppearance(wall.state,p,effects[0]!).kind,'ordinary');
  } finally {game.dispose();wall.dispose();}
});
