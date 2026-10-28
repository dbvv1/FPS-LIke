import { Bot } from '../sim/bot.js';
import type { Navigation } from '../sim/navigation.js';
import type { Difficulty, PlayerSpec } from '../sim/types.js';
export function squadsRequested(search:string){
 const values=new URLSearchParams(search).getAll('squads');
 if(!values.length)return false;
 if(values.length!==1||values[0]!=='offline-v1')throw new Error('Unknown squads candidate; use ?squads=offline-v1');
 return true;
}
export function squadSpecs(difficulty:Difficulty):PlayerSpec[]{
 return [{id:'player',team:'amber'},...Array.from({length:4},(_,i)=>({id:`amber-${i+1}`,team:'amber' as const,bot:difficulty})),...Array.from({length:5},(_,i)=>({id:`blue-${i+1}`,team:'blue' as const,bot:difficulty}))];
}
export function squadBots(difficulty:Difficulty,seed:number,nav:Navigation):Bot[]{
 return squadSpecs(difficulty).filter(s=>s.bot).map((s,i)=>new Bot(s.id,difficulty,(seed ^ Math.imul(i+1,0x9e3779b9))>>>0,nav,'rifle',Number(s.id.split('-')[1])-1));
}
