import type {
  ToolcraftProductExportFrameContext,
  ToolcraftProductExportRenderer,
} from "@/toolcraft/runtime";

import { createIsoImageStore } from "./iso-image-store";
import {
  ISO_OBJECT_IMAGES_KEY,
  isoExportRasterPass,
  isoObjectImagesPass,
} from "./iso-pipeline";
import type { IsoPoint, IsoSceneModel } from "./iso-geometry";
import { ISO_FACE_FILLS, ISO_GRID_DASH, ISO_GRID_STROKE } from "./iso-scene";
import {
  buildIsoSceneModelFromState,
  getIsoLibraryAssets,
  readIsoSceneInput,
} from "./iso-state";

type IsoExportContext = ToolcraftProductExportFrameContext["context"];

function fillPolygons(context: IsoExportContext, polygons: readonly (readonly IsoPoint[])[], fill: string) {
  context.fillStyle = fill;
  context.beginPath();
  polygons.forEach((polygon) => {
    polygon.forEach((point, index) => {
      if (index === 0) context.moveTo(point.x, point.y);
      else context.lineTo(point.x, point.y);
    });
    context.closePath();
  });
  context.fill();
}

/** Column side tints and the dashed guide, as in the preview. */
function drawIsoGuide(context: IsoExportContext, model: IsoSceneModel) {
  context.save();
  (["left", "right"] as const).forEach((side) => {
    const faces = model.guideFaces.filter((face) => face.side === side);
    fillPolygons(context, faces.map((face) => face.points), ISO_FACE_FILLS[side]);
  });
  context.strokeStyle = ISO_GRID_STROKE;
  context.lineWidth = 1;
  context.setLineDash([...ISO_GRID_DASH]);
  context.beginPath();
  model.guide.forEach((segment) => {
    context.moveTo(segment.from.x, segment.from.y);
    context.lineTo(segment.to.x, segment.to.y);
  });
  context.stroke();
  context.restore();
}

/**
 * Draws the same scene model as the SVG preview into the runtime-owned export
 * context. The context already maps world coordinates to output pixels; the
 * model is field-local, so it is shifted by its centre.
 */
export const isoRasterFrameRenderer = {
  baseFileName: "sushi-set",
  async renderFrame({ context, rendererPipeline, signal, state }) {
    if (!rendererPipeline) {
      throw new Error("The sushi set renderer pipeline is unavailable.");
    }
    const input = readIsoSceneInput(state);
    const model = buildIsoSceneModelFromState(state);
    const resourceRefs = new Map(
      getIsoLibraryAssets(state.mediaAssets).flatMap((asset) =>
        "resourceRef" in asset ? [[asset.id, asset.resourceRef] as const] : [],
      ),
    );

    await rendererPipeline.runPass(isoExportRasterPass, undefined, async () => {
      const store = await rendererPipeline.runPass(
        isoObjectImagesPass,
        { "library.images": ISO_OBJECT_IMAGES_KEY },
        (pass) =>
          pass.getOrCreateResource(
            [ISO_OBJECT_IMAGES_KEY],
            createIsoImageStore,
            (resource) => resource.dispose(),
          ),
      );
      const images = await Promise.all(
        (model.piecesVisible ? model.items : []).map((item) => {
          const resourceRef = resourceRefs.get(item.placement.objectId);
          return item.imageRect && resourceRef ? store.load(resourceRef, signal) : null;
        }),
      );
      signal.throwIfAborted();

      context.save();
      try {
        context.translate(-model.center.x, -model.center.y);

        if (input.includeGrid) drawIsoGuide(context, model);

        model.items.forEach((item, index) => {
          const image = images[index];
          if (!image || !item.imageRect) return;
          context.drawImage(
            image.bitmap,
            item.imageRect.x,
            item.imageRect.y,
            item.imageRect.width,
            item.imageRect.height,
          );
        });
      } finally {
        context.restore();
      }
    });
  },
} satisfies ToolcraftProductExportRenderer;
