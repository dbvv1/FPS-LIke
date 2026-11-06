import type { Actor, GameState, WeaponId } from '../sim/types.js';
import { localShotResult, weaponPose } from './weapon.js';
import { synthesize, type Cue } from './synth.js';
import { resultAudioPolicyFromSearch, resultCueUrls, settledResultCue, type ResultAudioPolicy, type ResultCue } from './result-audio.js';
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
  private disposed = false;
  private resultSeen: string | null = null;
  private resultBuffers = new Map<ResultCue, AudioBuffer>();
  private resultLoading: Promise<void> | null = null;
  private resultAbort: AbortController | null = null;
  private resultLoadFailed = false;
  private resultDecision: 'none' | 'inactive' | 'not-ready' | 'combat' | 'played' = 'none';
  constructor(private readonly resultPolicy: ResultAudioPolicy = resultAudioPolicyFromSearch(globalThis.location?.search ?? '')) {}
  get resultAudioState() {
    return { policy: this.resultPolicy, ready: this.resultBuffers.size === 2, loadFailed: this.resultLoadFailed, decision: this.resultDecision };
  }
  get enabled() { return this.active; }
  set enabled(value: boolean) {
    this.active = value;
    if (!value) { for (const voice of this.voices) voice.stop(); this.voices.clear(); }
  }
  async unlock() {
    if (!this.enabled || this.disposed) return;
    this.context ??= new AudioContext();
    const context = this.context;
    if (context.state === 'suspended') await context.resume();
    if (this.disposed || this.context !== context) return;
    if (this.resultPolicy === 'result-cues-v1') await this.loadResultCues(context);
  }
  update(state: GameState, player: Actor, yaw: number, audibleIds: number[]) {
    if (this.disposed) return;
    if (state.round !== this.round) { this.reset(); this.round = state.round; }
    const result = this.resultPolicy === 'result-cues-v1' ? settledResultCue(state, player) : null;
    const freshResult = result && result.key !== this.resultSeen ? result : null;
    // Consume even when muted or unready. Never replay a stale result after unlock.
    if (freshResult) this.resultSeen = freshResult.key;
    const fresh = state.sounds.filter(s => s.id > this.lastSound);
    const ownNewShots = state.shots.slice(this.shotCount).filter(s => s.actorId === player.id);
    this.lastSound = state.soundSequence - 1; this.shotCount = state.shots.length;
    const pose = weaponPose(state,player);
    const previousEnd = this.reloadEnd, previousStage = this.reloadStage;
    this.reloadEnd = player.reload?.end ?? null;
    this.reloadStage = player.reload ? pose.progress >= .78 ? 2 : pose.progress >= .56 ? 1 : 0 : 0;
    if (!this.enabled || !this.context || this.context.state !== 'running') {
      if (freshResult) this.resultDecision = 'inactive';
      return;
    }
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
    if (freshResult) this.playResult(freshResult.cue);
  }
  private async loadResultCues(context: AudioContext) {
    if (this.resultBuffers.size === 2) return;
    if (this.resultLoading) return this.resultLoading;
    const controller = new AbortController();
    this.resultAbort = controller;
    this.resultLoadFailed = false;
    this.resultLoading = Promise.allSettled((Object.entries(resultCueUrls) as [ResultCue, string][]).map(async ([cue, url]) => {
      if (this.resultBuffers.has(cue)) return;
      const response = await fetch(url, { signal: controller.signal });
      if (!response.ok) throw new Error('Round audio unavailable');
      const bytes = await response.arrayBuffer();
      if (this.disposed || this.context !== context) return;
      const buffer = await context.decodeAudioData(bytes);
      if (!this.disposed && this.context === context) this.resultBuffers.set(cue, buffer);
    })).then(results => {
      if (!this.disposed) this.resultLoadFailed = results.some(result => result.status === 'rejected');
    }).finally(() => {
      // Retain partial success, allowing the next explicit gesture to retry missing files.
      this.resultLoading = null;
      if (this.resultAbort === controller) this.resultAbort = null;
    });
    return this.resultLoading;
  }
  private playResult(cue: ResultCue) {
    const context = this.context!, buffer = this.resultBuffers.get(cue);
    if (!buffer) { this.resultDecision = 'not-ready'; return; }
    // Do not duck, delay or replace gunfire/hit feedback. This optional cue loses.
    if (this.voices.size) { this.resultDecision = 'combat'; return; }
    let source: AudioBufferSourceNode | null = null, gain: GainNode | null = null;
    try {
      source = context.createBufferSource(); gain = context.createGain();
      source.buffer = buffer; gain.gain.value = .18;
      source.connect(gain).connect(context.destination); this.voices.add(source);
      const voice = source, output = gain;
      voice.onended = () => { this.voices.delete(voice); voice.disconnect(); output.disconnect(); };
      voice.start(); this.resultDecision = 'played';
    } catch {
      if (source) { this.voices.delete(source); source.disconnect(); }
      gain?.disconnect(); this.resultDecision = 'inactive';
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
  reset() { for(const voice of this.voices) voice.stop(); this.voices.clear(); this.lastSound=-1;this.shotCount=0;this.reloadEnd=null;this.reloadStage=0;this.resultSeen=null;this.resultDecision='none'; }
  dispose() { if(this.disposed)return; this.disposed=true;this.resultAbort?.abort();this.resultAbort=null;this.reset();this.buffers.clear();this.resultBuffers.clear();void this.context?.close().catch(()=>{});this.context=null; }
}
