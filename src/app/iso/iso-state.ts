import { getToolcraftTimelineLoopProgress, type ToolcraftCommand } from "@/toolcraft/runtime";

import {
  filterRenderablePlacements,
  footprintFitsGrid,
  heightKey,
  ISO_FOOTPRINTS,
  type IsoCellRect,
  type IsoCropMode,
  type IsoFootprint,
  type IsoGridSize,
  type IsoHeightMap,
  type IsoObjectRecord,
  type IsoPlacement,
  type IsoPoint,
  type IsoSceneInput,
  type IsoSceneModel,
} from "./iso-geometry";
import {
  composeReliefHeights,
  getPatternHeights,
  getUniformHeights,
  ISO_MAX_COLUMN_LEVELS,
  ISO_RELIEF_CORNERS,
  ISO_RELIEF_EDGES,
  ISO_RELIEF_PATTERNS,
  ISO_WAVE_DIRECTIONS,
  ISO_WAVE_EASINGS,
  type IsoReliefCorner,
  type IsoReliefEdge,
  type IsoReliefPattern,
  type IsoReliefSettings,
  type IsoWaveDirection,
  type IsoWaveEasing,
} from "./iso-relief";
import { buildIsoSceneModel } from "./iso-scene-model";

export const ISO_TARGETS = {
  background: "scene.background",
  cellSize: "grid.cellSize",
  commands: "field.commands",
  crop: "output.crop",
  gridCols: "grid.cols",
  gridRows: "grid.rows",
  gridVisible: "grid.visible",
  reliefEdits: "relief.edits",
  includeBackground: "export.includeBackground",
  includeGrid: "output.includeGrid",
  levelHeight: "grid.levelHeight",
  libraryFiles: "library.files",
  libraryObjects: "library.objects",
  padding: "output.padding",
  placements: "field.placements",
  presets: "presets.apply",
  reliefCommands: "relief.commands",
  reliefCorner: "relief.corner",
  reliefEdge: "relief.edge",
  reliefMax: "relief.max",
  reliefPattern: "relief.pattern",
  reliefStep: "relief.step",
  reliefWave: "relief.wave",
  reliefWaveDirection: "relief.waveDirection",
  reliefWaveEasing: "relief.waveEasing",
  reliefWaveLength: "relief.waveLength",
  selection: "field.selection",
  showPieces: "output.showPieces",
  tool: "field.tool",
} as const;

export type IsoTool = "erase" | "height" | "place" | "select";

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
  gridCols: 6,
  gridRows: 6,
  gridVisible: true,
  includeBackground: false,
  includeGrid: false,
  /** One column level as a percentage of the cell width. */
  levelHeight: 50,
  padding: 24,
  reliefCorner: "top" as IsoReliefCorner,
  reliefEdge: "top-left" as IsoReliefEdge,
  reliefMax: 4,
  reliefPattern: "flat" as IsoReliefPattern,
  reliefStep: 2,
  reliefWave: false,
  reliefWaveDirection: "outward" as IsoWaveDirection,
  reliefWaveEasing: "sine" as IsoWaveEasing,
  reliefWaveLength: 6,
  showPieces: true,
  tool: "place" as IsoTool,
} as const;

export const ISO_DEFAULT_ANCHOR: IsoPoint = Object.freeze({ x: 0.5, y: 0.9 });

export const ISO_LIBRARY_MAX_OBJECTS = 24;

/** Cells per side of the square field. */
export const ISO_GRID_SIZE_RANGE = { max: 8, min: 1 } as const;

export const ISO_FIELD_HANDLE_TEST_ID = "iso-field";

export const ISO_ACTIONS = {
  clearField: "field.clear",
  fillField: "field.fill-all",
  fillSelection: "field.fill-selection",
} as const;

export const ISO_RELIEF_ACTIONS = {
  resetEdits: "relief.reset-edits",
} as const;

/** Level height range as a percentage of the cell width. */
export const ISO_LEVEL_HEIGHT_RANGE = { max: 100, min: 10 } as const;

/** Structural media view shared by live state and readonly export snapshots. */
export type IsoMediaAssetLike = Readonly<{
  assetKind: string;
  fileName: string;
  id: string;
  sourceTarget?: string;
}>;

export type IsoStateSource = Readonly<{
  mediaAssets: readonly IsoMediaAssetLike[];
  /** Playback clock; the relief wave is at rest when it is absent. */
  timeline?: Readonly<{ currentTimeSeconds: number; durationSeconds: number }>;
  values: Readonly<Record<string, unknown>>;
}>;

/** Default loop length: one crest passes in four seconds, a calm pace at the default wave length. */
export const ISO_WAVE_LOOP_SECONDS = 4;

/** Wave length range in cells between two crests. */
export const ISO_WAVE_LENGTH_RANGE = { max: 12, min: 2 } as const;

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

function readGridCount(value: unknown, fallback: number): number {
  return clamp(Math.round(finiteNumber(value, fallback)), ISO_GRID_SIZE_RANGE.min, ISO_GRID_SIZE_RANGE.max);
}

/** Field size in cells along each axis. */
export function getIsoGridSize(values: IsoStateSource["values"]): IsoGridSize {
  return {
    cols: readGridCount(values[ISO_TARGETS.gridCols], ISO_DEFAULTS.gridCols),
    rows: readGridCount(values[ISO_TARGETS.gridRows], ISO_DEFAULTS.gridRows),
  };
}

/**
 * Field modes offered in the panel. Select (sections) and Height (hand-raised
 * columns) stay implemented but are hidden from users; add them back here and
 * to the Mode control options to expose them again.
 */
export const ISO_VISIBLE_TOOLS: readonly IsoTool[] = ["place", "erase"];

/** Solid (hidden-line) column guide, fixed under the hood instead of a panel switch. */
export const ISO_SOLID_COLUMNS = true;

export function readIsoTool(values: IsoStateSource["values"]): IsoTool {
  const tool = values[ISO_TARGETS.tool];
  return ISO_VISIBLE_TOOLS.includes(tool as IsoTool) ? (tool as IsoTool) : "place";
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

/**
 * Stored pieces of existing objects that no longer fit a shrunken grid. Field
 * edits keep them so growing the grid again brings them back.
 */
export function getIsoOffGridPlacements(state: IsoStateSource): IsoPlacement[] {
  const objectIds = new Set(getIsoLibraryAssets(state.mediaAssets).map((asset) => asset.id));
  const gridSize = getIsoGridSize(state.values);
  return readIsoPlacements(state.values).filter(
    (placement) =>
      objectIds.has(placement.objectId) &&
      !footprintFitsGrid(placement.col, placement.row, placement.footprint, gridSize),
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

/** Hand edits in levels over the pattern, including columns outside a shrunken grid. */
export function readIsoReliefEdits(values: IsoStateSource["values"]): Map<string, number> {
  const value = values[ISO_TARGETS.reliefEdits];
  const cells = isRecord(value) && isRecord(value.cells) ? value.cells : {};
  return new Map(
    Object.entries(cells).flatMap(([key, offset]): Array<[string, number]> => {
      const [col, row, extra] = key.split(",").map(Number);
      const level = finiteNumber(offset, Number.NaN);
      if (extra !== undefined || !Number.isInteger(col) || !Number.isInteger(row)) return [];
      if (col! < 0 || row! < 0 || !Number.isFinite(level) || level === 0) return [];
      return [[heightKey(col!, row!), clamp(level, -ISO_MAX_COLUMN_LEVELS, ISO_MAX_COLUMN_LEVELS)]];
    }),
  );
}

export type IsoReliefLayers = Readonly<{
  /** Height range over the loop while a wave runs; null for a static relief. */
  range: Readonly<{ high: IsoHeightMap; low: IsoHeightMap }> | null;
  /** A running wave levels multi-cell pieces itself, so uneven columns do not block placing. */
  animated: boolean;
  edits: IsoHeightMap;
  /** Final column heights shown on the field. */
  heights: IsoHeightMap;
  pattern: IsoHeightMap;
}>;

/** The live pattern, the hand edits over it, and the resulting column heights. */
export function getIsoReliefLayers(state: IsoStateSource): IsoReliefLayers {
  const gridSize = getIsoGridSize(state.values);
  const settings = readIsoReliefSettings(state);
  const pattern = getPatternHeights(settings, gridSize);
  const edits = readIsoReliefEdits(state.values);
  const placements = getIsoActivePlacements(state);
  // A wave crest sweeps every column between the ground and the peak height.
  const range = settings.wave
    ? {
        high: composeReliefHeights(getUniformHeights(settings.max, gridSize), edits, gridSize, placements),
        low: composeReliefHeights(getUniformHeights(0, gridSize), edits, gridSize, placements),
      }
    : null;
  return {
    animated: settings.wave !== null,
    edits,
    heights: composeReliefHeights(pattern, edits, gridSize, placements),
    pattern,
    range,
  };
}

function readOption<T extends string>(value: unknown, options: readonly T[], fallback: T): T {
  return options.includes(value as T) ? (value as T) : fallback;
}

/** Whether the wave is on for a pattern it can move (Flat has nothing to animate). */
export function isIsoWaveActive(values: IsoStateSource["values"]): boolean {
  return values[ISO_TARGETS.reliefWave] === true && readOption(values[ISO_TARGETS.reliefPattern], ISO_RELIEF_PATTERNS, ISO_DEFAULTS.reliefPattern) !== "flat";
}

function pickHeights(layers: IsoReliefLayers): Pick<IsoSceneInput, "heightRange" | "heights"> {
  return { heightRange: layers.range, heights: layers.heights };
}

/** Loop progress of the playback clock in [0, 1). */
export function getIsoLoopProgress(state: IsoStateSource): number {
  return state.timeline ? getToolcraftTimelineLoopProgress(state.timeline) : 0;
}

/** The same state pinned to a loop progress, as an exported video frame sees it. */
export function withIsoLoopProgress<State extends IsoStateSource>(state: State, progress: number): State {
  return { ...state, timeline: { currentTimeSeconds: progress, durationSeconds: 1 } };
}

export function readIsoReliefSettings(state: IsoStateSource): IsoReliefSettings {
  const { values } = state;
  return {
    corner: readOption(values[ISO_TARGETS.reliefCorner], ISO_RELIEF_CORNERS, ISO_DEFAULTS.reliefCorner),
    edge: readOption(values[ISO_TARGETS.reliefEdge], ISO_RELIEF_EDGES, ISO_DEFAULTS.reliefEdge),
    max: clamp(Math.round(finiteNumber(values[ISO_TARGETS.reliefMax], ISO_DEFAULTS.reliefMax)), 0, 8),
    pattern: readOption(values[ISO_TARGETS.reliefPattern], ISO_RELIEF_PATTERNS, ISO_DEFAULTS.reliefPattern),
    step: clamp(Math.round(finiteNumber(values[ISO_TARGETS.reliefStep], ISO_DEFAULTS.reliefStep)), 1, 4),
    wave: isIsoWaveActive(values)
      ? {
          direction: readOption(
            values[ISO_TARGETS.reliefWaveDirection],
            ISO_WAVE_DIRECTIONS,
            ISO_DEFAULTS.reliefWaveDirection,
          ),
          easing: readOption(values[ISO_TARGETS.reliefWaveEasing], ISO_WAVE_EASINGS, ISO_DEFAULTS.reliefWaveEasing),
          length: clamp(
            Math.round(finiteNumber(values[ISO_TARGETS.reliefWaveLength], ISO_DEFAULTS.reliefWaveLength)),
            ISO_WAVE_LENGTH_RANGE.min,
            ISO_WAVE_LENGTH_RANGE.max,
          ),
          progress: getIsoLoopProgress(state),
        }
      : null,
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
  const levelPercent = clamp(
    finiteNumber(values[ISO_TARGETS.levelHeight], ISO_DEFAULTS.levelHeight),
    ISO_LEVEL_HEIGHT_RANGE.min,
    ISO_LEVEL_HEIGHT_RANGE.max,
  );
  const objects: Record<string, IsoObjectRecord> = {};
  for (const object of getIsoLibraryObjects(state)) objects[object.id] = object.record;
  return {
    cellSize,
    crop: readCropMode(values[ISO_TARGETS.crop]),
    gridSize: getIsoGridSize(values),
    ...pickHeights(getIsoReliefLayers(state)),
    hideHiddenLines: ISO_SOLID_COLUMNS,
    includeGrid: values[ISO_TARGETS.includeGrid] === true,
    levelHeight: (cellSize * levelPercent) / 100,
    objects,
    padding: Math.max(0, finiteNumber(values[ISO_TARGETS.padding], ISO_DEFAULTS.padding)),
    placements: readIsoPlacements(values),
    showPieces: values[ISO_TARGETS.showPieces] !== false,
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

export function createIsoReliefEditsCommand(
  edits: IsoHeightMap,
  label: string,
  history: Readonly<{ group?: string; mode: "merge" | "record" }> = { mode: "record" },
): ToolcraftCommand {
  const cells = Object.fromEntries(
    [...edits]
      .filter(([, offset]) => Math.abs(offset) > 1e-3)
      .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0)),
  );
  return {
    history: history.mode,
    ...(history.group ? { historyGroup: history.group } : {}),
    label,
    target: ISO_TARGETS.reliefEdits,
    type: "controls.setValue",
    value: { cells },
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
