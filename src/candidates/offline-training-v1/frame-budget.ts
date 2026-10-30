export const TICK_MS = 1000 / 60;
export const MAX_CATCHUP_STEPS = 15;
export const LONG_FRAME_PAUSE_MS = 2000;
/** Wall-clock scheduling only: simulation still takes unmodified 60 Hz steps.
 * Slow visible rendering drops old wall-time debt, never accumulates more work.
 */
export function frameBudget(now: number, lastFrame: number, simStart: number, foreground: boolean) {
  const pause = !foreground || !Number.isFinite(now) || now < lastFrame || now - lastFrame >= LONG_FRAME_PAUSE_MS;
  const start = pause ? simStart : Math.max(simStart, now - MAX_CATCHUP_STEPS * TICK_MS);
  return { pause, start, dropped: start > simStart };
}

/** Resume events use performance.now(), while rAF timestamps can predate their
 * delivery. Start the next frame in its own timestamp domain, but still reject
 * a genuinely long wait after the resume gesture using wall time. */
export function resumeFrameBudget(now: number, wallNow: number, resumeWall: number, foreground: boolean) {
  const pause = !foreground || !Number.isFinite(now) || !Number.isFinite(wallNow) || wallNow < resumeWall || wallNow - resumeWall >= LONG_FRAME_PAUSE_MS;
  return { pause, start: now, dropped: false };
}
