import type { Actor, GameState, WeaponId } from '../sim/types.js';
import { localShotResult, weaponPose } from './weapon.js';
import { synthesize, type Cue } from './synth.js';
export class Soundscape {
  private context: AudioContext | null = null;
  private lastSound = -1;
  private shotCount = 0;
  private round = 0;
  private reloadEnd: number | null = null;
  private reloadStage = 0;
  private buffers = new Map<string, AudioBuffer>();
  private voices = new Set<AudioBufferSourceNode>();
  private active = true;
  get enabled() { return this.active; }
  set enabled(value: boolean) {
    this.active = value;
    if (!value) { for (const voice of this.voices) voice.stop(); this.voices.clear(); }
  }
  async unlock() {
    if (!this.enabled) return;
    this.context ??= new AudioContext();
    if (this.context.state === 'suspended') await this.context.resume();
  }
  update(state: GameState, player: Actor, yaw: number, audibleIds: number[]) {
    if (state.round !== this.round) { this.reset(); this.round = state.round; }
    const fresh = state.sounds.filter(s => s.id > this.lastSound);
    const ownNewShots = state.shots.slice(this.shotCount).filter(s => s.actorId === player.id);
    this.lastSound = state.soundSequence - 1; this.shotCount = state.shots.length;
    const pose = weaponPose(state,player);
    const previousEnd = this.reloadEnd, previousStage = this.reloadStage;
    this.reloadEnd = player.reload?.end ?? null;
    this.reloadStage = player.reload ? pose.progress >= .78 ? 2 : pose.progress >= .56 ? 1 : 0 : 0;
    if (!this.enabled || !this.context || this.context.state !== 'running') return;
    for (const event of fresh) {
      if (event.actorId !== player.id && !audibleIds.includes(event.id)) continue;
      const d = Math.hypot(event.position.x - player.position.x, event.position.z - player.position.z);
      if (d > event.radius) continue;
      const self = event.actorId === player.id;
      const volume = (self ? event.kind==='shot' ? .35 : .22 : .15) * Math.max(0, 1 - d / event.radius);
      const angle = Math.atan2(event.position.x - player.position.x, event.position.z - player.position.z) - yaw;
      const weapon = state.shots.find(s=>s.actorId===event.actorId && s.time===event.time)?.weapon ?? state.actors.find(a=>a.id===event.actorId)?.weapon ?? 'rifle';
      this.play(event.kind === 'reload' ? 'reload-out' : event.kind, weapon, volume, self ? 0 : Math.sin(angle));
    }
    if (player.reload && previousEnd === this.reloadEnd && this.reloadStage > previousStage) this.play(this.reloadStage===1 ? 'reload-in' : 'bolt', player.weapon, .19, 0);
    for (const shot of ownNewShots) {
      const result = localShotResult(state,player,shot);
      if(result && ['body','head','kill'].includes(result.kind)) this.play(result.kind==='body'?'hit':result.kind as 'head'|'kill',player.weapon,.12,0);
    }
  }
  private play(cue: Cue, weapon: WeaponId, volume: number, pan: number) {
    const c=this.context!, key=`${cue}:${weapon}`;
    let buffer=this.buffers.get(key);
    if(!buffer) { const samples=synthesize(cue,weapon,c.sampleRate); buffer=c.createBuffer(1,samples.length,c.sampleRate); buffer.copyToChannel(samples,0); this.buffers.set(key,buffer); }
    const source=c.createBufferSource(),gain=c.createGain(),panner=c.createStereoPanner();
    source.buffer=buffer; gain.gain.value=volume; panner.pan.value=pan;
    source.connect(gain).connect(panner).connect(c.destination); this.voices.add(source);
    source.onended=()=>{this.voices.delete(source);source.disconnect();gain.disconnect();panner.disconnect();};source.start();
  }
  reset() { for(const voice of this.voices) voice.stop(); this.voices.clear(); this.lastSound=-1;this.shotCount=0;this.reloadEnd=null;this.reloadStage=0; }
  dispose() { this.reset();this.buffers.clear(); void this.context?.close(); this.context=null; }
}
