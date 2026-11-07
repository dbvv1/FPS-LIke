import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../../src/candidates/offline-training-v1/sim/game.js';
import { TrainingMatch, completeMatchRequested, type MatchRound, type MatchSummary } from '../../src/candidates/offline-training-v1/session/match.js';
import { MatchPanel, matchCopy, nextMatchPractice } from '../../src/candidates/offline-training-v1/ui/match-panel.js';

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
      assert.equal(copy.nextPractice === null, i < 6, 'only the final recap adds a practice action');
      assert.equal(copy.halftime,i===3); if(i===3) assert.match(copy.action,/第 4 回合/);
      assert.equal(match.canAdvance(state),i<6);
      if(i<6)game.nextRound();
    }
    assert.deepEqual([match.summary.wins,match.summary.losses,match.summary.complete],[3,3,true]);
    const player=game.state.actors.find(a=>a.id==='player')!;
    assert.equal(matchCopy(game.state,player,match.summary).title,'双方战平');
    assert.equal(matchCopy(game.state,player,match.summary).action,'再打一场');
    assert.match(matchCopy(game.state,player,match.summary).nextPractice!, /3 回合进攻超时落败/);
    const detached=match.summary;detached.rounds[0]!.won=true;assert.equal(match.summary.rounds[0]!.won,false);
    match.reset();assert.equal(match.summary.rounds.length,0);assert.equal(match.summary.complete,false);
    assert.equal(nextMatchPractice(match.summary),null);
  } finally {game.dispose();}
});

function recap(rounds: Partial<MatchRound>[]): MatchSummary {
  return { complete: true, wins: 0, losses: 6, shots: 0, hits: 0, headHits: 0, objectiveWins: 0,
    rounds: Array.from({length: 6}, (_, i) => ({ round: i + 1, side: i < 3 ? 'attack' : 'defend', won: false,
      reason: 'elimination', shots: 0, hits: 0, headHits: 0, ...rounds[i] })) };
}

test('practice chooses one supported objective outcome by count, then recency', () => {
  const summary = recap([{reason:'timeout'}, {reason:'timeout'}, {reason:'defuse'}, {reason:'explosion'}]);
  const before = structuredClone(summary);
  assert.match(nextMatchPractice(summary)!, /2 回合进攻超时落败/);
  assert.doesNotMatch(nextMatchPractice(summary)!, /回防|阻止对手拆除/);
  assert.deepEqual(summary, before);
  const tied = recap([{reason:'timeout'}, {reason:'defuse'}, {}, {reason:'explosion'}]);
  assert.match(nextMatchPractice(tied)!, /1 回合防守时信标引爆/);
  assert.match(nextMatchPractice(recap([{reason:'defuse'}]))!, /下次安放后优先守住信标/);
});

test('practice does not blame a defensive timeout win, elimination, or incomplete match', () => {
  const summary = recap([{}, {}, {}, {reason:'timeout', won:true}, {reason:'defuse', won:true}, {reason:'timeout', won:true}]);
  assert.equal(nextMatchPractice(summary), null);
  assert.equal(nextMatchPractice(recap([{reason:'explosion', won:true}])), null);
  assert.equal(nextMatchPractice({...recap([{reason:'timeout'}]), complete:false}), null);
  assert.equal(nextMatchPractice({...recap([]), rounds:[]}), null);
  // A low hit rate alone says nothing about route, aim, or objective decisions.
  assert.equal(nextMatchPractice({...recap([]), shots:100, hits:0}), null);
});

test('actual MatchPanel renders one practice in its existing paragraph and clears it on a new match', async () => {
  class Element {
    id=''; textContent=''; innerHTML=''; firstChild={textContent:''}; children:Element[]=[];
    classList={add(_name:string){}}; setAttribute(_name:string,_value:string){} after(_node:Element){}
    querySelector(selector:string){return node(selector.slice(1));}
    replaceChildren(){this.children=[];} append(child:Element){this.children.push(child);}
  }
  const elements=new Map<string,Element>();
  function node(id:string){if(!elements.has(id))elements.set(id,new Element());return elements.get(id)!;}
  const previous=Object.getOwnPropertyDescriptor(globalThis,'document');
  Object.defineProperty(globalThis,'document',{configurable:true,value:{createElement:()=>new Element(),getElementById:node}});
  const game=await Game.create(8,[{id:'player',team:'blue'},{id:'bot',team:'amber'}],{roundTicks:1});
  try {
    const match=new TrainingMatch(),panel=new MatchPanel();
    for(let round=1;round<=6;round++){
      game.step();const player=game.state.actors.find(a=>a.id==='player')!;
      match.observe(game.state,player);panel.update(game.state,player,match.summary);
      if(round<6){assert.doesNotMatch(node('match-description').textContent,/下一场练习/);game.nextRound();}
    }
    assert.match(node('match-description').textContent,/3 回合进攻超时落败/);
    assert.doesNotMatch(node('menu-description').textContent,/下一场练习/,'the advice is not duplicated in the menu intro');
    assert.equal(node('match-rounds').children.length,6);
    match.reset();
    const restarted=await Game.create(8,[{id:'player',team:'blue'},{id:'bot',team:'amber'}],{roundTicks:1});
    try {
      panel.update(restarted.state,restarted.state.actors.find(a=>a.id==='player')!,match.summary);
      assert.doesNotMatch(node('match-description').textContent,/下一场练习/);
      assert.equal(node('match-rounds').children.length,0);
      assert.match(node('match-title').textContent,/回合 1 \/ 6/);
    } finally {restarted.dispose();}
  } finally {
    game.dispose();
    if(previous)Object.defineProperty(globalThis,'document',previous);else Reflect.deleteProperty(globalThis,'document');
  }
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
