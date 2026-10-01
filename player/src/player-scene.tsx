import * as React from "react";

import { createIsoPresetScene, type IsoPresetImage } from "@/app/iso/iso-preset-scene";
import type { IsoSavedPreset } from "@/app/iso/iso-saved-presets";
import { getIsoViewBox, IsoSceneLayers } from "@/app/iso/iso-scene";
import { buildIsoSceneModelFromState, withIsoLoopProgress } from "@/app/iso/iso-state";

export type PlayerSceneProps = Readonly<{
  images: readonly IsoPresetImage[];
  preset: IsoSavedPreset;
  /** Point of the wave cycle to draw, in [0, 1). */
  progress: number;
}>;

/**
 * The set as the generator draws it. Everything here is the generator's own
 * code: the adapter builds the state a preset describes, and the same builder
 * and layers turn it into the picture. Nothing about the scene is restated.
 *
 * The SVG carries no background of its own, so whatever sits behind the WebView
 * shows through — that is the whole point of shipping this instead of a video.
 */
export function PlayerScene({ images, preset, progress }: PlayerSceneProps): React.JSX.Element | null {
  const scene = React.useMemo(() => createIsoPresetScene(preset, images), [images, preset]);
  const model = React.useMemo(
    () => buildIsoSceneModelFromState(withIsoLoopProgress(scene.state, progress)),
    [progress, scene.state],
  );
  if (model.items.length === 0) return null;
  return (
    <svg
      height="100%"
      preserveAspectRatio="xMidYMid meet"
      viewBox={getIsoViewBox(model)}
      width="100%"
      xmlns="http://www.w3.org/2000/svg"
    >
      <IsoSceneLayers
        appearance={{ showGrid: false }}
        imageUrls={scene.urls}
        model={model}
      />
    </svg>
  );
}
