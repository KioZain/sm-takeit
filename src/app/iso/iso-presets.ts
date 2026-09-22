import type { ToolcraftCommand } from "@/toolcraft/runtime";

import { ISO_TARGETS } from "./iso-state";

/**
 * A numbered generator preset. Its values are applied in one undoable step;
 * targets it leaves out keep their current value.
 */
export type IsoPreset = Readonly<{
  /** Short button label shown in the Presets row. */
  label: string;
  values: Readonly<Partial<Record<(typeof ISO_TARGETS)[keyof typeof ISO_TARGETS], unknown>>>;
}>;

/** Add new presets to the end of this list; each one gets its own numbered button. */
export const ISO_PRESETS: readonly IsoPreset[] = [
  {
    label: "1",
    values: {
      [ISO_TARGETS.gridCols]: 4,
      [ISO_TARGETS.gridRows]: 4,
      [ISO_TARGETS.levelHeight]: 20,
      [ISO_TARGETS.reliefCorner]: "top",
      [ISO_TARGETS.reliefMax]: 2,
      [ISO_TARGETS.reliefPattern]: "corner-rings",
      [ISO_TARGETS.reliefWave]: true,
      [ISO_TARGETS.reliefWaveDirection]: "outward",
      [ISO_TARGETS.reliefWaveEasing]: "sine",
      [ISO_TARGETS.reliefWaveLength]: 9,
    },
  },
];

const PRESET_ACTION_PREFIX = "preset.";

export function getIsoPresetActionValue(index: number): string {
  return `${PRESET_ACTION_PREFIX}${index + 1}`;
}

/** Panel actions for every preset, in list order. */
export const ISO_PRESET_ACTIONS = ISO_PRESETS.map((preset, index) => ({
  label: preset.label,
  value: getIsoPresetActionValue(index),
}));

/** The command that applies a preset action, or null for other actions. */
export function getIsoPresetCommand(actionValue: string): ToolcraftCommand | null {
  if (!actionValue.startsWith(PRESET_ACTION_PREFIX)) return null;
  const index = Number(actionValue.slice(PRESET_ACTION_PREFIX.length)) - 1;
  const preset = Number.isInteger(index) ? ISO_PRESETS[index] : undefined;
  if (!preset) return null;
  return {
    history: "record",
    label: `Пресет ${preset.label}`,
    type: "controls.apply",
    values: { ...preset.values },
  };
}
