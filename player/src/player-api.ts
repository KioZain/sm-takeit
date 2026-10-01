import { createIsoPresetScene } from "@/app/iso/iso-preset-scene";
import { buildIsoSceneModelFromState, readIsoLoopSeconds } from "@/app/iso/iso-state";

import { clampLoopSeconds } from "./loop-clock";
import {
  measureImages,
  type PlayerEvent,
  type PlayerLoad,
  type PlayerStore,
} from "./player-store";

type Listener = (event: PlayerEvent) => void;

/**
 * Both hosts talk to the page the same way — a string of JavaScript evaluated in
 * it — so every call accepts the JSON a native side finds easiest to build, as
 * well as a real object for the demo page.
 */
function parseLoad(input: PlayerLoad | string): PlayerLoad {
  const value = typeof input === "string" ? (JSON.parse(input) as unknown) : input;
  if (!value || typeof value !== "object") throw new Error("Player load needs an object.");
  const load = value as PlayerLoad;
  if (!load.preset || typeof load.preset !== "object") throw new Error("Player load needs a preset.");
  if (!Array.isArray(load.images)) throw new Error("Player load needs an images array.");
  return load;
}

/**
 * Events go back out the two channels a native host already has, so neither
 * platform needs to inject glue of its own: iOS reads them through a script
 * message handler named `teikidoPlayer`, Android through a JavaScript interface
 * named `TeikidoPlayerAndroid`. Whichever is absent is simply skipped.
 */
function postToHost(event: PlayerEvent): void {
  const scope = window as unknown as Record<string, unknown>;
  const webkit = scope.webkit as
    | { messageHandlers?: Record<string, { postMessage?: (value: unknown) => void } | undefined> }
    | undefined;
  try {
    webkit?.messageHandlers?.teikidoPlayer?.postMessage?.(event);
  } catch {
    // A host that cannot take the message must not break playback.
  }
  const android = scope.TeikidoPlayerAndroid as { onEvent?: (value: string) => void } | undefined;
  try {
    android?.onEvent?.(JSON.stringify(event));
  } catch {
    // Same here: the picture matters more than the notification.
  }
}

export type TeikidoPlayerApi = Readonly<{
  destroy: () => void;
  load: (config: PlayerLoad | string) => void;
  off: (listener: Listener) => void;
  on: (listener: Listener) => void;
  pause: () => void;
  play: () => void;
  setProgress: (progress: number) => void;
  setSpeed: (seconds: number) => void;
}>;

export function createTeikidoPlayerApi(store: PlayerStore): TeikidoPlayerApi {
  const listeners = new Set<Listener>();
  // A load that is overtaken by a newer one must not report itself ready.
  let generation = 0;

  const emit = (event: PlayerEvent) => {
    for (const listener of listeners) listener(event);
    postToHost(event);
  };

  const fail = (message: string) => {
    store.setState({ ...store.getState(), error: message, playing: false });
    emit({ message, type: "error" });
  };

  return Object.freeze({
    destroy: () => {
      generation += 1;
      listeners.clear();
      store.setState({
        error: null,
        images: null,
        loopSeconds: 4,
        playing: false,
        preset: null,
        progress: 0,
      });
    },
    load: (config) => {
      generation += 1;
      const mine = generation;
      let load: PlayerLoad;
      try {
        load = parseLoad(config);
      } catch (error) {
        fail(error instanceof Error ? error.message : "Player load could not be read.");
        return;
      }
      measureImages(load.images)
        .then((images) => {
          if (mine !== generation) return;
          const scene = createIsoPresetScene(load.preset, images);
          const loopSeconds = clampLoopSeconds(load.speed ?? readIsoLoopSeconds(load.preset.values));
          store.setState({
            error: null,
            images,
            loopSeconds,
            playing: load.autoplay !== false,
            preset: load.preset,
            progress: 0,
          });
          emit({
            loopSeconds,
            missing: scene.missing,
            // What the host will actually see: pieces off the field or without a
            // picture are already gone by the time the model is built.
            pieces: buildIsoSceneModelFromState(scene.state).items.length,
            type: "ready",
          });
        })
        .catch((error: unknown) => {
          if (mine !== generation) return;
          fail(error instanceof Error ? error.message : "Roll pictures could not be loaded.");
        });
    },
    off: (listener) => listeners.delete(listener),
    on: (listener) => listeners.add(listener),
    pause: () => store.setPlaying(false),
    play: () => store.setPlaying(true),
    setProgress: (progress) => store.setProgress(progress),
    setSpeed: (seconds) => store.setSpeed(seconds),
  });
}
