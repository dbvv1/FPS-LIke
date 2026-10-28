import test from 'node:test';
import assert from 'node:assert/strict';
import { Bot } from '../src/sim/bot.js';
import { Game } from '../src/sim/game.js';
import { Physics } from '../src/sim/physics.js';
import { Navigation, initNavigation } from '../src/sim/navigation.js';
import { squadSpecs, squadBots, squadsRequested } from '../src/session/squads.js';
import { squadPlan } from '../src/sim/squads.js';
import { MAP } from '../src/content/map.js';
import { runSquadMatch } from '../tools/squads-sim.js';
import type { PlayerSpec } from '../src/sim/types.js';

await initNavigation();
const formation = { formation: 'squads-v1' } as const;

test('squads is an explicit versioned opt-in and old actor caps remain intact', async () => {
  assert.equal(squadsRequested(''), false);
  assert.equal(squadsRequested('?squads=offline-v1&match=complete-v1'), true);
  assert.throws(() => squadsRequested('?squads=other'));
  assert.throws(() => squadsRequested('?squads=offline-v1&squads=offline-v1'));
  const specs = squadSpecs('normal');
  assert.equal(specs.length, 10); assert.equal(specs.filter(s => !s.bot).length, 1);
  assert.equal(new Set(specs.map(s => s.id)).size, 10);
  await assert.rejects(Game.create(1, specs), /1.3|actors|team/i);
  const game = await Game.create(1, specs, {}, formation);
  try { assert.equal(game.state.actors.length, 10); assert.deepEqual(game.options, formation); }
  finally { game.dispose(); }
  const tooMany: PlayerSpec[] = [...specs, { id: 'extra', team: 'amber', bot: 'normal' }];
  await assert.rejects(Game.create(1, tooMany, {}, formation));
  const oldSpecs: PlayerSpec[] = [{ id: 'a', team: 'amber' }, { id: 'b', team: 'blue' }];
  const a = await Game.create(7, oldSpecs), b = await Game.create(7, oldSpecs, {}, {});
  try { for (let i = 0; i < 30; i++) { a.step([]); b.step([]); } assert.equal(a.stateHash, b.stateHash); }
  finally { a.dispose(); b.dispose(); }
});

test('squad deployment and side swap are physically clear, reachable, spaced and not mutually visible', async () => {
  const game = await Game.create(1, squadSpecs('normal'), { roundTicks: 1 }, formation), nav = new Navigation();
  try {
    for (let round = 1; round <= 4; round++) {
      const actors = game.state.actors, physics = new Physics(actors);
      try {
        assert.equal(actors.find(a => a.id === 'player')!.side, round < 4 ? 'attack' : 'defend');
        for (const actor of actors) {
          assert.ok(physics.canStand(actor), `${actor.id} standing collision`);
          assert.ok(nav.path(actor.position, MAP.site).length > 1, `${actor.id} has no objective route`);
          for (const other of actors) {
            if (other.id === actor.id) continue;
            assert.ok(Math.hypot(actor.position.x - other.position.x, actor.position.z - other.position.z) >= .65, 'spawn overlap');
            if (other.team !== actor.team) assert.equal(physics.visible(actor, other), false, `${actor.id} sees ${other.id} on deployment`);
          }
        }
      } finally { physics.dispose(); }
      if (round < 4) { game.step([]); assert.equal(game.state.phase, 'over'); game.nextRound(); }
    }
  } finally { game.dispose(); nav.dispose(); }
});

test('planner decisions do not depend on a hidden enemy position', async () => {
  const specs = squadSpecs('normal');
  const a = await Game.create(4, specs, {}, formation), b = await Game.create(4, specs, {}, formation);
  try {
    // Change only enemy state through the same public command API, while it is
    // out of sight and moving silently. No test-only GameState mutation.
    b.step([{ actorId: 'blue-1', type: 'move', x: .2, z: 0, walk: true }]); a.step([]);
    const oa = a.observe('amber-1'), ob = b.observe('amber-1');
    assert.notDeepEqual(a.state.actors.find(v => v.id === 'blue-1')!.position, b.state.actors.find(v => v.id === 'blue-1')!.position);
    assert.deepEqual(oa, ob, 'hidden movement must not leak through legal observations');
    assert.deepEqual(squadPlan(oa, 1), squadPlan(ob, 1));
    const nav = new Navigation();
    try {
      const ba = squadBots('normal', 4, nav).find(v => v.id === 'amber-1')!, bb = squadBots('normal', 4, nav).find(v => v.id === 'amber-1')!;
      assert.deepEqual(ba.commands(oa), bb.commands(ob));
    } finally { nav.dispose(); }
  } finally { a.dispose(); b.dispose(); }
});

test('normal-rule idle-player nine-bot match completes six rounds with side swap and deterministic replay', async () => {
  const a = await runSquadMatch(1), b = await runSquadMatch(1);
  assert.equal(a.botCount, 9); assert.equal(a.complete, true); assert.equal(a.noLosShots, 0);
  assert.deepEqual(a.rounds.map(r => r.side), ['attack','attack','attack','defend','defend','defend']);
  assert.equal(a.rounds.length, 6); assert.deepEqual(a, b);
  for (const [id, activity] of Object.entries(a.activity)) {
    assert.ok(activity.commands > 0, `${id} missing controller commands`);
    assert.ok(activity.distance > .5, `${id} stationary across complete match`);
  }
  assert.ok(Object.values(a.activity).some(v => v.shots > 0));
});

test('objective owner is unique and transfers after death without overlapping cover assignments', async () => {
  const game = await Game.create(1, squadSpecs('normal'), {}, formation);
  try {
    const observations = Array.from({length:5}, (_,slot) => {
      const o = game.observe(`blue-${slot+1}`);
      o.bomb = { planted: true, carrier: null, position: {x:0,y:0,z:10} };
      return o;
    });
    const plans = observations.map((o,i)=>squadPlan(o,i));
    const owners = plans.flatMap((p,i)=>p.role==='defuse'?[i]:[]);
    assert.equal(owners.length, 1);
    const ownerId=observations[owners[0]!]!.self.id;
    const cover = plans.filter(p=>p.role==='cover').map(p=>JSON.stringify(p.goal));
    assert.equal(new Set(cover).size,cover.length);
    for(const o of observations) {
      const fallen=o.allies!.find(a=>a.id===ownerId)!; fallen.hp=0;
      if(o.self.id===ownerId)o.self.hp=0;
    }
    const next=observations.map((o,i)=>squadPlan(o,i));
    const replacement=next.flatMap((p,i)=>p.role==='defuse'?[i]:[]);
    assert.equal(replacement.length,1);assert.notEqual(replacement[0],owners[0]);
    for(const o of observations){o.self.side='attack';o.bomb.planted=false;o.bomb.carrier=null;}
    const recover=observations.map((o,i)=>squadPlan(o,i));
    assert.equal(recover.filter(p=>p.role==='recover').length,1);
    const recoveryIndex=recover.findIndex(p=>p.role==='recover'),recoveryId=observations[recoveryIndex]!.self.id;
    for(const o of observations){o.allies!.find(a=>a.id===recoveryId)!.hp=0;if(o.self.id===recoveryId)o.self.hp=0;}
    const recoveryAfterDeath=observations.map((o,i)=>squadPlan(o,i));
    assert.equal(recoveryAfterDeath.filter(p=>p.role==='recover').length,1);
    assert.notEqual(recoveryAfterDeath.findIndex(p=>p.role==='recover'),recoveryIndex);
  }finally{game.dispose();}
});

test('carrier does not retain an already-reached approach waypoint', async () => {
  const game=await Game.create(1,squadSpecs('normal'),{},formation);
  try {
    const o=game.observe('amber-1');o.self.position={x:-8.149901928380132,y:0,z:-10.239993249997497};
    o.bomb.carrier=o.self.id;
    const plan=squadPlan(o,0);
    assert.ok(Math.hypot(plan.goal.x-o.self.position.x,plan.goal.z-o.self.position.z)>.35,'reached approach must advance; old z<-9.5 gate trapped carrier at z=-10');
  }finally{game.dispose();}
});

// Frozen before squad changes from d6ef8f4 (same tree as 57d5ed0).
test('default 1v1 and 3v3 retain pre-squad gameplay replay hashes',async()=>{
 const nav=new Navigation();
 try{for(const [n,ticks,expected] of [[1,115,'0b74d234'],[3,136,'f8f5175e']] as const){
 const specs:PlayerSpec[]=(['amber','blue'] as const).flatMap(team=>Array.from({length:n},(_,i)=>({id:`${team}-${i}`,team,bot:'normal' as const})));
 const g=await Game.create(1,specs),bots=specs.map((s,i)=>new Bot(s.id,'normal',i+1,nav));
 try{while(g.state.phase==='live'&&g.state.tick<6000)g.step(bots.flatMap(b=>b.commands(g.observe(b.id))));assert.equal(g.state.tick,ticks);assert.equal(g.stateHash,expected);}finally{g.dispose();}
 }}finally{nav.dispose();}
});

test('actual squad Bot advances approach navigation and does not regress after being pushed back',async()=>{
 const nav=new Navigation(),g=await Game.create(1,squadSpecs('normal'),{},formation);
 const goals:{x:number;y:number;z:number}[]=[];
 const original=nav.path.bind(nav);nav.path=(from,to)=>{goals.push({...to});return original(from,to);};
 try{
 const bot=squadBots('normal',1,nav).find(b=>b.id==='amber-1')!,o=g.observe('amber-1');
 o.enemies=[];o.sounds=[];o.self.position={x:-8.149901928380132,y:0,z:-10.239993249997497};o.bomb.carrier=o.self.id;
 const commands=bot.commands(o);assert.ok(commands.some(c=>c.type==='move'&&(c.x!==0||c.z!==0)));assert.ok(goals.at(-1)!.z>0);
 o.time+=60000;o.self.position={x:-8,y:0,z:-12};bot.commands(o);assert.ok(goals.at(-1)!.z>0,'stage must not regress after displacement');
 }finally{g.dispose();nav.dispose();}
});
