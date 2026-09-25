import presetData from "./iso-presets.json" with { type: "json" };
import type { IsoSavedPreset } from "./iso-saved-presets";

/**
 * A built-in generator preset. It has the same shape as a preset saved from the
 * panel, so both are applied the same way: settings land directly, while objects
 * and pieces are matched to the uploaded images by object name.
 *
 * The data comes straight from the panel's own handover file, so a new set is
 * baked by replacing `iso-presets.json` with a freshly downloaded one.
 */
export type IsoPreset = IsoSavedPreset;

export const ISO_PRESETS: readonly IsoPreset[] = presetData as readonly IsoPreset[];
