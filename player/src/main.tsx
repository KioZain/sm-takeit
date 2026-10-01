import { createRoot } from "react-dom/client";

import { ISO_PRESETS } from "@/app/iso/iso-presets";

import { loadDefaultImages } from "./default-images";
import { createTeikidoPlayerApi } from "./player-api";
import { PlayerRoot } from "./player-root";
import { createPlayerStore } from "./player-store";
import "./player.css";

const store = createPlayerStore();
const player = createTeikidoPlayerApi(store);

declare global {
  interface Window {
    TeikidoPlayer: ReturnType<typeof createTeikidoPlayerApi>;
  }
}

window.TeikidoPlayer = player;
createRoot(document.getElementById("player")!).render(<PlayerRoot store={store} />);

/**
 * Demo only. A native host calls `TeikidoPlayer.load(...)` itself with its own
 * pictures and preset; this just makes the page worth opening in a browser.
 */
const params = new URLSearchParams(window.location.search);
const backdrop = params.get("bg");
if (backdrop) document.documentElement.style.background = backdrop;
const index = Number.parseInt(params.get("preset") ?? "0", 10);
const speed = Number.parseFloat(params.get("speed") ?? "");

loadDefaultImages(import.meta.env.BASE_URL)
  .then((images) => {
    player.load({
      autoplay: params.get("autoplay") !== "0",
      images,
      preset: ISO_PRESETS[Number.isFinite(index) ? index : 0] ?? ISO_PRESETS[0]!,
      ...(Number.isFinite(speed) ? { speed } : {}),
    });
  })
  .catch(() => undefined);
