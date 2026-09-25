import type { IsoSavedPreset } from "./iso-saved-presets";
import { ISO_TARGETS } from "./iso-state";

/**
 * A built-in generator preset. It has the same shape as a preset saved from the
 * panel, so both are applied the same way.
 *
 * These presets carry settings only: no objects and no pieces, so applying one
 * reshapes the field and the relief and leaves the uploaded set alone.
 */
export type IsoPreset = IsoSavedPreset;

/** Settings every baked preset shares; each one overrides what makes it different. */
const SET_VALUES = {
  [ISO_TARGETS.cellSize]: 72,
  [ISO_TARGETS.crop]: "field",
  [ISO_TARGETS.gridRows]: 4,
  [ISO_TARGETS.gridVisible]: true,
  [ISO_TARGETS.includeBackground]: false,
  [ISO_TARGETS.includeGrid]: false,
  [ISO_TARGETS.padding]: 24,
  [ISO_TARGETS.reliefCorner]: "top",
  [ISO_TARGETS.reliefEdge]: "top-left",
  [ISO_TARGETS.reliefMax]: 1,
  [ISO_TARGETS.reliefStep]: 2,
  [ISO_TARGETS.reliefWave]: true,
  [ISO_TARGETS.reliefWaveDirection]: "outward",
  [ISO_TARGETS.reliefWaveEasing]: "sine",
  [ISO_TARGETS.showPieces]: true,
  [ISO_TARGETS.background]: "#FFFFFF",
} as const;

function preset(
  id: string,
  name: string,
  values: Readonly<Record<string, unknown>>,
): IsoPreset {
  return { id, name, objects: [], placements: [], savedAt: "", values: { ...SET_VALUES, ...values } };
}

/** Add new presets to the end of this list; each one gets its own button. */
export const ISO_PRESETS: readonly IsoPreset[] = [
  preset("built-in-1", "Стандартный сет (16 шт)", {
    [ISO_TARGETS.gridCols]: 4,
    [ISO_TARGETS.levelHeight]: 20,
    [ISO_TARGETS.reliefMax]: 2,
    [ISO_TARGETS.reliefPattern]: "corner-rings",
    [ISO_TARGETS.reliefWaveLength]: 9,
  }),
  preset("built-in-medium-24", "Средний сет (24 шт)", {
    [ISO_TARGETS.gridCols]: 6,
    [ISO_TARGETS.levelHeight]: 24,
    [ISO_TARGETS.reliefPattern]: "corner-diagonal",
    [ISO_TARGETS.reliefWaveLength]: 7,
  }),
  preset("built-in-plain-8", "Обычный (8 шт)", {
    [ISO_TARGETS.background]: "#D9D8D8",
    [ISO_TARGETS.gridCols]: 2,
    [ISO_TARGETS.levelHeight]: 24,
    [ISO_TARGETS.reliefEdge]: "top-right",
    [ISO_TARGETS.reliefPattern]: "edge",
    [ISO_TARGETS.reliefWaveLength]: 7,
  }),
  preset("preset-mugp7855", "Стандартный сет (16_шт) v2", {
    [ISO_TARGETS.gridCols]: 4,
    [ISO_TARGETS.levelHeight]: 20,
    [ISO_TARGETS.reliefPattern]: "checker",
    [ISO_TARGETS.reliefWaveLength]: 9,
  }),
  preset("preset-mugpcld7", "Большой сет (40)", {
    [ISO_TARGETS.gridCols]: 6,
    [ISO_TARGETS.gridRows]: 6,
    [ISO_TARGETS.levelHeight]: 20,
    [ISO_TARGETS.reliefEdge]: "top-right",
    [ISO_TARGETS.reliefPattern]: "corner-rings",
    [ISO_TARGETS.reliefWaveLength]: 9,
  }),
];
