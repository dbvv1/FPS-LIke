import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/sim/game.js';
import { TrainingMatch, completeMatchRequested } from '../src/session/match.js';
import { matchCopy } from '../src/ui/match-panel.js';

test('six actual timeout rounds swap after three, finish tied, and do not mutate gameplay', async () => {
  const game = await Game.create(1, [{id:'player',team:'amber'},{id:'bot',team:'blue'}], {roundTicks:1});
  const match = new TrainingMatch();
  try {
    for (let i = 1; i <= 6; i++) {
      assert.equal(match.canAdvance(game.state), false);
      game.step(); const state=game.state, player=state.actors[0]!.id==='player'?state.actors[0]!:state.actors[1]!;
      const hash=game.stateHash; match.observe(state,player); match.observe(state,player);
      assert.equal(game.stateHash,hash); assert.equal(match.summary.rounds.length,i);
      assert.equal(player.side,i<=3?'attack':'defend');
      const copy=matchCopy(state,player,match.summary);
      assert.equal(copy.halftime,i===3); if(i===3) assert.match(copy.action,/第 4 回合/);
      assert.equal(match.canAdvance(state),i<6);
      if(i<6)game.nextRound();
    }
    assert.deepEqual([match.summary.wins,match.summary.losses,match.summary.complete],[3,3,true]);
    const player=game.state.actors.find(a=>a.id==='player')!;
    assert.equal(matchCopy(game.state,player,match.summary).title,'双方战平');
    assert.equal(matchCopy(game.state,player,match.summary).action,'再打一场');
    const detached=match.summary;detached.rounds[0]!.won=true;assert.equal(match.summary.rounds[0]!.won,false);
    match.reset();assert.equal(match.summary.rounds.length,0);assert.equal(match.summary.complete,false);
  } finally {game.dispose();}
});

test('recap records only local enemy hits and settled objective victories without leaking enemies',async()=>{
 const game=await Game.create(2);try{
 const s=game.state,p=s.actors[0]!;s.phase='over';s.result={winner:p.side,team:p.team,reason:'explosion',time:1};
 const shot={actorId:p.id,weapon:'rifle' as const,time:0,yaw:0,pitch:0,hit:s.actors[1]!.id,part:'head' as const,damage:10,visible:true,targetId:null,targetVisible:false};
 s.shots=[shot,{...shot,hit:null,part:null},{...shot,hit:p.id},{...shot,actorId:s.actors[1]!.id}];
 const m=new TrainingMatch();m.observe(s,p);assert.equal(m.summary.shots,3);assert.equal(m.summary.hits,1);assert.equal(m.summary.headHits,1);assert.equal(m.summary.objectiveWins,1);
 assert.deepEqual(Object.keys(m.summary.rounds[0]!),['round','side','won','reason','shots','hits','headHits']);
 }finally{game.dispose();}
});

test('candidate opt-in fails closed without changing the default route',()=>{
 assert.equal(completeMatchRequested(''),false);assert.equal(completeMatchRequested('?foo=1'),false);
 assert.equal(completeMatchRequested('?match=complete-v1'),true);
 for(const s of ['?match=','?match=other','?match=complete-v1&match=complete-v1'])assert.throws(()=>completeMatchRequested(s));
});
