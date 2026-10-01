import * as React from "react";

import { advanceLoopProgress } from "./loop-clock";
import type { PlayerStore } from "./player-store";
import { PlayerScene } from "./player-scene";

/**
 * Runs the cycle while the player is playing. The clock is driven by the gaps
 * between frames rather than by a start timestamp, so changing speed or scrubbing
 * mid-cycle carries on from where the wave stands instead of snapping.
 */
function useLoopClock(store: PlayerStore, running: boolean, loopSeconds: number): void {
  React.useEffect(() => {
    if (!running) return;
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
  }, [loopSeconds, running, store]);
}

/**
 * Whether the page is on screen. This deliberately does not touch the stored
 * `playing` flag: that flag is what the host asked for, and a backgrounded app
 * must come back animating rather than stay frozen until someone calls play().
 */
function useDocumentVisible(): boolean {
  const subscribe = React.useCallback((listener: () => void) => {
    document.addEventListener("visibilitychange", listener);
    return () => document.removeEventListener("visibilitychange", listener);
  }, []);
  return React.useSyncExternalStore(
    subscribe,
    () => !document.hidden,
    () => true,
  );
}

export function PlayerRoot({ store }: Readonly<{ store: PlayerStore }>): React.JSX.Element | null {
  const state = React.useSyncExternalStore(store.subscribe, store.getState, store.getState);
  const visible = useDocumentVisible();
  useLoopClock(store, state.playing && visible, state.loopSeconds);
  if (!state.preset || !state.images) return null;
  return <PlayerScene images={state.images} preset={state.preset} progress={state.progress} />;
}
