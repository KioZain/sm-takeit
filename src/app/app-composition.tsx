import { composeToolcraftApp } from "@/toolcraft/runtime/react";

import { appSchema } from "./app-schema";
import { handleIsoPanelAction } from "./iso/iso-actions";
import { IsoCanvas } from "./iso/iso-canvas";
import { IsoCompositionControl } from "./iso/iso-composition-control";
import {
  isoCompositionControlType,
  isoObjectLibraryControlType,
  isoSavedPresetsControlType,
} from "./iso/iso-control-types";
import { isoRasterFrameRenderer } from "./iso/iso-export";
import { IsoObjectLibraryControl } from "./iso/iso-object-library-control";
import { isoRendererPipelineRegistration } from "./iso/iso-pipeline";
import { IsoSavedPresetsControl } from "./iso/iso-saved-presets-control";
import { buildIsoSceneModelFromState } from "./iso/iso-state";

export const appComposition = composeToolcraftApp(appSchema, {
  actions: { onPanelAction: handleIsoPanelAction },
  controls: {
    renderers: {
      [isoCompositionControlType]: IsoCompositionControl,
      [isoObjectLibraryControlType]: IsoObjectLibraryControl,
      [isoSavedPresetsControlType]: IsoSavedPresetsControl,
    },
  },
  renderer: { pipelineRegistration: isoRendererPipelineRegistration },
  scene: {
    canvasContent: <IsoCanvas />,
    rasterFrameRenderer: isoRasterFrameRenderer,
    renderDefaultCanvasMedia: false,
    sceneBoundsProvider: ({ state }) => [buildIsoSceneModelFromState(state).worldFrame],
  },
});
