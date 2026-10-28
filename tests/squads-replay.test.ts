import test from 'node:test';
import assert from 'node:assert/strict';
import { Game, type GameOptions } from '../src/sim/game.js';
import { Navigation, initNavigation } from '../src/sim/navigation.js';
import { squadSpecs, squadBots } from '../src/session/squads.js';
import type { Command, PlayerSpec } from '../src/sim/types.js';
await initNavigation();
test('serialized versioned squad command tape replays without running controllers',async()=>{
 const nav=new Navigation(), specs=squadSpecs('normal'), options={formation:'squads-v1'} as const;
 const a=await Game.create(1,specs,{},options),bots=squadBots('normal',1,nav);
 let b:Game|undefined;
 const ticks:Command[][]=[];
 try{
   while(a.state.phase==='live'&&ticks.length<6000){const commands=bots.flatMap(bot=>bot.commands(a.observe(bot.id)));ticks.push(commands);a.step(commands);}
   assert.equal(a.state.phase,'over');
   const tape=JSON.parse(JSON.stringify({seed:1,specs,options,ticks})) as {seed:number;specs:PlayerSpec[];options:GameOptions;ticks:Command[][]};
   await assert.rejects(Game.create(tape.seed,tape.specs,{},{}),/actors/,'dropping formation must not silently recreate a 10-actor old replay');
   await assert.rejects(Game.create(tape.seed,tape.specs,{}, {formation:'tampered-v2'} as unknown as GameOptions),/formation/);
   b=await Game.create(tape.seed,tape.specs,{},tape.options);
   for(const commands of tape.ticks)b.step(commands);
   assert.equal(b.stateHash,a.stateHash);assert.deepEqual(b.state,a.state);
 }finally{a.dispose();b?.dispose();nav.dispose();}
});
