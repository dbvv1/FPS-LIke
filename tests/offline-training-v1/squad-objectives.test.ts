import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../../src/candidates/offline-training-v1/sim/game.js';
import { Bot } from '../../src/candidates/offline-training-v1/sim/bot.js';
import { Navigation, initNavigation } from '../../src/candidates/offline-training-v1/sim/navigation.js';
await initNavigation();
test('real squad bot plants, then a defender fights and defuses the live objective',async()=>{
 const nav=new Navigation();
 const game=await Game.create(9,[{id:'a',team:'amber',bot:'normal',position:{x:0,y:0,z:10}},{id:'d',team:'blue',bot:'hard',position:{x:0,y:0,z:6}}],{}, {formation:'squads-v1'});
 const planter=new Bot('a','normal',8,nav,'rifle',0),defuser=new Bot('d','hard',3,nav,'rifle',0);
 try{
   let ticks=0;
   while(!game.state.bomb.planted && game.state.phase==='live' && ticks++<600)game.step(planter.commands(game.observe('a')));
   assert.equal(game.state.bomb.planted,true,'actual Bot commands must complete a real plant');
   ticks=0;
   while(game.state.phase==='live' && ticks++<1500)game.step(defuser.commands(game.observe('d')));
   assert.equal(game.state.result?.reason,'defuse');
   assert.equal(game.state.result?.team,'blue');
   assert.ok(game.state.shots.length>0,'defuser must fight the visible enemy before interacting');
   assert.ok(game.state.shots.every(s=>s.targetVisible));
 }finally{game.dispose();nav.dispose();}
});
