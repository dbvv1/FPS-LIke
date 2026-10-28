import type { Actor, GameState } from '../sim/types.js';
import { MATCH_ROUNDS, type MatchSummary } from '../session/match.js';

const reasonText = { elimination: '歼灭', timeout: '守时', explosion: '引爆', defuse: '拆除' };
export function matchCopy(state: GameState, player: Actor, summary: MatchSummary) {
  const halftime = state.phase === 'over' && state.round === 3 && !summary.complete;
  const side = player.side === 'attack' ? '进攻' : '防守';
  const title = summary.complete ? summary.wins > summary.losses ? '整场胜利' : summary.wins < summary.losses ? '整场失利' : '双方战平' : halftime ? '半场结束 · 交换攻守' : `${side}阶段 · 回合 ${state.round} / ${MATCH_ROUNDS}`;
  const description = summary.complete ? `最终比分 ${summary.wins} : ${summary.losses}。两侧各打三回合；重新部署可开始一场新训练赛。` : halftime ? `前三回合 ${summary.wins} : ${summary.losses}。下一回合改守中继场：阻止安放，信标落地后必须拆除。` : player.side === 'attack' ? '三条路线抵近目标。击倒对手，或按住 E 安放后守到引爆；不要只追击而错过倒计时。' : '守住三条入口。未安放时可守到超时；已经安放后，击倒敌人仍不能替代拆除。';
  return { title, description, halftime,
    action: summary.complete ? '再打一场' : halftime ? '交换攻守 · 第 4 回合' : '下一回合',
    progress: `${Math.min(state.round, MATCH_ROUNDS)} / ${MATCH_ROUNDS} 回合 · ${side}`,
    recap: summary.rounds.map(r => `${r.round} ${r.side === 'attack' ? '攻' : '守'} · ${r.won ? '胜' : '负'} · ${reasonText[r.reason]}`),
    stats: `命中 ${summary.hits} / ${summary.shots} 发${summary.shots ? `（${Math.round(summary.hits / summary.shots * 100)}%）` : ''} · 要害 ${summary.headHits} · 目标获胜 ${summary.objectiveWins}` };
}

export class MatchPanel {
  private panel: HTMLElement;
  private signature = '';
  constructor() {
    this.panel = document.createElement('section'); this.panel.id = 'match-summary'; this.panel.setAttribute('aria-label', '六回合训练赛记录');
    this.panel.innerHTML = '<h3 id="match-title"></h3><p id="match-description"></p><ol id="match-rounds"></ol><p id="match-stats"></p>';
    document.getElementById('menu-description')!.after(this.panel);
    document.getElementById('menu')!.classList.add('complete-match');
  }
  update(state: GameState, player: Actor, summary: MatchSummary) {
    const copy = matchCopy(state, player, summary);
    const signature = JSON.stringify(copy);
    if (signature !== this.signature) {
      this.signature = signature;
      this.panel.querySelector('#match-title')!.textContent = copy.title;
      this.panel.querySelector('#match-description')!.textContent = copy.description;
      const list = this.panel.querySelector('#match-rounds')!; list.replaceChildren();
      for (const text of copy.recap) { const item = document.createElement('li'); item.textContent = text; list.append(item); }
      this.panel.querySelector('#match-stats')!.textContent = copy.stats;
    }
    const next = document.getElementById('next') as HTMLButtonElement;
    if (state.phase === 'over') next.firstChild!.textContent = `${copy.action} `;
    document.getElementById('round')!.textContent = copy.progress;
    if (summary.complete) {
      document.getElementById('menu-kicker')!.textContent = '六回合训练赛结束';
      document.getElementById('menu-title')!.textContent = copy.title;
      document.getElementById('menu-description')!.textContent = copy.description;
    }
  }
}
