import type { IsoPresetImage } from "@/app/iso/iso-preset-scene";
import type { IsoSavedPreset } from "@/app/iso/iso-saved-presets";

import { clampLoopSeconds, wrapProgress } from "./loop-clock";

/** A picture as a host hands it over; sizes are measured when it does not know them. */
export type PlayerImageInput = Readonly<{
  height?: number;
  name: string;
  url: string;
  width?: number;
}>;

export type PlayerLoad = Readonly<{
  autoplay?: boolean;
  images: readonly PlayerImageInput[];
  preset: IsoSavedPreset;
  /** Seconds per cycle; overrides the speed stored in the preset. */
  speed?: number;
}>;

export type PlayerState = Readonly<{
  error: string | null;
  images: readonly IsoPresetImage[] | null;
  loopSeconds: number;
  playing: boolean;
  preset: IsoSavedPreset | null;
  progress: number;
}>;

export type PlayerEvent =
  | Readonly<{ loopSeconds: number; missing: readonly string[]; pieces: number; type: "ready" }>
  | Readonly<{ message: string; type: "error" }>;

const EMPTY: PlayerState = Object.freeze({
  error: null,
  images: null,
  loopSeconds: 4,
  playing: false,
  preset: null,
  progress: 0,
});

/**
 * A picture without pixel sizes cannot be laid out, so one that arrives without
 * them is measured before it is used. Measuring here rather than in the scene
 * keeps the first frame from being drawn against a guessed size and jumping.
 *
 * One picture that will not load drops out instead of failing the set. The host
 * still hears about it: the name turns up in `missing` on the ready event, and a
 * set with one roll absent beats a blank screen on a flaky connection.
 */
export async function measureImages(
  images: readonly PlayerImageInput[],
): Promise<IsoPresetImage[]> {
  const measured = await Promise.all(
    images.map(async (image): Promise<IsoPresetImage | null> => {
      if (image.width && image.height) {
        return { height: image.height, name: image.name, url: image.url, width: image.width };
      }
      return new Promise<IsoPresetImage | null>((resolve) => {
        const element = new Image();
        element.onload = () =>
          resolve({
            height: element.naturalHeight,
            name: image.name,
            url: image.url,
            width: element.naturalWidth,
          });
        element.onerror = () => resolve(null);
        element.src = image.url;
      });
    }),
  );
  return measured.filter((image): image is IsoPresetImage => image !== null);
}

export type PlayerStore = Readonly<{
  getState: () => PlayerState;
  setPlaying: (playing: boolean) => void;
  setProgress: (progress: number) => void;
  setSpeed: (seconds: number) => void;
  setState: (next: PlayerState) => void;
  subscribe: (listener: () => void) => () => void;
}>;

export function createPlayerStore(): PlayerStore {
  let state = EMPTY;
  const listeners = new Set<() => void>();
  const commit = (next: PlayerState) => {
    state = next;
    for (const listener of listeners) listener();
  };
  return {
    getState: () => state,
    setPlaying: (playing) => commit({ ...state, playing }),
    setProgress: (progress) => commit({ ...state, progress: wrapProgress(progress) }),
    setSpeed: (seconds) => commit({ ...state, loopSeconds: clampLoopSeconds(seconds) }),
    setState: commit,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
