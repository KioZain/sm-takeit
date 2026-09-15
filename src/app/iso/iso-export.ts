import type { ToolcraftProductExportRenderer } from "@/toolcraft/runtime";

import { createIsoImageStore } from "./iso-image-store";
import {
  ISO_OBJECT_IMAGES_KEY,
  isoExportRasterPass,
  isoObjectImagesPass,
} from "./iso-pipeline";
import {
  getIsoGridLines,
  ISO_GRID_DASH,
  ISO_GRID_STROKE,
  ISO_SHADOW_COLOR,
} from "./iso-scene";
import {
  buildIsoSceneModelFromState,
  getIsoLibraryAssets,
  readIsoSceneInput,
} from "./iso-state";

/**
 * Draws the same scene model as the SVG preview into the runtime-owned export
 * context. The context already maps world coordinates to output pixels; the
 * model is field-local, so it is shifted by its centre.
 */
export const isoRasterFrameRenderer = {
  baseFileName: "sushi-set",
  async renderFrame({ context, pixelRatio, rendererPipeline, signal, state }) {
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
        model.items.map((item) => {
          const resourceRef = resourceRefs.get(item.placement.objectId);
          return item.imageRect && resourceRef ? store.load(resourceRef, signal) : null;
        }),
      );
      signal.throwIfAborted();

      context.save();
      try {
        context.translate(-model.center.x, -model.center.y);

        if (input.includeGrid) {
          context.save();
          context.strokeStyle = ISO_GRID_STROKE;
          context.lineWidth = 1;
          context.setLineDash([...ISO_GRID_DASH]);
          context.beginPath();
          for (const line of getIsoGridLines(input.gridSize, input.cellSize)) {
            context.moveTo(line.from.x, line.from.y);
            context.lineTo(line.to.x, line.to.y);
          }
          context.stroke();
          context.restore();
        }

        if (model.shadowPolygons.length > 0 && input.shadow.opacity > 0) {
          context.save();
          context.globalAlpha = input.shadow.opacity;
          context.fillStyle = ISO_SHADOW_COLOR;
          if (input.shadow.blur > 0) {
            // Canvas filters are measured in output pixels, not transformed units.
            context.filter = `blur(${input.shadow.blur * pixelRatio}px)`;
          }
          context.beginPath();
          for (const polygon of model.shadowPolygons) {
            polygon.forEach((point, index) => {
              if (index === 0) context.moveTo(point.x, point.y);
              else context.lineTo(point.x, point.y);
            });
            context.closePath();
          }
          context.fill();
          context.restore();
        }

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
