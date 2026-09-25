import { ISO_PRESETS } from "./iso-presets";
import {
  createIsoSavedPreset,
  normalizeIsoPresetName,
  readIsoSavedPresets,
  removeIsoSavedPreset,
  type IsoSavedPreset,
  type IsoSavedPresetsValue,
} from "./iso-saved-presets";
import type { IsoStateSource } from "./iso-state";

/**
 * One line of the presets list. Baked presets and the owner's own presets are
 * edited the same way: an edited baked preset is stored under its own id and
 * shadows the baked one until it is reset.
 */
export type IsoPresetRow = Readonly<{
  builtIn: boolean;
  /** A baked preset that currently has stored edits shadowing it. */
  overridden: boolean;
  preset: IsoSavedPreset;
}>;

const BUILT_IN_IDS: ReadonlySet<string> = new Set(ISO_PRESETS.map((preset) => preset.id));

function toRow(preset: IsoSavedPreset, stored: ReadonlyMap<string, IsoSavedPreset>): IsoPresetRow {
  const override = stored.get(preset.id);
  return { builtIn: true, overridden: override !== undefined, preset: override ?? preset };
}

/** Rows in their dragged order; anything the order does not mention keeps source order. */
function sortRows(rows: readonly IsoPresetRow[], order: readonly string[]): IsoPresetRow[] {
  const ranked = order.flatMap((id) => rows.filter((row) => row.preset.id === id));
  return [...ranked, ...rows.filter((row) => !order.includes(row.preset.id))];
}

/** Baked presets first, in source order, then the owner's own presets, then dragged order. */
export function getIsoPresetRows(values: IsoStateSource["values"]): IsoPresetRow[] {
  const saved = readIsoSavedPresets(values);
  const stored = new Map(saved.items.map((preset) => [preset.id, preset]));
  return sortRows(
    [
      ...ISO_PRESETS.map((preset) => toRow(preset, stored)),
      ...saved.items
        .filter((preset) => !BUILT_IN_IDS.has(preset.id))
        .map((preset) => ({ builtIn: false, overridden: false, preset })),
    ],
    saved.order,
  );
}

/**
 * Move one preset to another row's position. The whole visible order is stored,
 * so baked and own presets can be mixed freely.
 */
export function moveIsoPreset(
  value: IsoSavedPresetsValue,
  rows: readonly IsoPresetRow[],
  movedId: string,
  targetId: string,
): IsoSavedPresetsValue {
  const ids = rows.map((row) => row.preset.id);
  const from = ids.indexOf(movedId);
  const to = ids.indexOf(targetId);
  if (from < 0 || to < 0 || from === to) return value;
  const without = ids.filter((id) => id !== movedId);
  return { ...value, order: [...without.slice(0, to), movedId, ...without.slice(to)] };
}

function replaceStored(
  value: IsoSavedPresetsValue,
  preset: IsoSavedPreset,
): IsoSavedPresetsValue {
  return value.items.some((item) => item.id === preset.id)
    ? { ...value, items: value.items.map((item) => (item.id === preset.id ? preset : item)) }
    : { ...value, items: [...value.items, preset] };
}

/** Replace a preset's contents with the current settings and field, keeping its name. */
export function overwriteIsoPreset(
  value: IsoSavedPresetsValue,
  row: IsoPresetRow,
  state: IsoStateSource,
  savedAt: string,
): IsoSavedPresetsValue {
  return replaceStored(
    value,
    createIsoSavedPreset(state, row.preset.name, row.preset.id, savedAt),
  );
}

export function renameIsoPreset(
  value: IsoSavedPresetsValue,
  row: IsoPresetRow,
  name: string,
): IsoSavedPresetsValue {
  const next = normalizeIsoPresetName(name, row.preset.name);
  return next === row.preset.name
    ? value
    : replaceStored(value, { ...row.preset, name: next });
}

/** Drop the stored edits of a baked preset, or remove the owner's own preset. */
export function resetIsoPreset(
  value: IsoSavedPresetsValue,
  row: IsoPresetRow,
): IsoSavedPresetsValue {
  return removeIsoSavedPreset(value, row.preset.id);
}

/** Every preset as one handover file: baked presets with their edits, then the new ones. */
export function toIsoPresetsFile(rows: readonly IsoPresetRow[]): string {
  return JSON.stringify(
    { presets: rows.map((row) => row.preset), version: 1 },
    null,
    2,
  );
}
