import {MouseSensitivity,SENSITIVITY} from '../input/sensitivity.js';
/** A single row in the existing pause menu, not a general settings framework. */
export class SensitivityMenu {
  constructor(private settings:MouseSensitivity,private root:HTMLElement){
    root.innerHTML=`<details id="aim-settings"><summary>鼠标灵敏度 <span id="aim-current"></span></summary><label for="aim-sensitivity">瞄准倍率 <output id="aim-value" for="aim-sensitivity"></output></label><input id="aim-sensitivity" type="range" min="${SENSITIVITY.min}" max="${SENSITIVITY.max}" step="${SENSITIVITY.step}"><p>1.00× 为原版速度。修改只影响后续鼠标瞄准，保存于此浏览器。</p><div class="aim-actions"><button id="aim-apply">保存并应用</button><button id="aim-cancel">取消修改</button><button id="aim-default">恢复默认</button></div><p id="aim-status" role="status"></p></details>`;
    this.element<HTMLInputElement>('aim-sensitivity').oninput=()=>{settings.edit(Number(this.element<HTMLInputElement>('aim-sensitivity').value));this.refresh();};
    this.element('aim-apply').onclick=()=>{settings.apply();this.refresh();};
    this.element('aim-cancel').onclick=()=>{settings.cancel();this.refresh();};
    this.element('aim-default').onclick=()=>{settings.defaults();this.refresh();};
    this.refresh();
  }
  private element<T extends HTMLElement=HTMLElement>(id:string){return this.root.querySelector<T>(`#${id}`)!;}
  private refresh(){
    this.element<HTMLInputElement>('aim-sensitivity').value=String(this.settings.draft);
    this.element('aim-value').textContent=`${this.settings.draft.toFixed(2)}×`;
    this.element('aim-current').textContent=`${this.settings.value.toFixed(2)}×${this.settings.dirty?' · 未应用':''}`;
    this.element('aim-status').textContent=this.settings.notice || (this.settings.dirty?'尚未应用；保存或取消后继续。':'当前设置已生效。');
  }
  canPlay(){
    if(!this.settings.dirty)return true;
    this.element<HTMLDetailsElement>('aim-settings').open=true;
    this.element('aim-status').textContent='尚未应用；请先保存或取消修改，再进入游戏。';
    this.element('aim-apply').focus();return false;
  }
}
