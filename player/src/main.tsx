import * as React from "react";
import { createRoot } from "react-dom/client";

import type { IsoPresetImage } from "@/app/iso/iso-preset-scene";
import { ISO_PRESETS } from "@/app/iso/iso-presets";

import { loadDefaultImages } from "./default-images";
import { PlayerScene } from "./player-scene";
import "./player.css";

/** Demo controls only: a real host picks the preset and supplies the pictures. */
const params = new URLSearchParams(window.location.search);
const presetIndex = Number.parseInt(params.get("preset") ?? "0", 10);
const preset = ISO_PRESETS[Number.isFinite(presetIndex) ? presetIndex : 0] ?? ISO_PRESETS[0]!;
const progress = Number.parseFloat(params.get("progress") ?? "0") || 0;
// A backdrop to look at the alpha against; the page is transparent without it.
const backdrop = params.get("bg");
if (backdrop) document.documentElement.style.background = backdrop;

function Player(): React.JSX.Element | null {
  const [images, setImages] = React.useState<readonly IsoPresetImage[] | null>(null);
  React.useEffect(() => {
    let live = true;
    loadDefaultImages(import.meta.env.BASE_URL)
      .then((loaded) => {
        if (live) setImages(loaded);
      })
      .catch(() => {
        if (live) setImages([]);
      });
    return () => {
      live = false;
    };
  }, []);
  // Nothing is drawn until the pictures are measured, so the layout never jumps.
  if (!images) return null;
  return <PlayerScene images={images} preset={preset} progress={progress} />;
}

createRoot(document.getElementById("player")!).render(<Player />);
