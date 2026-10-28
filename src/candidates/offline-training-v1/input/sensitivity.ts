export const SENSITIVITY = Object.freeze({key:'relay-yard.mouse.v1',default:1,min:.1,max:3,step:.05});
type StoragePort = Pick<Storage,'getItem'|'setItem'|'removeItem'>;
const valid=(value:unknown):value is number=>typeof value==='number' && Number.isFinite(value) && value>=SENSITIVITY.min && value<=SENSITIVITY.max;
const quantize=(value:number)=>Math.round(value*20)/20;
/** One browser preference, outside simulation snapshots and command replays. */
export class MouseSensitivity {
  private effective: number = SENSITIVITY.default;
  private pending: number = SENSITIVITY.default;
  notice = '';
  constructor(private storage:()=>StoragePort) {
    try {
      const raw=storage().getItem(SENSITIVITY.key);
      if(raw!==null){const saved:unknown=JSON.parse(raw);
        if(saved && typeof saved==='object' && 'version' in saved && saved.version===1 && 'value' in saved && valid(saved.value))this.effective=quantize(saved.value);
        else this.notice='已保存的灵敏度不可用，暂用默认 1.00×。';
      }
    } catch {this.notice='无法读取本浏览器设置，暂用默认 1.00×。';}
    this.pending=this.effective;
  }
  get draft(){return this.pending;}
  get value(){return this.effective;}
  get dirty(){return Math.abs(this.draft-this.effective)>1e-8;}
  edit(value:number){if(!valid(value))return false;this.pending=quantize(value);this.notice='';return true;}
  cancel(){this.pending=this.effective;this.notice='已取消修改。';}
  defaults(){this.pending=SENSITIVITY.default;this.notice='默认值已填入；保存并应用后生效。';}
  apply(){
    try {const store=this.storage();if(this.pending===SENSITIVITY.default)store.removeItem(SENSITIVITY.key);else store.setItem(SENSITIVITY.key,JSON.stringify({version:1,value:this.draft}));}
    catch {this.notice=`保存失败，仍使用 ${this.effective.toFixed(2)}×。可重试或取消修改。`;return false;}
    this.effective=this.draft;this.notice='已保存并应用到本浏览器。';return true;
  }
}
