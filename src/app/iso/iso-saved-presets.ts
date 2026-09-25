import type { ToolcraftCommand } from "@/toolcraft/runtime";

import type { IsoFootprint, IsoPlacement, IsoPoint } from "./iso-geometry";
import {
  getIsoLibraryObjects,
  isIsoFootprint,
  ISO_TARGETS,
  readIsoPlacements,
  type IsoStateSource,
} from "./iso-state";

/**
 * A preset the user saves from the panel. It stores settings and the field
 * layout, never the uploaded PNGs: objects are referenced by their name, so the
 * same preset works after the same files are uploaded again with new ids.
 */
export type IsoSavedObject = Readonly<{
  anchor: IsoPoint;
  footprint: IsoFootprint;
  name: string;
  scale: number;
}>;

export type IsoSavedPlacement = Readonly<{
  col: number;
  footprint: IsoFootprint;
  objectName: string;
  row: number;
}>;

export type IsoSavedPreset = Readonly<{
  id: string;
  name: string;
  objects: readonly IsoSavedObject[];
  placements: readonly IsoSavedPlacement[];
  savedAt: string;
  values: Readonly<Record<string, unknown>>;
}>;

export type IsoSavedPresetsValue = Readonly<{
  items: readonly IsoSavedPreset[];
  /** Preset ids in the order the owner dragged them; unknown ids keep source order. */
  order: readonly string[];
}>;

export const ISO_EMPTY_SAVED_PRESETS: IsoSavedPresetsValue = Object.freeze({
  items: Object.freeze([]) as readonly IsoSavedPreset[],
  order: Object.freeze([]) as readonly string[],
});

export const ISO_SAVED_PRESET_NAME_MAX = 40;

/**
 * Exactly the targets a saved preset captures. Uploads, the active tool and the
 * section selection are session state, so they stay out; everything listed here
 * is what gets baked in when a preset moves into the source.
 */
export const ISO_PRESET_VALUE_TARGETS: readonly string[] = [
  ISO_TARGETS.gridCols,
  ISO_TARGETS.gridRows,
  ISO_TARGETS.cellSize,
  ISO_TARGETS.levelHeight,
  ISO_TARGETS.gridVisible,
  ISO_TARGETS.reliefPattern,
  ISO_TARGETS.reliefCorner,
  ISO_TARGETS.reliefEdge,
  ISO_TARGETS.reliefMax,
  ISO_TARGETS.reliefStep,
  ISO_TARGETS.reliefWave,
  ISO_TARGETS.reliefWaveDirection,
  ISO_TARGETS.reliefWaveEasing,
  ISO_TARGETS.reliefWaveLength,
  ISO_TARGETS.reliefEdits,
  ISO_TARGETS.crop,
  ISO_TARGETS.padding,
  ISO_TARGETS.showPieces,
  ISO_TARGETS.includeGrid,
  ISO_TARGETS.includeBackground,
  ISO_TARGETS.background,
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function toText(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function toCell(value: unknown): number | null {
  return typeof value === "number" && Number.isInteger(value) ? value : null;
}

export function normalizeIsoPresetName(name: string, fallback: string): string {
  const trimmed = name.trim().slice(0, ISO_SAVED_PRESET_NAME_MAX);
  return trimmed || fallback;
}

function normalizeObject(value: unknown): IsoSavedObject[] {
  if (!isRecord(value) || typeof value.name !== "string") return [];
  const anchor = isRecord(value.anchor) ? value.anchor : {};
  const toUnit = (raw: unknown): number =>
    typeof raw === "number" && Number.isFinite(raw) ? Math.min(1, Math.max(0, raw)) : 0.5;
  return [
    {
      anchor: { x: toUnit(anchor.x), y: toUnit(anchor.y) },
      footprint: isIsoFootprint(value.footprint) ? value.footprint : "1x1",
      name: value.name,
      scale: typeof value.scale === "number" && Number.isFinite(value.scale) ? value.scale : 1,
    },
  ];
}

function normalizePlacement(value: unknown): IsoSavedPlacement[] {
  if (!isRecord(value) || typeof value.objectName !== "string") return [];
  const col = toCell(value.col);
  const row = toCell(value.row);
  if (col === null || row === null || !isIsoFootprint(value.footprint)) return [];
  return [{ col, footprint: value.footprint, objectName: value.objectName, row }];
}

function normalizePreset(value: unknown, index: number): IsoSavedPreset[] {
  if (!isRecord(value)) return [];
  return [
    {
      id: toText(value.id, `preset-${index}`),
      name: toText(value.name, `Пресет ${index + 1}`),
      objects: Array.isArray(value.objects) ? value.objects.flatMap(normalizeObject) : [],
      placements: Array.isArray(value.placements) ? value.placements.flatMap(normalizePlacement) : [],
      savedAt: toText(value.savedAt, ""),
      values: isRecord(value.values) ? value.values : {},
    },
  ];
}

/** Saved presets as stored in the panel value, repaired after a reload. */
export function readIsoSavedPresets(values: IsoStateSource["values"]): IsoSavedPresetsValue {
  const value = values[ISO_TARGETS.savedPresets];
  if (!isRecord(value) || !Array.isArray(value.items)) return ISO_EMPTY_SAVED_PRESETS;
  return {
    items: value.items.flatMap(normalizePreset),
    order: Array.isArray(value.order)
      ? value.order.filter((id): id is string => typeof id === "string")
      : [],
  };
}

function pickPresetValues(values: IsoStateSource["values"]): Record<string, unknown> {
  return ISO_PRESET_VALUE_TARGETS.reduce<Record<string, unknown>>(
    (picked, target) =>
      values[target] === undefined ? picked : { ...picked, [target]: values[target] },
    {},
  );
}

/** Capture the current settings and field layout under a name. */
export function createIsoSavedPreset(
  state: IsoStateSource,
  name: string,
  id: string,
  savedAt: string,
): IsoSavedPreset {
  const objects = getIsoLibraryObjects(state);
  const namesById = new Map(objects.map((object) => [object.id, object.record.name]));
  return {
    id,
    name: normalizeIsoPresetName(name, "Пресет"),
    objects: objects.map((object) => ({
      anchor: object.record.anchor,
      footprint: object.record.footprint,
      name: object.record.name,
      scale: object.record.scale,
    })),
    placements: readIsoPlacements(state.values).flatMap((placement): IsoSavedPlacement[] => {
      const objectName = namesById.get(placement.objectId);
      return objectName === undefined
        ? []
        : [{ col: placement.col, footprint: placement.footprint, objectName, row: placement.row }];
    }),
    savedAt,
    values: pickPresetValues(state.values),
  };
}

export function addIsoSavedPreset(
  value: IsoSavedPresetsValue,
  preset: IsoSavedPreset,
): IsoSavedPresetsValue {
  return { ...value, items: [...value.items, preset] };
}

export function renameIsoSavedPreset(
  value: IsoSavedPresetsValue,
  id: string,
  name: string,
): IsoSavedPresetsValue {
  return {
    ...value,
    items: value.items.map((preset) =>
      preset.id === id ? { ...preset, name: normalizeIsoPresetName(name, preset.name) } : preset,
    ),
  };
}

export function removeIsoSavedPreset(
  value: IsoSavedPresetsValue,
  id: string,
): IsoSavedPresetsValue {
  return { ...value, items: value.items.filter((preset) => preset.id !== id) };
}

/** Current object ids by object name; the first upload wins on a duplicate name. */
function getObjectIdsByName(state: IsoStateSource): Map<string, string> {
  return getIsoLibraryObjects(state).reduce((ids, object) => {
    if (!ids.has(object.record.name)) ids.set(object.record.name, object.id);
    return ids;
  }, new Map<string, string>());
}

export type IsoSavedPresetMatch = Readonly<{
  /** Object names the preset expects that are not uploaded right now. */
  missing: readonly string[];
  matched: number;
}>;

/** Which of a preset's objects the current uploads cover. */
export function getIsoSavedPresetMatch(
  state: IsoStateSource,
  preset: IsoSavedPreset,
): IsoSavedPresetMatch {
  const ids = getObjectIdsByName(state);
  const missing = preset.objects
    .filter((object) => !ids.has(object.name))
    .map((object) => object.name);
  return { matched: preset.objects.length - missing.length, missing };
}

function toLibraryItems(
  state: IsoStateSource,
  preset: IsoSavedPreset,
  ids: Map<string, string>,
): Record<string, unknown> {
  const sizesById = new Map(
    getIsoLibraryObjects(state).map((object) => [object.id, object.record.size]),
  );
  return preset.objects.reduce<Record<string, unknown>>((items, object) => {
    const id = ids.get(object.name);
    // The first entry of a repeated name wins, matching how ids are resolved.
    if (id === undefined || Object.hasOwn(items, id)) return items;
    return {
      ...items,
      [id]: {
        anchor: object.anchor,
        footprint: object.footprint,
        name: object.name,
        scale: object.scale,
        size: sizesById.get(id) ?? null,
      },
    };
  }, {});
}

function toPlacements(preset: IsoSavedPreset, ids: Map<string, string>): IsoPlacement[] {
  return preset.placements.flatMap((placement): IsoPlacement[] => {
    const objectId = ids.get(placement.objectName);
    return objectId === undefined
      ? []
      : [
          {
            col: placement.col,
            footprint: placement.footprint,
            id: `${objectId}@${placement.col},${placement.row}`,
            objectId,
            row: placement.row,
          },
        ];
  });
}

/**
 * One undoable step that restores a preset: its settings, the object records of
 * the uploads it recognises, and the field layout built from them. Objects that
 * are not uploaded are skipped, so the rest of the preset still applies.
 *
 * A preset without objects carries no layout at all, so it changes settings only
 * and leaves the library and the placed pieces exactly as they are.
 */
export function getIsoSavedPresetCommand(
  state: IsoStateSource,
  preset: IsoSavedPreset,
): ToolcraftCommand {
  const ids = getObjectIdsByName(state);
  const activeId = preset.objects.map((object) => ids.get(object.name)).find(Boolean) ?? null;
  const layout =
    preset.objects.length === 0
      ? {}
      : {
          [ISO_TARGETS.libraryObjects]: { activeId, items: toLibraryItems(state, preset, ids) },
          [ISO_TARGETS.placements]: { items: toPlacements(preset, ids) },
        };
  return {
    history: "record",
    label: `Пресет «${preset.name}»`,
    type: "controls.apply",
    values: { ...preset.values, ...layout },
  };
}

/** The presets as a file the product owner can hand over to be baked into the source. */
export function toIsoSavedPresetsFile(value: IsoSavedPresetsValue): string {
  return JSON.stringify({ presets: value.items, version: 1 }, null, 2);
}
