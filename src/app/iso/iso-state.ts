import type { ToolcraftCommand } from "@/toolcraft/runtime";

import {
  buildIsoSceneModel,
  filterRenderablePlacements,
  ISO_FOOTPRINTS,
  type IsoCellRect,
  type IsoCropMode,
  type IsoFootprint,
  type IsoObjectRecord,
  type IsoPlacement,
  type IsoPoint,
  type IsoSceneInput,
  type IsoSceneModel,
} from "./iso-geometry";

export const ISO_TARGETS = {
  background: "scene.background",
  cellSize: "grid.cellSize",
  commands: "field.commands",
  crop: "output.crop",
  gridPreset: "grid.preset",
  gridVisible: "grid.visible",
  includeBackground: "export.includeBackground",
  includeGrid: "output.includeGrid",
  libraryFiles: "library.files",
  libraryObjects: "library.objects",
  padding: "output.padding",
  placements: "field.placements",
  selection: "field.selection",
  shadowBlur: "shadow.blur",
  shadowOffset: "shadow.offset",
  shadowOpacity: "shadow.opacity",
  tool: "field.tool",
} as const;

export type IsoTool = "erase" | "place" | "select";

export type IsoGridPreset = "6" | "12";

export type IsoLibraryValue = Readonly<{
  activeId: string | null;
  items: Readonly<Record<string, IsoObjectRecord>>;
}>;

export type IsoPlacementsValue = Readonly<{ items: readonly IsoPlacement[] }>;

export const ISO_EMPTY_LIBRARY: IsoLibraryValue = Object.freeze({
  activeId: null,
  items: Object.freeze({}),
});

export const ISO_EMPTY_PLACEMENTS: IsoPlacementsValue = Object.freeze({
  items: Object.freeze([]) as readonly IsoPlacement[],
});

export const ISO_DEFAULTS = {
  background: "#FFFFFF",
  cellSize: 72,
  crop: "field" as IsoCropMode,
  gridPreset: "6" as IsoGridPreset,
  gridVisible: true,
  includeBackground: false,
  includeGrid: false,
  padding: 24,
  shadowBlur: 8,
  shadowOffset: { x: 0, y: 0.1 },
  shadowOpacity: 30,
  tool: "place" as IsoTool,
} as const;

export const ISO_DEFAULT_ANCHOR: IsoPoint = Object.freeze({ x: 0.5, y: 0.9 });

export const ISO_LIBRARY_MAX_OBJECTS = 24;

export const ISO_FIELD_HANDLE_TEST_ID = "iso-field";

export const ISO_ACTIONS = {
  clearField: "field.clear",
  fillField: "field.fill-all",
  fillSelection: "field.fill-selection",
} as const;

/** Structural media view shared by live state and readonly export snapshots. */
export type IsoMediaAssetLike = Readonly<{
  assetKind: string;
  fileName: string;
  id: string;
  sourceTarget?: string;
}>;

export type IsoStateSource = Readonly<{
  mediaAssets: readonly IsoMediaAssetLike[];
  values: Readonly<Record<string, unknown>>;
}>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function finiteNumber(value: unknown, fallback: number): number {
  const parsed = typeof value === "string" ? Number(value) : value;
  return typeof parsed === "number" && Number.isFinite(parsed) ? parsed : fallback;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function isIsoFootprint(value: unknown): value is IsoFootprint {
  return ISO_FOOTPRINTS.includes(value as IsoFootprint);
}

export function getIsoGridSize(values: IsoStateSource["values"]): number {
  return values[ISO_TARGETS.gridPreset] === "12" ? 12 : 6;
}

export function readIsoTool(values: IsoStateSource["values"]): IsoTool {
  const tool = values[ISO_TARGETS.tool];
  return tool === "select" || tool === "erase" ? tool : "place";
}

function readCropMode(value: unknown): IsoCropMode {
  return value === "off" || value === "content" ? value : "field";
}

export function stripFileExtension(fileName: string): string {
  const base = fileName.split("/").at(-1) ?? fileName;
  const dot = base.lastIndexOf(".");
  return dot > 0 ? base.slice(0, dot) : base;
}

export function createIsoObjectRecord(fileName: string): IsoObjectRecord {
  return {
    anchor: ISO_DEFAULT_ANCHOR,
    footprint: "1x1",
    name: stripFileExtension(fileName),
    scale: 1,
    size: null,
  };
}

export const ISO_SCALE_RANGE = { max: 4, min: 0.1 } as const;

export function normalizeIsoObjectRecord(
  value: unknown,
  fileName: string,
): IsoObjectRecord {
  const fallback = createIsoObjectRecord(fileName);
  if (!isRecord(value)) return fallback;
  const anchor = isRecord(value.anchor) ? value.anchor : {};
  const size = isRecord(value.size) ? value.size : null;
  const width = size ? finiteNumber(size.width, 0) : 0;
  const height = size ? finiteNumber(size.height, 0) : 0;
  return {
    anchor: {
      x: clamp(finiteNumber(anchor.x, fallback.anchor.x), 0, 1),
      y: clamp(finiteNumber(anchor.y, fallback.anchor.y), 0, 1),
    },
    footprint: isIsoFootprint(value.footprint) ? value.footprint : fallback.footprint,
    name: typeof value.name === "string" ? value.name : fallback.name,
    scale: clamp(finiteNumber(value.scale, 1), ISO_SCALE_RANGE.min, ISO_SCALE_RANGE.max),
    size: width > 0 && height > 0 ? { height, width } : null,
  };
}

/** Library file assets in runtime media order. */
export function getIsoLibraryAssets<Asset extends IsoMediaAssetLike>(
  mediaAssets: readonly Asset[],
): Asset[] {
  return mediaAssets.filter(
    (asset) =>
      asset.assetKind === "file" &&
      (asset.sourceTarget === undefined || asset.sourceTarget === ISO_TARGETS.libraryFiles),
  );
}

export function readIsoLibraryValue(values: IsoStateSource["values"]): IsoLibraryValue {
  const value = values[ISO_TARGETS.libraryObjects];
  if (!isRecord(value)) return ISO_EMPTY_LIBRARY;
  return {
    activeId: typeof value.activeId === "string" ? value.activeId : null,
    items: isRecord(value.items) ? (value.items as Record<string, IsoObjectRecord>) : {},
  };
}

export type IsoLibraryObject = Readonly<{
  asset: IsoMediaAssetLike;
  id: string;
  record: IsoObjectRecord;
  stored: boolean;
}>;

/** Every uploaded object with its normalized record (defaults until one is stored). */
export function getIsoLibraryObjects(state: IsoStateSource): IsoLibraryObject[] {
  const library = readIsoLibraryValue(state.values);
  return getIsoLibraryAssets(state.mediaAssets).map((asset) => ({
    asset,
    id: asset.id,
    record: normalizeIsoObjectRecord(library.items[asset.id], asset.fileName),
    stored: Object.hasOwn(library.items, asset.id),
  }));
}

export function getIsoActiveObjectId(state: IsoStateSource): string | null {
  const objects = getIsoLibraryObjects(state);
  const { activeId } = readIsoLibraryValue(state.values);
  return objects.some((object) => object.id === activeId)
    ? activeId
    : (objects[0]?.id ?? null);
}

export function readIsoPlacements(values: IsoStateSource["values"]): IsoPlacement[] {
  const value = values[ISO_TARGETS.placements];
  const items = isRecord(value) && Array.isArray(value.items) ? value.items : [];
  return items.flatMap((item): IsoPlacement[] => {
    if (!isRecord(item) || typeof item.objectId !== "string" || !isIsoFootprint(item.footprint)) {
      return [];
    }
    const col = finiteNumber(item.col, Number.NaN);
    const row = finiteNumber(item.row, Number.NaN);
    if (!Number.isInteger(col) || !Number.isInteger(row)) return [];
    return [
      {
        col,
        footprint: item.footprint,
        id: typeof item.id === "string" ? item.id : `${item.objectId}@${col},${row}`,
        objectId: item.objectId,
        row,
      },
    ];
  });
}

/** Placements that currently render: object exists, footprint on the grid, no overlap. */
export function getIsoActivePlacements(state: IsoStateSource): IsoPlacement[] {
  return filterRenderablePlacements(
    readIsoPlacements(state.values),
    new Set(getIsoLibraryAssets(state.mediaAssets).map((asset) => asset.id)),
    getIsoGridSize(state.values),
  );
}

export type IsoCompositionRow = Readonly<{ count: number; id: string; name: string }>;

/** Pieces per object in library order, plus the total on the field. */
export function getIsoCompositionSummary(state: IsoStateSource): Readonly<{
  rows: readonly IsoCompositionRow[];
  total: number;
}> {
  const placements = getIsoActivePlacements(state);
  const counts = placements.reduce(
    (tally, placement) => tally.set(placement.objectId, (tally.get(placement.objectId) ?? 0) + 1),
    new Map<string, number>(),
  );
  return {
    rows: getIsoLibraryObjects(state).flatMap((object) => {
      const count = counts.get(object.id);
      return count ? [{ count, id: object.id, name: object.record.name }] : [];
    }),
    total: placements.length,
  };
}

export function readIsoSelection(values: IsoStateSource["values"]): IsoCellRect | null {
  const value = values[ISO_TARGETS.selection];
  if (!isRecord(value)) return null;
  const rect = {
    col0: finiteNumber(value.col0, Number.NaN),
    col1: finiteNumber(value.col1, Number.NaN),
    row0: finiteNumber(value.row0, Number.NaN),
    row1: finiteNumber(value.row1, Number.NaN),
  };
  return Object.values(rect).every(Number.isInteger) ? rect : null;
}

export function readIsoGridVisible(values: IsoStateSource["values"]): boolean {
  return values[ISO_TARGETS.gridVisible] !== false;
}

export function readIsoSceneInput(state: IsoStateSource): IsoSceneInput {
  const { values } = state;
  const cellSize = clamp(finiteNumber(values[ISO_TARGETS.cellSize], ISO_DEFAULTS.cellSize), 8, 1024);
  const offset = isRecord(values[ISO_TARGETS.shadowOffset])
    ? (values[ISO_TARGETS.shadowOffset] as Record<string, unknown>)
    : ISO_DEFAULTS.shadowOffset;
  const objects: Record<string, IsoObjectRecord> = {};
  for (const object of getIsoLibraryObjects(state)) objects[object.id] = object.record;
  return {
    cellSize,
    crop: readCropMode(values[ISO_TARGETS.crop]),
    gridSize: getIsoGridSize(values),
    includeGrid: values[ISO_TARGETS.includeGrid] === true,
    objects,
    padding: Math.max(0, finiteNumber(values[ISO_TARGETS.padding], ISO_DEFAULTS.padding)),
    placements: readIsoPlacements(values),
    shadow: {
      blur: Math.max(0, finiteNumber(values[ISO_TARGETS.shadowBlur], ISO_DEFAULTS.shadowBlur)),
      offset: {
        x: (clamp(finiteNumber(offset.x, 0), -1, 1) * cellSize) / 2,
        y: (clamp(finiteNumber(offset.y, 0), -1, 1) * cellSize) / 2,
      },
      opacity:
        clamp(finiteNumber(values[ISO_TARGETS.shadowOpacity], ISO_DEFAULTS.shadowOpacity), 0, 100) / 100,
    },
  };
}

export function buildIsoSceneModelFromState(state: IsoStateSource): IsoSceneModel {
  return buildIsoSceneModel(readIsoSceneInput(state));
}

export function createIsoPlacementsCommand(
  items: readonly IsoPlacement[],
  label: string,
): ToolcraftCommand {
  return {
    history: "record",
    label,
    target: ISO_TARGETS.placements,
    type: "controls.setValue",
    value: { items: items.map((item) => ({ ...item })) },
  };
}

export function createIsoSelectionCommand(selection: IsoCellRect | null): ToolcraftCommand {
  return {
    history: "skip",
    target: ISO_TARGETS.selection,
    type: "controls.setValue",
    value: selection ? { ...selection } : null,
  };
}

export function createIsoLibraryCommand(
  value: IsoLibraryValue,
  label: string,
  history: "record" | "skip" = "record",
): ToolcraftCommand {
  return {
    history,
    label,
    target: ISO_TARGETS.libraryObjects,
    type: "controls.setValue",
    value: {
      activeId: value.activeId,
      items: Object.fromEntries(
        Object.entries(value.items).map(([id, record]) => [
          id,
          {
            anchor: { ...record.anchor },
            footprint: record.footprint,
            name: record.name,
            scale: record.scale,
            size: record.size ? { ...record.size } : null,
          },
        ]),
      ),
    },
  };
}
