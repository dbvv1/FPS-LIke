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
