import {
  registerToolcraftRendererPipeline,
  type ToolcraftRendererPipelinePassContract,
} from "@/toolcraft/runtime";

import type { IsoSceneModel } from "./iso-geometry";
import type { IsoImageStore } from "./iso-image-store";

type IsoRendererPasses = {
  "editor-overlay": ToolcraftRendererPipelinePassContract<void>;
  "export-raster": ToolcraftRendererPipelinePassContract<void>;
  "object-images": ToolcraftRendererPipelinePassContract<
    IsoImageStore,
    IsoImageStore,
    readonly [string]
  >;
  "preview-svg": ToolcraftRendererPipelinePassContract<void>;
  "scene-layout": ToolcraftRendererPipelinePassContract<IsoSceneModel>;
};

export const ISO_SCENE_LAYOUT_KEYS = [
  "field.placements",
  "grid.cellSize",
  "grid.levelHeight",
  "grid.cols",
  "grid.rows",
  "library.files",
  "library.objects",
  "output.crop",
  "output.includeGrid",
  "output.padding",
  "output.showPieces",
  "relief.corner",
  "relief.edge",
  "relief.edits",
  "relief.max",
  "relief.pattern",
  "relief.step",
  "relief.wave",
  "relief.waveDirection",
  "relief.waveEasing",
  "relief.waveLength",
  "timeline.time",
] as const;

export const ISO_OBJECT_IMAGES_KEY = "iso-object-images";

const allPasses = [
  "object-images",
  "scene-layout",
  "preview-svg",
  "editor-overlay",
] as const;

export const isoRendererPipelineRegistration =
  registerToolcraftRendererPipeline<IsoRendererPasses>()({
    interactionInvalidation: [
      {
        interaction: "initial-render",
        invalidates: allPasses,
        targets: ["canvas.initial-render"],
      },
      {
        interaction: "media-import",
        invalidates: ["scene-layout", "preview-svg"],
        mustNotInvalidate: ["object-images"],
        retainedAccesses: ["object-images"],
        targets: ["library.files"],
      },
      {
        interaction: "control-change",
        invalidates: ["scene-layout", "preview-svg"],
        mustNotInvalidate: ["object-images"],
        targets: [
          "field.placements",
          "library.objects",
          "output.crop",
          "output.includeGrid",
          "output.showPieces",
          "relief.corner",
          "relief.edge",
          "relief.edits",
          "relief.pattern",
          "relief.wave",
          "relief.waveDirection",
          "relief.waveEasing",
        ],
      },
      {
        interaction: "control-change",
        invalidates: ["preview-svg"],
        mustNotInvalidate: ["object-images", "scene-layout"],
        targets: ["grid.visible"],
      },
      {
        interaction: "control-change",
        invalidates: ["editor-overlay"],
        mustNotInvalidate: ["object-images", "scene-layout", "preview-svg"],
        targets: ["field.tool"],
      },
      {
        interaction: "control-drag",
        invalidates: ["scene-layout", "preview-svg"],
        mustNotInvalidate: ["object-images"],
        targets: [
          "grid.cellSize",
          "grid.levelHeight",
          "grid.cols",
          "grid.rows",
          "output.padding",
          "relief.max",
          "relief.step",
          "relief.waveLength",
        ],
      },
      {
        interaction: "timeline-playback",
        invalidates: ["scene-layout", "preview-svg", "editor-overlay"],
        mustNotInvalidate: ["object-images"],
        targets: ["timeline.time"],
      },
      {
        interaction: "timeline-scrub",
        invalidates: ["scene-layout", "preview-svg", "editor-overlay"],
        mustNotInvalidate: ["object-images"],
        targets: ["timeline.time"],
      },
      {
        interaction: "mask-drag",
        invalidates: ["editor-overlay"],
        mustNotInvalidate: ["object-images", "scene-layout", "preview-svg"],
        targets: ["field.selection"],
      },
      {
        // Dragging a column on the canvas rewrites heights live.
        interaction: "mask-drag",
        invalidates: ["scene-layout", "preview-svg", "editor-overlay"],
        mustNotInvalidate: ["object-images"],
        targets: ["relief.edits"],
      },
      {
        interaction: "viewport-drag",
        invalidates: [],
        mustNotInvalidate: allPasses,
        targets: ["canvas.viewport.offset"],
      },
      {
        interaction: "viewport-zoom",
        invalidates: [],
        mustNotInvalidate: allPasses,
        targets: ["canvas.viewport.zoom"],
      },
      {
        interaction: "export",
        invalidates: ["export-raster"],
        mustNotInvalidate: ["object-images"],
        retainedAccesses: ["object-images"],
        targets: ["actions.output"],
      },
    ],
    passes: [
      {
        cacheKey: ["library.images"],
        cost: { dimensions: ["library-objects"], frequency: "discrete", relationship: "linear" },
        id: "object-images",
        inputs: ["library.files"],
        invalidatedBy: ["library.files"],
        kind: "decode",
        lifecycle: { cache: "retained-resource", resourceScope: "renderer" },
        output: "source",
        quality: "full",
        runsOn: "main",
      },
      {
        cacheKey: ISO_SCENE_LAYOUT_KEYS,
        cost: { dimensions: ["placed-pieces"], frequency: "interaction", relationship: "quadratic" },
        id: "scene-layout",
        inputs: ISO_SCENE_LAYOUT_KEYS,
        invalidatedBy: ISO_SCENE_LAYOUT_KEYS,
        kind: "vector-build",
        lifecycle: { cache: "memoized", resourceScope: "interaction" },
        output: "intermediate",
        quality: "full",
        runsOn: "main",
      },
      {
        cost: { dimensions: ["placed-pieces"], frequency: "interaction", relationship: "linear" },
        id: "preview-svg",
        inputs: ["scene-layout", "object-images", "grid.visible"],
        invalidatedBy: ["scene-layout", "grid.visible"],
        kind: "composite",
        lifecycle: { cache: "none", resourceScope: "call" },
        output: "preview",
        quality: "full",
        runsOn: "main",
      },
      {
        cost: { dimensions: [], frequency: "interaction", relationship: "constant" },
        id: "editor-overlay",
        inputs: ["field.tool", "field.selection", "pointer.cell"],
        invalidatedBy: ["field.tool", "field.selection", "pointer.cell"],
        kind: "handles",
        lifecycle: { cache: "none", resourceScope: "call" },
        output: "overlay",
        quality: "preview",
        runsOn: "main",
      },
      {
        cost: {
          dimensions: ["placed-pieces", "export-long-edge"],
          frequency: "batch",
          relationship: "product",
        },
        id: "export-raster",
        inputs: ["scene-layout", "object-images", "export.image.resolution"],
        invalidatedBy: ["scene-layout", "export.image.resolution"],
        kind: "export",
        lifecycle: { cache: "none", resourceScope: "call" },
        output: "export",
        quality: "export",
        runsOn: "main",
      },
    ],
    runtimeId: "iso-sushi-set-v1",
  });

export const isoObjectImagesPass = isoRendererPipelineRegistration.getPass("object-images");
export const isoSceneLayoutPass = isoRendererPipelineRegistration.getPass("scene-layout");
export const isoPreviewSvgPass = isoRendererPipelineRegistration.getPass("preview-svg");
export const isoEditorOverlayPass = isoRendererPipelineRegistration.getPass("editor-overlay");
export const isoExportRasterPass = isoRendererPipelineRegistration.getPass("export-raster");
