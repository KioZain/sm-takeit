/**
 * The player keeps its own clock. In the generator the runtime timeline paces
 * the wave; here there is no runtime, so elapsed milliseconds are turned into
 * loop progress directly. Everything is pure so the pacing can be tested without
 * a browser, and so a host that scrubs by hand lands on exactly the same frames
 * a playing clock would.
 */

/** Seconds a cycle may take, matching the generator's own slider bounds. */
export const PLAYER_LOOP_SECONDS_RANGE = { max: 12, min: 1 } as const;

export function clampLoopSeconds(seconds: number): number {
  if (!Number.isFinite(seconds)) return PLAYER_LOOP_SECONDS_RANGE.min;
  return Math.min(
    PLAYER_LOOP_SECONDS_RANGE.max,
    Math.max(PLAYER_LOOP_SECONDS_RANGE.min, seconds),
  );
}

/** Wraps any progress into [0, 1), including negatives from a backwards scrub. */
export function wrapProgress(progress: number): number {
  if (!Number.isFinite(progress)) return 0;
  const wrapped = progress % 1;
  return wrapped < 0 ? wrapped + 1 : wrapped;
}

/**
 * Where the cycle stands after `elapsedMs`. A frame the browser delivers late —
 * after a stall, a backgrounded tab or a slow paint — would otherwise jump the
 * wave forward by however long the gap was, so anything beyond a cycle is
 * treated as one cycle: the loop is seamless, and landing a cycle behind is
 * invisible while a lurch is not.
 */
export function advanceLoopProgress(
  progress: number,
  elapsedMs: number,
  loopSeconds: number,
): number {
  if (!Number.isFinite(elapsedMs) || elapsedMs <= 0) return wrapProgress(progress);
  const cycleMs = clampLoopSeconds(loopSeconds) * 1000;
  return wrapProgress(progress + Math.min(elapsedMs, cycleMs) / cycleMs);
}
