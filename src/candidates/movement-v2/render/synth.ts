import type { WeaponId } from '../sim/types.js';
export type Cue = 'shot' | 'step' | 'reload-out' | 'reload-in' | 'bolt' | 'hit' | 'head' | 'kill' | 'plant';
// Original synthesis recipe: filtered transient + body + mechanical tail. No recordings/assets.
export function synthesize(cue: Cue, weapon: WeaponId, rate: number) {
  const duration = cue === 'shot' ? .24 : cue === 'kill' ? .25 : cue === 'plant' ? .20 : .10;
  const samples = new Float32Array(Math.ceil(rate * duration));
  let seed = 0x51f15e, low = 0, band = 0, peak = 0;
  for (let i=0; i<samples.length; i++) {
    const t=i/rate; seed ^= seed<<13; seed ^= seed>>>17; seed ^= seed<<5;
    const noise = (seed>>>0)/0x80000000 - 1; low += .09*(noise-low); band += .32*(noise-band);
    let value = 0;
    if (cue === 'shot') {
      const pistol = weapon === 'pistol', pitch = pistol ? 175 : 125;
      const crack = (noise-band) * Math.exp(-t/(pistol ? .010 : .014));
      const body = Math.sin(2*Math.PI*(pitch*t - 80*t*t))*Math.exp(-t/.048);
      const tail = (band-low)*Math.exp(-t/.065);
      const mechanism = t>.033 ? (noise-low)*Math.exp(-(t-.033)/.008)*.18 : 0;
      value = .7*crack + .48*body + .32*tail + mechanism;
    } else if (cue === 'step') value = low * Math.exp(-t/.022)*2 + Math.sin(2*Math.PI*80*t)*Math.exp(-t/.015)*.2;
    else if (cue === 'hit' || cue === 'head' || cue === 'kill') {
      const pitch = cue === 'hit' ? 1000 : cue === 'head' ? 1600 : 750;
      value = (Math.sin(2*Math.PI*pitch*t) + .25*Math.sin(2*Math.PI*pitch*1.5*t))*Math.exp(-t/(cue==='kill'?.065:.023))*.5;
      if(cue==='kill' && t>.065) value += .4*Math.sin(2*Math.PI*1125*(t-.065))*Math.exp(-(t-.065)/.055);
    } else if (cue === 'plant') value = Math.sin(2*Math.PI*660*t)*Math.exp(-t/.07)*.5;
    else {
      const pitch=cue==='reload-out'?330:cue==='reload-in'?470:680;
      value=(noise-low)*Math.exp(-t/.008)*.6 + Math.sin(2*Math.PI*pitch*t)*Math.exp(-t/.022)*.3;
      if(cue==='bolt' && t>.035)value+=(noise-low)*Math.exp(-(t-.035)/.009)*.4;
    }
    // Short attack avoids a DC edge; tail reaches silence rather than hard truncation.
    value *= Math.min(1,t/.0008)*Math.min(1,(duration-t)/.008);
    samples[i]=value; peak=Math.max(peak,Math.abs(value));
  }
  if(peak>0)for(let i=0;i<samples.length;i++)samples[i]=samples[i]!/peak*.75;
  return samples;
}
