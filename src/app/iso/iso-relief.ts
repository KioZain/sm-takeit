import {
  cellRectContains,
  getCellHeight,
  getFootprintSpan,
  getPlacementCells,
  heightKey,
  isSameHeight,
  type IsoCell,
  type IsoCellRect,
  type IsoHeightMap,
  type IsoPlacement,
} from "./iso-geometry";

export const ISO_RELIEF_PATTERNS = [
  "flat",
  "corner-diagonal",
  "corner-rings",
  "edge",
  "pyramid",
  "checker",
  "alternate-rows",
  "alternate-cols",
] as const;
export type IsoReliefPattern = (typeof ISO_RELIEF_PATTERNS)[number];

/** Screen vertex of the field the peak starts from. */
export const ISO_RELIEF_CORNERS = ["top", "right", "bottom", "left"] as const;
export type IsoReliefCorner = (typeof ISO_RELIEF_CORNERS)[number];

/** Screen side of the field the slope starts from. */
export const ISO_RELIEF_EDGES = ["top-left", "top-right", "bottom-right", "bottom-left"] as const;
export type IsoReliefEdge = (typeof ISO_RELIEF_EDGES)[number];

export type IsoReliefSettings = Readonly<{
  corner: IsoReliefCorner;
  edge: IsoReliefEdge;
  /** Peak height in levels. */
  max: number;
  pattern: IsoReliefPattern;
  /** Cells per level of falloff. */
  step: number;
}>;

/** Highest column a hand edit may reach, in levels. */
export const ISO_MAX_COLUMN_LEVELS = 16;

/** Pixels on screen within which a dragged column snaps to a matching height. */
export const ISO_SNAP_DISTANCE_PX = 6;

function cornerCell(corner: IsoReliefCorner, last: number): IsoCell {
  switch (corner) {
    case "right":
      return { col: last, row: 0 };
    case "bottom":
      return { col: last, row: last };
    case "left":
      return { col: 0, row: last };
    default:
      return { col: 0, row: 0 };
  }
}

function edgeDistance(edge: IsoReliefEdge, cell: IsoCell, last: number): number {
  switch (edge) {
    case "top-right":
      return cell.row;
    case "bottom-right":
      return last - cell.col;
    case "bottom-left":
      return last - cell.row;
    default:
      return cell.col;
  }
}

/** Pattern height of one cell in whole levels. */
export function getReliefLevel(settings: IsoReliefSettings, cell: IsoCell, gridSize: number): number {
  const last = gridSize - 1;
  const max = Math.max(0, Math.round(settings.max));
  const falloff = (distance: number) =>
    Math.max(0, max - Math.floor(distance / Math.max(1, Math.round(settings.step))));
  switch (settings.pattern) {
    case "flat":
      return 0;
    case "checker":
      return (cell.col + cell.row) % 2 === 0 ? max : 0;
    case "alternate-rows":
      return cell.row % 2 === 0 ? max : 0;
    case "alternate-cols":
      return cell.col % 2 === 0 ? max : 0;
    case "edge":
      return falloff(edgeDistance(settings.edge, cell, last));
    case "pyramid": {
      const ring = Math.min(cell.col, cell.row, last - cell.col, last - cell.row);
      return falloff(Math.floor(last / 2) - ring);
    }
    case "corner-rings": {
      const peak = cornerCell(settings.corner, last);
      return falloff(Math.max(Math.abs(cell.col - peak.col), Math.abs(cell.row - peak.row)));
    }
    default: {
      const peak = cornerCell(settings.corner, last);
      return falloff(Math.abs(cell.col - peak.col) + Math.abs(cell.row - peak.row));
    }
  }
}

/** All cells of a square grid in row-major order. */
export function getGridCells(gridSize: number): IsoCell[] {
  return Array.from({ length: gridSize * gridSize }, (_, index) => ({
    col: index % gridSize,
    row: Math.floor(index / gridSize),
  }));
}

export function getRectCells(rect: IsoCellRect): IsoCell[] {
  const cols = rect.col1 - rect.col0 + 1;
  const rows = rect.row1 - rect.row0 + 1;
  if (cols <= 0 || rows <= 0) return [];
  return Array.from({ length: cols * rows }, (_, index) => ({
    col: rect.col0 + (index % cols),
    row: rect.row0 + Math.floor(index / cols),
  }));
}

/** Every piece that covers several cells stands on columns raised to its highest cell. */
export function levelFootprints(
  heights: IsoHeightMap,
  placements: readonly IsoPlacement[],
): Map<string, number> {
  return placements
    .filter((placement) => {
      const { cols, rows } = getFootprintSpan(placement.footprint);
      return cols * rows > 1;
    })
    .reduce((current, placement) => {
      const cells = getPlacementCells(placement);
      const highest = Math.max(...cells.map((cell) => getCellHeight(current, cell.col, cell.row)));
      return new Map([
        ...current,
        ...cells.map((cell): [string, number] => [heightKey(cell.col, cell.row), highest]),
      ]);
    }, new Map(heights));
}

/** Live pattern levels for every cell of the field. */
export function getPatternHeights(settings: IsoReliefSettings, gridSize: number): Map<string, number> {
  return new Map(
    getGridCells(gridSize).map((cell): [string, number] => [
      heightKey(cell.col, cell.row),
      getReliefLevel(settings, cell, gridSize),
    ]),
  );
}

/**
 * Final column heights: the live pattern plus hand edits, kept between the
 * ground and the level cap, with multi-cell pieces standing on level columns.
 */
export function composeReliefHeights(
  pattern: IsoHeightMap,
  edits: IsoHeightMap,
  gridSize: number,
  placements: readonly IsoPlacement[],
): Map<string, number> {
  const composed = getGridCells(gridSize)
    .map((cell): [string, number] => {
      const level = getCellHeight(pattern, cell.col, cell.row) + getCellHeight(edits, cell.col, cell.row);
      return [heightKey(cell.col, cell.row), Math.min(ISO_MAX_COLUMN_LEVELS, Math.max(0, level))];
    })
    .filter(([, level]) => level > 0);
  return levelFootprints(new Map(composed), placements);
}

/** Hand edits that make the changed cells reach their final heights over the pattern. */
export function toReliefEdits(
  edits: IsoHeightMap,
  pattern: IsoHeightMap,
  finals: IsoHeightMap,
  changed: readonly IsoCell[],
): Map<string, number> {
  const updates = changed.map((cell): [string, number] => {
    const key = heightKey(cell.col, cell.row);
    const offset = getCellHeight(finals, cell.col, cell.row) - getCellHeight(pattern, cell.col, cell.row);
    return [key, Math.round(offset * 1000) / 1000];
  });
  return new Map([...edits, ...updates].filter(([, offset]) => Math.abs(offset) > 1e-3));
}

/** Removes hand edits inside the rectangle, or all of them (including hidden ones). */
export function clearReliefEdits(edits: IsoHeightMap, rect: IsoCellRect | null): Map<string, number> {
  if (!rect) return new Map();
  return new Map(
    [...edits].filter(([key]) => {
      const [col = -1, row = -1] = key.split(",").map(Number);
      return !cellRectContains(rect, col, row);
    }),
  );
}

/** Cells that move together: the pressed cell or selection, grown by pieces that straddle it. */
export function getLinkedCells(
  cells: readonly IsoCell[],
  placements: readonly IsoPlacement[],
): IsoCell[] {
  const keys = new Set(cells.map((cell) => heightKey(cell.col, cell.row)));
  const extra = placements
    .map((placement) => getPlacementCells(placement))
    .filter((covered) => covered.some((cell) => keys.has(heightKey(cell.col, cell.row))))
    .flat()
    .filter((cell) => !keys.has(heightKey(cell.col, cell.row)));
  // Pieces never overlap, so each extra cell appears at most once.
  return [...cells, ...extra];
}

export type IsoHeightDrag = Readonly<{
  /** Cells being moved and their heights when the drag started. */
  cells: readonly Readonly<{ col: number; row: number; start: number }>[];
  /** Height of the pressed column when the drag started. */
  origin: number;
}>;

export type IsoSnapResult = Readonly<{
  /** Cells whose height the pressed column snapped to. */
  guides: readonly IsoCell[];
  heights: Map<string, number>;
  /** Final height of the pressed column. */
  level: number;
}>;

export type IsoSnapOptions = Readonly<{
  gridSize: number;
  /** Snap distance measured in levels. */
  threshold: number;
  mode: "free" | "magnet" | "whole";
}>;

/**
 * Moves the dragged cells by `deltaLevels`. In magnet mode the pressed column
 * snaps to the nearest height of any other column (or the ground) within the
 * threshold, and the columns it matched are returned as guides.
 */
function nearestHeight(candidates: readonly number[], level: number): number {
  return candidates.reduce(
    (best, candidate) => (Math.abs(candidate - level) < Math.abs(best - level) ? candidate : best),
    Number.POSITIVE_INFINITY,
  );
}

type IsoSnapTarget = Readonly<{ guides: readonly IsoCell[]; level: number }>;

/** Magnet target for `level`: the nearest other column height (or the ground) within the threshold. */
function findSnapTarget(
  heights: IsoHeightMap,
  moving: ReadonlySet<string>,
  level: number,
  options: IsoSnapOptions,
): IsoSnapTarget | null {
  const others = getGridCells(options.gridSize)
    .filter((cell) => !moving.has(heightKey(cell.col, cell.row)))
    .map((cell) => ({ cell, height: getCellHeight(heights, cell.col, cell.row) }));
  const nearest = nearestHeight([0, ...others.map((other) => other.height)], level);
  if (Math.abs(nearest - level) > options.threshold) return null;
  // Ground contact needs no guide; only raised matches are highlighted.
  const guides = isSameHeight(nearest, 0)
    ? []
    : others.filter((other) => isSameHeight(other.height, nearest)).map((other) => other.cell);
  return { guides, level: nearest };
}

/**
 * Moves the dragged cells by `deltaLevels`. In magnet mode the pressed column
 * snaps to the nearest height of any other column (or the ground) within the
 * threshold, and the columns it matched are returned as guides.
 */
export function dragColumnHeights(
  heights: IsoHeightMap,
  drag: IsoHeightDrag,
  deltaLevels: number,
  options: IsoSnapOptions,
): IsoSnapResult {
  const minStart = Math.min(...drag.cells.map((cell) => cell.start));
  const maxStart = Math.max(...drag.cells.map((cell) => cell.start));
  const clampDelta = (delta: number) =>
    Math.min(ISO_MAX_COLUMN_LEVELS - maxStart, Math.max(-minStart, delta));
  const free = drag.origin + clampDelta(deltaLevels);
  const whole = drag.origin + clampDelta(Math.round(free) - drag.origin);
  const moving = new Set(drag.cells.map((cell) => heightKey(cell.col, cell.row)));
  const target = options.mode === "magnet" ? findSnapTarget(heights, moving, free, options) : null;
  // A target beyond the allowed range cannot be reached, so the drag stays free.
  const snapped =
    target && isSameHeight(drag.origin + clampDelta(target.level - drag.origin), target.level)
      ? target
      : null;
  const level = snapped ? snapped.level : options.mode === "whole" ? whole : free;
  const delta = level - drag.origin;
  const moved = drag.cells.map((cell): [string, number] => [
    heightKey(cell.col, cell.row),
    Math.round((cell.start + delta) * 1000) / 1000,
  ]);
  return { guides: snapped?.guides ?? [], heights: new Map([...heights, ...moved]), level };
}
