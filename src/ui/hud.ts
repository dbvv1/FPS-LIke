import { accuracyReticle } from './accuracy.js';
import { MouseSensitivity } from '../input/sensitivity.js';
import { SensitivityMenu } from './sensitivity-menu.js';
import { WEAPONS } from '../content/weapons.js';
import { localShotResult, weaponPose } from '../render/weapon.js';
import { MAP } from '../content/map.js';
import { SECOND, type Actor, type GameState } from '../sim/types.js';
const element = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
export class Hud {
  private lastHp = 100;
  private round = 0;
  constructor(private onStart: () => void, private onNext: () => void, private onRestart: () => void, private onMute: (on: boolean) => void, sensitivity: MouseSensitivity) {
    element('hud').innerHTML = `<header class="topbar"><div class="brand">RELAY <b>YARD</b><span>单点攻防 / ORIGINAL FPS</span></div><div class="score"><b id="score-a">0</b><span id="round">回合 01</span><b id="score-d">0</b></div><button id="pause-button" title="暂停 (Esc)">Ⅱ</button></header><div class="objective"><span id="side">进攻</span><b id="timer">01:10</b><p id="goal">推进至信标区域 · 按住 E 安放</p></div><div id="crosshair"><i></i><i></i><i></i><i></i><span></span></div><div id="hitmarker" aria-hidden="true"><i></i><i></i><i></i><i></i></div><div id="shot-result" aria-live="off"></div><div id="hurt"></div><div id="interaction" hidden><span id="interaction-label"></span><progress id="progress" max="1" value="0"></progress></div><footer class="bottom"><div class="health"><span>生命</span><b id="hp">100</b><div><i id="hp-bar"></i></div></div><div class="hint" id="hint">WASD 移动 · Shift 静步 · Ctrl 蹲伏<br>鼠标射击 · R 换弹 · 1 / 2 切枪 · Esc 暂停</div><div class="ammo"><span id="weapon">RX-24 / 步枪</span><b id="ammo">24 <small>/ 72</small></b><em id="reload"></em><progress id="reload-progress" max="1" value="0" hidden></progress></div></footer>`;
    element('menu').innerHTML = `<div class="intro"><p class="eyebrow">FPS-LIKE · LOCAL PROTOTYPE</p><h1>RELAY<br><span>YARD.</span></h1><p class="subtitle">三条路线。一个目标。<br>在中继场的掩体之间，拿下这一回合。</p><div class="features"><span>01 <b>抵近信标</b></span><span>02 <b>安放 / 拆除</b></span><span>03 <b>交替攻防</b></span></div></div><div class="menu-card"><p id="menu-kicker">训练部署</p><h2 id="menu-title">准备进入中继场</h2><p id="menu-description">你与一名机器人对抗。先清理对手，或潜入目标点安放信标。每三回合换边。</p><label class="field">机器人难度<select id="difficulty"><option value="easy">入门 · 迟缓反应</option><option value="normal">标准 · 均衡瞄准</option><option value="hard">精锐 · 快速压枪</option></select></label><p class="field-note">修改难度后点击“重新开始”生效。</p><button class="primary" id="start">进入靶场 <span>→</span></button><button class="primary" id="next" hidden>下一回合 <span>→</span></button><div class="secondary"><button id="restart">重新开始</button><label><input id="audio" type="checkbox" checked>合成音效</label></div><div id="aim-settings-host"></div><p id="lock-error" role="status"></p><p class="footnote">点击后锁定鼠标 · Esc 退出锁定并暂停<br>桌面键盘与鼠标 · 原创程序化场景</p></div><details id="diagnostics"><summary>运行诊断</summary><pre id="debug-state"></pre></details>`;
    const settings = new SensitivityMenu(sensitivity, element('aim-settings-host'));
    const back = () => { if (!settings.back()) this.focusMenuAction(); };
    // Handle the keyboard action directly: repeated native close requests need not
    // remain cancelable. Escape must never silently dismiss pause or resume play.
    element('menu').addEventListener('keydown', event => {
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); back(); }
    });
    element<HTMLDialogElement>('menu').addEventListener('cancel', event => { event.preventDefault(); back(); });
    element('start').onclick = () => { if (settings.canPlay()) onStart(); }; element('next').onclick = () => { if (settings.canPlay()) onNext(); }; element('restart').onclick = () => { if (settings.canPlay()) onRestart(); };
    element<HTMLInputElement>('audio').onchange = () => onMute(element<HTMLInputElement>('audio').checked);
  }
  get difficulty() { return element<HTMLSelectElement>('difficulty').value as 'easy' | 'normal' | 'hard'; }
  setBusy(busy: boolean) {
    for (const id of ['start', 'next', 'restart']) element<HTMLButtonElement>(id).disabled = busy;
    if (!busy && element<HTMLDialogElement>('menu').open) this.restoreMenuFocus();
  }
  message(text: string) { element('lock-error').textContent = text; }
  menu(visible: boolean, state?: GameState, player?: Actor) {
    visible = visible && element('fatal').hidden !== false; // A late unlock must not cover a fatal error.
    const menu = element<HTMLDialogElement>('menu');
    element('hud').classList.toggle('dimmed', visible);
    if (!visible) {
      if (menu.open) { menu.close(); element('stage').focus({preventScroll:true}); }
      return;
    }
    if (state && player) {
      const result = state.result;
      element('start').hidden = !!result; element('next').hidden = !result;
      element('menu-kicker').textContent = result ? `回合 ${state.round} 结束` : state.tick ? '已暂停' : '训练部署';
      element('menu-title').textContent = result ? result.team === player.team ? '这一回合，拿下了。' : '调整路线，再来一局。' : state.tick ? '战场正在等你' : '准备进入中继场';
      element('menu-description').textContent = result ? ({ elimination: result.team === player.team ? '对手被全部击倒。' : '你方成员全部倒下。下一回合可尝试更隐蔽的路线。', timeout: '回合时间结束，防守方守住了中继场。', explosion: '信标已引爆，进攻方完成目标。', defuse: '信标已拆除，防守方完成目标。' }[result.reason]) : '先清理对手，或推进目标点。按住 E 安放 / 拆除；移动、开枪、换弹会中断进度。';
      element('start').firstChild!.textContent = state.tick ? '继续回合 ' : '进入靶场 ';
    }
    if (!menu.open) { menu.showModal(); this.focusMenuAction(); }
    else this.restoreMenuFocus();
  }
  private restoreMenuFocus() {
    const active = document.activeElement;
    if (!(active instanceof HTMLElement) || !element('menu').contains(active) || !active.getClientRects().length || active.matches(':disabled')) this.focusMenuAction();
  }
  private focusMenuAction() {
    const action = element<HTMLButtonElement>(element('next').hidden ? 'start' : 'next');
    if (!action.disabled) action.focus({preventScroll:true});
  }
  update(state: GameState, player: Actor, now: number) {
    if (state.round !== this.round) { this.round = state.round; this.lastHp = player.hp; }
    const result = localShotResult(state, player), pose = weaponPose(state, player);
    const resultVisible = !!result && result.kind !== 'miss' && result.age < (result.kind === 'kill' ? .8 : .32);
    element('hitmarker').classList.toggle('show', resultVisible);
    element('hitmarker').dataset.kind = result?.kind ?? '';
    element('shot-result').textContent = resultVisible ? result!.kind === 'kill' ? '击倒确认' : result!.kind === 'head' ? '要害命中' : result!.kind === 'friendly' ? '友军命中' : '' : '';
    element('shot-result').dataset.kind = result?.kind ?? '';
    const accuracy = accuracyReticle(player, state.time, element('stage').clientHeight);
    element('crosshair').style.setProperty('--spread', `${accuracy.gap}px`);
    element('crosshair').classList.toggle('reloading', !!player.reload);
    if (player.hp < this.lastHp) { element('hurt').classList.remove('flash'); void element('hurt').offsetWidth; element('hurt').classList.add('flash'); }
    this.lastHp = player.hp;
    element('score-a').textContent = String(state.score.amber); element('score-d').textContent = String(state.score.blue);
    element('round').textContent = `回合 ${String(state.round).padStart(2, '0')}`;
    const remaining = Math.max(0, Math.ceil(((state.bomb.planted ? state.bomb.explodeAt! : state.roundEndsAt) - state.time) / SECOND));
    element('timer').textContent = `${String(Math.floor(remaining / 60)).padStart(2, '0')}:${String(remaining % 60).padStart(2, '0')}`;
    element('timer').classList.toggle('urgent', state.bomb.planted);
    element('side').textContent = player.side === 'attack' ? '进攻 / ATTACK' : '防守 / DEFEND';
    const d = Math.hypot(player.position.x - MAP.site.x, player.position.z - MAP.site.z);
    element('goal').textContent = state.bomb.planted ? player.side === 'defend' ? '信标已安放 · 靠近并按住 E 拆除' : '守住信标，直到引爆' : player.side === 'attack' ? d <= MAP.siteRadius ? '已抵达信标点 · 按住 E 安放' : '推进至信标区域 · 按住 E 安放' : '阻止安放，或守住回合时间';
    element('hp').textContent = String(player.hp); element('hp-bar').style.width = `${player.hp}%`;
    const mag = player.weapons[player.weapon];
    element('weapon').textContent = player.weapon === 'rifle' ? 'RX-24 / 步枪' : 'PX-10 / 手枪';
    element('ammo').innerHTML = `${mag.ammo} <small>/ ${mag.reserve}</small>`;
    const remainingReload = player.reload ? Math.max(0, (player.reload.end - state.time) / SECOND) : 0;
    element('reload').textContent = player.reload ? `${pose.progress < .3 ? '退出弹匣' : pose.progress < .76 ? '装入弹匣' : '闭锁复位'} · ${remainingReload.toFixed(1)}s` : mag.ammo === 0 ? '弹匣已空 · R 换弹' : mag.ammo <= WEAPONS[player.weapon].magazine * .2 ? '弹药偏低 · R 换弹' : '';
    element('ammo').classList.toggle('low', mag.ammo <= WEAPONS[player.weapon].magazine * .2);
    element('reload-progress').hidden = !player.reload;
    element<HTMLProgressElement>('reload-progress').value = pose.progress;
    const interaction = state.interaction?.actorId === player.id ? state.interaction : null;
    element('interaction').hidden = !interaction;
    if (interaction) {
      element('interaction-label').textContent = interaction.kind === 'plant' ? '正在安放 · 保持 E' : '正在拆除 · 保持 E';
      element<HTMLProgressElement>('progress').value = (state.time - interaction.since) / (SECOND * (interaction.kind === 'plant' ? 3 : 5));
    }
  }
  reset() { this.round = 0; this.lastHp = 100; this.message(''); }
}
