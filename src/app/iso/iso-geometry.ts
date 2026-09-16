export type IsoFootprint = "1x1" | "2x1" | "1x2" | "2x2";

export const ISO_FOOTPRINTS: readonly IsoFootprint[] = ["1x1", "2x1", "1x2", "2x2"];

export type IsoPoint = Readonly<{ x: number; y: number }>;

export type IsoSize = Readonly<{ height: number; width: number }>;

export type IsoRect = Readonly<{
  height: number;
  width: number;
  x: number;
  y: number;
}>;

/** Inclusive cell range. */
export type IsoCellRect = Readonly<{
  col0: number;
  col1: number;
  row0: number;
  row1: number;
}>;

export type IsoCell = Readonly<{ col: number; row: number }>;

/** `col`/`row` address the far corner cell (smallest col + row) of the footprint. */
export type IsoPlacement = Readonly<{
  col: number;
  footprint: IsoFootprint;
  id: string;
  objectId: string;
  row: number;
}>;

export type IsoObjectRecord = Readonly<{
  /** Floor contact point in normalized image coordinates. */
  anchor: IsoPoint;
  footprint: IsoFootprint;
  name: string;
  /** Image width relative to the projected footprint width. */
  scale: number;
  /** Intrinsic image size, captured once the source image decodes. */
  size: IsoSize | null;
}>;

export type IsoCropMode = "content" | "field" | "off";

/** Column heights in levels, keyed by `heightKey(col, row)`; missing cells are 0. */
export type IsoHeightMap = ReadonlyMap<string, number>;

export type IsoSegment = Readonly<{ from: IsoPoint; to: IsoPoint }>;

/** Exposed side face of a raised column; `left` faces +row, `right` faces +col. */
export type IsoColumnFace = Readonly<{ points: readonly IsoPoint[]; side: "left" | "right" }>;

export type IsoSceneInput = Readonly<{
  cellSize: number;
  crop: IsoCropMode;
  gridSize: number;
  heights: IsoHeightMap;
  /** Clip guide lines and faces hidden behind raised columns. */
  hideHiddenLines: boolean;
  includeGrid: boolean;
  /** Screen height of one column level in px. */
  levelHeight: number;
  objects: Readonly<Record<string, IsoObjectRecord>>;
  padding: number;
  placements: readonly IsoPlacement[];
  /** When false, pieces stay editable but are neither drawn nor exported. */
  showPieces: boolean;
}>;

export type IsoSceneItem = Readonly<{
  /** Footprint outline lifted to the top of its columns. */
  diamond: readonly IsoPoint[];
  /** Column height under the piece, in px. */
  elevation: number;
  imageRect: IsoRect | null;
  placement: IsoPlacement;
  record: IsoObjectRecord;
}>;

export type IsoSceneModel = Readonly<{
  /** Crop/scene frame in field-local coordinates, integer sized. */
  frame: IsoRect;
  /** Bounds of the grid guide, including raised columns. */
  field: IsoRect;
  /** Dashed grid and column guide segments; never part of the set itself. */
  guide: readonly IsoSegment[];
  /** Translucent side faces of raised columns, drawn with the guide. */
  guideFaces: readonly IsoColumnFace[];
  /** Items in back-to-front drawing order. */
  items: readonly IsoSceneItem[];
  /** Whether piece images are drawn and count toward the content frame. */
  piecesVisible: boolean;
  /** Field-local point placed at the world origin. */
  center: IsoPoint;
  /** Frame translated to world coordinates (centered on the origin). */
  worldFrame: IsoRect;
}>;

const HEIGHT_TOLERANCE = 1e-3;

export function heightKey(col: number, row: number): string {
  return `${col},${row}`;
}

export function getCellHeight(heights: IsoHeightMap, col: number, row: number): number {
  return heights.get(heightKey(col, row)) ?? 0;
}

export function isSameHeight(left: number, right: number): boolean {
  return Math.abs(left - right) < HEIGHT_TOLERANCE;
}

export function getFootprintSpan(footprint: IsoFootprint): Readonly<{
  cols: number;
  rows: number;
}> {
  switch (footprint) {
    case "2x1":
      return { cols: 2, rows: 1 };
    case "1x2":
      return { cols: 1, rows: 2 };
    case "2x2":
      return { cols: 2, rows: 2 };
    default:
      return { cols: 1, rows: 1 };
  }
}

export function projectIso(col: number, row: number, cellSize: number): IsoPoint {
  return {
    x: ((col - row) * cellSize) / 2,
    y: ((col + row) * cellSize) / 4,
  };
}

export function unprojectIso(point: IsoPoint, cellSize: number): IsoPoint {
  return {
    x: point.x / cellSize + (2 * point.y) / cellSize,
    y: (2 * point.y) / cellSize - point.x / cellSize,
  };
}

export function getCellAtPoint(
  point: IsoPoint,
  gridSize: number,
  cellSize: number,
): IsoCell | null {
  const grid = unprojectIso(point, cellSize);
  const col = Math.floor(grid.x);
  const row = Math.floor(grid.y);
  return col >= 0 && row >= 0 && col < gridSize && row < gridSize
    ? { col, row }
    : null;
}

export function getFieldBounds(gridSize: number, cellSize: number): IsoRect {
  return {
    height: (gridSize * cellSize) / 2,
    width: gridSize * cellSize,
    x: (-gridSize * cellSize) / 2,
    y: 0,
  };
}

export function getFootprintDiamond(
  col: number,
  row: number,
  footprint: IsoFootprint,
  cellSize: number,
): IsoPoint[] {
  const { cols, rows } = getFootprintSpan(footprint);
  return [
    projectIso(col, row, cellSize),
    projectIso(col + cols, row, cellSize),
    projectIso(col + cols, row + rows, cellSize),
    projectIso(col, row + rows, cellSize),
  ];
}

export function getFootprintFloorCenter(
  col: number,
  row: number,
  footprint: IsoFootprint,
  cellSize: number,
): IsoPoint {
  const { cols, rows } = getFootprintSpan(footprint);
  return projectIso(col + cols / 2, row + rows / 2, cellSize);
}

export function getPlacementImageRect(
  placement: IsoPlacement,
  record: IsoObjectRecord,
  cellSize: number,
  elevation = 0,
): IsoRect | null {
  if (!record.size || record.size.width <= 0 || record.size.height <= 0) {
    return null;
  }
  const { cols, rows } = getFootprintSpan(placement.footprint);
  const width = ((cols + rows) * cellSize * record.scale) / 2;
  const height = (width * record.size.height) / record.size.width;
  const anchor = getFootprintFloorCenter(
    placement.col,
    placement.row,
    placement.footprint,
    cellSize,
  );
  return {
    height,
    width,
    x: anchor.x - record.anchor.x * width,
    y: anchor.y - elevation - record.anchor.y * height,
  };
}

export function getPlacementCells(placement: Pick<IsoPlacement, "col" | "footprint" | "row">): IsoCell[] {
  const { cols, rows } = getFootprintSpan(placement.footprint);
  const cells: IsoCell[] = [];
  for (let rowOffset = 0; rowOffset < rows; rowOffset += 1) {
    for (let colOffset = 0; colOffset < cols; colOffset += 1) {
      cells.push({ col: placement.col + colOffset, row: placement.row + rowOffset });
    }
  }
  return cells;
}

/** Heights of the footprint's cells, in levels. */
export function getFootprintHeights(
  placement: Pick<IsoPlacement, "col" | "footprint" | "row">,
  heights: IsoHeightMap,
): number[] {
  return getPlacementCells(placement).map((cell) => getCellHeight(heights, cell.col, cell.row));
}

function cellKey(col: number, row: number): string {
  return `${col}:${row}`;
}

export function footprintFitsGrid(
  col: number,
  row: number,
  footprint: IsoFootprint,
  gridSize: number,
): boolean {
  const { cols, rows } = getFootprintSpan(footprint);
  return col >= 0 && row >= 0 && col + cols <= gridSize && row + rows <= gridSize;
}

export function createPlacementId(objectId: string, col: number, row: number): string {
  return `${objectId}@${col},${row}`;
}

/**
 * Keeps placements whose object exists and whose footprint fits the grid; a
 * later placement overlapping an earlier one is dropped.
 */
export function filterRenderablePlacements(
  placements: readonly IsoPlacement[],
  objectIds: ReadonlySet<string>,
  gridSize: number,
): IsoPlacement[] {
  type Accepted = Readonly<{ occupied: ReadonlySet<string>; result: readonly IsoPlacement[] }>;
  const initial: Accepted = { occupied: new Set<string>(), result: [] };
  return [
    ...placements
      .filter(
        (placement) =>
          objectIds.has(placement.objectId) &&
          footprintFitsGrid(placement.col, placement.row, placement.footprint, gridSize),
      )
      .reduce((accepted: Accepted, placement): Accepted => {
        const keys = getPlacementCells(placement).map((cell) => cellKey(cell.col, cell.row));
        return keys.some((key) => accepted.occupied.has(key))
          ? accepted
          : {
              occupied: new Set([...accepted.occupied, ...keys]),
              result: [...accepted.result, placement],
            };
      }, initial).result,
  ];
}

export type IsoPlacementCheck =
  | Readonly<{ ok: true }>
  | Readonly<{ ok: false; reason: "occupied" | "outside" | "uneven" }>;

export function checkPlacement(
  placements: readonly IsoPlacement[],
  col: number,
  row: number,
  footprint: IsoFootprint,
  gridSize: number,
  heights: IsoHeightMap = new Map(),
): IsoPlacementCheck {
  if (!footprintFitsGrid(col, row, footprint, gridSize)) {
    return { ok: false, reason: "outside" };
  }
  const [first = 0, ...rest] = getFootprintHeights({ col, footprint, row }, heights);
  if (rest.some((height) => !isSameHeight(height, first))) {
    return { ok: false, reason: "uneven" };
  }
  const occupied = new Set(
    placements.flatMap((placement) =>
      getPlacementCells(placement).map((cell) => cellKey(cell.col, cell.row)),
    ),
  );
  const blocked = getPlacementCells({ col, footprint, row }).some((cell) =>
    occupied.has(cellKey(cell.col, cell.row)),
  );
  return blocked ? { ok: false, reason: "occupied" } : { ok: true };
}

export function placeObject(
  placements: readonly IsoPlacement[],
  objectId: string,
  col: number,
  row: number,
  footprint: IsoFootprint,
  gridSize: number,
  heights?: IsoHeightMap,
): IsoPlacement[] | null {
  if (!checkPlacement(placements, col, row, footprint, gridSize, heights).ok) return null;
  return [
    ...placements,
    { col, footprint, id: createPlacementId(objectId, col, row), objectId, row },
  ];
}

export function normalizeCellRect(from: IsoCell, to: IsoCell): IsoCellRect {
  return {
    col0: Math.min(from.col, to.col),
    col1: Math.max(from.col, to.col),
    row0: Math.min(from.row, to.row),
    row1: Math.max(from.row, to.row),
  };
}

export function clampCellRect(rect: IsoCellRect, gridSize: number): IsoCellRect | null {
  const clamped = {
    col0: Math.max(0, rect.col0),
    col1: Math.min(gridSize - 1, rect.col1),
    row0: Math.max(0, rect.row0),
    row1: Math.min(gridSize - 1, rect.row1),
  };
  return clamped.col0 <= clamped.col1 && clamped.row0 <= clamped.row1 ? clamped : null;
}

export function cellRectContains(rect: IsoCellRect, col: number, row: number): boolean {
  return col >= rect.col0 && col <= rect.col1 && row >= rect.row0 && row <= rect.row1;
}

/**
 * Tiles the rectangle with the footprint in row-major order from the far
 * corner. Cells where the footprint would overlap, stand on uneven columns, or
 * leave the rectangle stay empty.
 */
export function fillCellRect(
  placements: readonly IsoPlacement[],
  rect: IsoCellRect,
  objectId: string,
  footprint: IsoFootprint,
  gridSize: number,
  heights?: IsoHeightMap,
): IsoPlacement[] {
  const bounded = clampCellRect(rect, gridSize);
  if (!bounded) return [...placements];
  const { cols, rows } = getFootprintSpan(footprint);
  let next = [...placements];
  for (let row = bounded.row0; row + rows - 1 <= bounded.row1; row += 1) {
    for (let col = bounded.col0; col + cols - 1 <= bounded.col1; col += 1) {
      next = placeObject(next, objectId, col, row, footprint, gridSize, heights) ?? next;
    }
  }
  return next;
}

function placementIntersectsRect(placement: IsoPlacement, rect: IsoCellRect): boolean {
  const { cols, rows } = getFootprintSpan(placement.footprint);
  return (
    placement.col <= rect.col1 &&
    placement.col + cols - 1 >= rect.col0 &&
    placement.row <= rect.row1 &&
    placement.row + rows - 1 >= rect.row0
  );
}

export function eraseCellRect(
  placements: readonly IsoPlacement[],
  rect: IsoCellRect,
): IsoPlacement[] {
  return placements.filter((placement) => !placementIntersectsRect(placement, rect));
}

export function findPlacementAtCell(
  placements: readonly IsoPlacement[],
  col: number,
  row: number,
): IsoPlacement | null {
  return (
    placements.find((placement) =>
      placementIntersectsRect(placement, { col0: col, col1: col, row0: row, row1: row }),
    ) ?? null
  );
}

function spansOverlap(start0: number, length0: number, start1: number, length1: number): boolean {
  return start0 < start1 + length1 && start1 < start0 + length0;
}

/** True when `back` must be painted before `front` to overlap correctly. */
function isBehind(back: IsoPlacement, front: IsoPlacement): boolean {
  const b = getFootprintSpan(back.footprint);
  const f = getFootprintSpan(front.footprint);
  return (
    (back.col + b.cols <= front.col && spansOverlap(back.row, b.rows, front.row, f.rows)) ||
    (back.row + b.rows <= front.row && spansOverlap(back.col, b.cols, front.col, f.cols))
  );
}

function compareDrawKey(left: IsoPlacement, right: IsoPlacement): number {
  return (
    left.col + left.row - (right.col + right.row) ||
    left.col - right.col ||
    (left.id < right.id ? -1 : left.id > right.id ? 1 : 0)
  );
}

/**
 * Back-to-front order: far-corner (col + row) then col, corrected so any
 * placement lying directly behind a multi-cell neighbour is drawn first.
 */
export function sortPlacementsForDrawing(placements: readonly IsoPlacement[]): IsoPlacement[] {
  const remaining = [...placements].sort(compareDrawKey);
  const ordered: IsoPlacement[] = [];
  while (remaining.length > 0) {
    const index = remaining.findIndex(
      (candidate) => !remaining.some((other) => other !== candidate && isBehind(other, candidate)),
    );
    const [next] = remaining.splice(index === -1 ? 0 : index, 1);
    ordered.push(next!);
  }
  return ordered;
}

export function getPointsBounds(points: readonly IsoPoint[]): IsoRect {
  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return { height: Math.max(...ys) - y, width: Math.max(...xs) - x, x, y };
}

export function expandRect(rect: IsoRect, amount: number): IsoRect {
  return {
    height: rect.height + amount * 2,
    width: rect.width + amount * 2,
    x: rect.x - amount,
    y: rect.y - amount,
  };
}

export function unionRects(rects: readonly (IsoRect | null)[]): IsoRect | null {
  const present = rects.filter((rect): rect is IsoRect => rect !== null);
  if (present.length === 0) return null;
  const x = Math.min(...present.map((rect) => rect.x));
  const y = Math.min(...present.map((rect) => rect.y));
  const right = Math.max(...present.map((rect) => rect.x + rect.width));
  const bottom = Math.max(...present.map((rect) => rect.y + rect.height));
  return { height: bottom - y, width: right - x, x, y };
}

export function toIntegerFrame(rect: IsoRect): IsoRect {
  const width = Math.max(1, Math.ceil(rect.width - 1e-6));
  const height = Math.max(1, Math.ceil(rect.height - 1e-6));
  return {
    height,
    width,
    x: rect.x - (width - rect.width) / 2,
    y: rect.y - (height - rect.height) / 2,
  };
}
