import * as React from "react";

import { advanceLoopProgress } from "./loop-clock";
import type { PlayerStore } from "./player-store";
import { PlayerScene } from "./player-scene";

/**
 * Runs the cycle while the player is playing. The clock is driven by the gaps
 * between frames rather than by a start timestamp, so changing speed or scrubbing
 * mid-cycle carries on from where the wave stands instead of snapping.
 *
 * There is deliberately no `document.hidden` check. The browser already stops
 * delivering frames to a page nobody can see, so the gate bought nothing, and
 * an embedder that reports itself hidden while visible — which happens — would
 * leave the set frozen with no way for the host to tell why. Coming back after
 * a pause is handled where it belongs: `advanceLoopProgress` refuses to jump
 * more than one cycle, so a long gap costs a cycle, not a lurch.
 */
function useLoopClock(store: PlayerStore, playing: boolean, loopSeconds: number): void {
  React.useEffect(() => {
    if (!playing) return;
    let frame = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const elapsed = now - last;
      last = now;
      store.setProgress(advanceLoopProgress(store.getState().progress, elapsed, loopSeconds));
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [loopSeconds, playing, store]);
}

export function PlayerRoot({ store }: Readonly<{ store: PlayerStore }>): React.JSX.Element | null {
  const state = React.useSyncExternalStore(store.subscribe, store.getState, store.getState);
  useLoopClock(store, state.playing, state.loopSeconds);
  if (!state.preset || !state.images) return null;
  return <PlayerScene images={state.images} preset={state.preset} progress={state.progress} />;
}
