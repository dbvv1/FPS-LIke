import { readFileSync, realpathSync } from 'node:fs';
import { resolve, relative, isAbsolute } from 'node:path';
import { createHash } from 'node:crypto';
import { PNG } from 'pngjs';
import type { MoveObservation } from '../../src/candidates/offline-training-v1/capture/feel-trace.js';
export type FrameTrace = { runId: string; sourceCommit: string; build: string; shot: { ready: boolean; error?: string; frame: number; build: string; state: { tick: number }; stateHash: string; feel: { tape: string; stage: string; simulationHz: number; recordingFps: number; recordingFrame: number; observations: MoveObservation[] } } };
export type TraceBundle = { runId: string; sourceCommit: string; build: string; frames: FrameTrace[] };
export type FrameEvidence = { frame: number; file: string; sha256: string; simulationTick: number; stage: string };
export type Review = { reviewer: string; author: string; commandId: 'move-start' | 'move-stop'; firstVisibleFrame: number; note: string };
/** Offline files only. Caller must copy per-frame metadata from the same __shotNext return.
 * Hash binding validates integrity, not authenticity or perceptual correctness. */
export function verifyFrames(root: string, frames: FrameEvidence[], reviews: Review[] = [], trace?: TraceBundle) {
  const base = realpathSync(root);
  if (frames.length !== 121) throw new Error('Need all 121 frames (0 through 120); no dropped/duplicated frames');
  const hashes: string[] = [];
  const paths = new Set<string>();
  for (const [i, f] of frames.entries()) {
    if (f.frame !== i || f.simulationTick !== 120 + i || f.stage !== 'render-submitted-and-gl-finished; PNG not captured') throw new Error('Frame/tick/stage association mismatch');
    const path = realpathSync(resolve(base, f.file)), rel = relative(base, path);
    if (paths.has(path)) throw new Error('Reused screenshot file'); paths.add(path);
    if (rel.startsWith('..') || isAbsolute(rel)) throw new Error('Frame outside run directory');
    const bytes = readFileSync(path), hash = createHash('sha256').update(bytes).digest('hex');
    if (f.sha256 !== hash) throw new Error('PNG hash mismatch');
    const png = PNG.sync.read(bytes);
    if (png.width !== 1280 || png.height !== 720) throw new Error('Unexpected screenshot size');
    hashes.push(hash);
  }
  const verified = new Map<string, MoveObservation>();
  if (trace) {
    if (!trace.runId.trim() || !/^[a-f0-9]{40}$/.test(trace.sourceCommit) || !trace.build.trim() || trace.frames.length !== 121) throw new Error('Incomplete source/run trace');
    const expected = new Map<string, string>();
    for (const [i, row] of trace.frames.entries()) {
      const { shot } = row;
      if (shot.ready !== true || shot.error !== undefined || shot.feel.tape !== 'move-stop' || shot.feel.stage !== frames[i]!.stage || shot.feel.simulationHz !== 60 || shot.feel.recordingFps !== 60) throw new Error('Trace is not a successful move-stop recording frame');
      if (row.runId !== trace.runId || row.sourceCommit !== trace.sourceCommit || row.build !== trace.build || shot.build !== trace.build || shot.frame !== i || shot.feel.recordingFrame !== i || shot.state.tick !== frames[i]!.simulationTick || !shot.stateHash) throw new Error('Trace/frame/source/run mismatch');
      const expectedIds = i === 0 ? [] : i <= 60 ? ['move-start'] : ['move-start','move-stop'];
      if (JSON.stringify(shot.feel.observations.map(o => o.id)) !== JSON.stringify(expectedIds)) throw new Error('Missing or extra command receipts');
      for (const o of shot.feel.observations) {
        const entered = o.id === 'move-start' ? 0 : 60;
        const c = o.command;
        if (o.enteredAfterRenderFrame !== entered || o.beforeTick !== 120+entered || o.targetTick !== 121+entered || o.resultTick !== o.targetTick || c.actorId !== 'player' || c.type !== 'move' || c.x !== 0 || c.z !== (entered === 0 ? 1 : 0)) throw new Error('Command/frame receipt mismatch');
        const bytes = JSON.stringify(o);
        if (expected.has(o.id) && expected.get(o.id) !== bytes) throw new Error('Command receipt changed across frames');
        expected.set(o.id, bytes);
        if (o.acceptance === 'accepted') verified.set(o.id, o);
      }
    }
  }
  const used = new Set<string>();
  const visual = reviews.flatMap(r => {
    if (!r.reviewer.trim() || !r.author.trim() || r.reviewer === r.author || !r.note.trim()) throw new Error('Non-author visual review required');
    if (used.has(r.commandId)) throw new Error('Duplicate command review'); used.add(r.commandId);
    const receipt = verified.get(r.commandId);
    if (!receipt) return []; // PNGs and a claimed frame number alone cannot establish input latency.
    const enteredAfter = receipt.enteredAfterRenderFrame;
    if (enteredAfter < 0 || !Number.isInteger(r.firstVisibleFrame) || r.firstVisibleFrame <= enteredAfter || r.firstVisibleFrame > 120) throw new Error('Invalid first-visible frame');
    return [{ ...r, enteredAfterRenderFrame: enteredAfter, recordingFramesToFeedback: r.firstVisibleFrame - enteredAfter, screenshotSha256: hashes[r.firstVisibleFrame], verifiedBy: 'named non-author annotation; not automatic pixel interpretation' }];
  });
  return { completeFrameSequence: true, recordingFps: 60, visual, audio: 'unknown', deviceLatencyMs: null, displayPresentation: 'unknown', commandEvidence: trace ? 'supplied same-run trace checked; authenticity requires capture audit' : 'unknown: no command/acceptance trace', pendingVisualCommands: ['move-start','move-stop'].filter(id => !visual.some(v => v.commandId === id)) };
}
