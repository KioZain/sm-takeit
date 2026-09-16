import {
  getCellHeight,
  getFootprintSpan,
  isSameHeight,
  projectIso,
  type IsoCell,
  type IsoColumnFace,
  type IsoFootprint,
  type IsoHeightMap,
  type IsoPoint,
  type IsoSegment,
} from "./iso-geometry";
import { clipPolygon, clipSegment } from "./iso-occlusion";

/** Field geometry needed to place raised columns on screen. */
export type IsoColumnSpace = Readonly<{
  cellSize: number;
  gridSize: number;
  heights: IsoHeightMap;
  /** Screen height of one level in px. */
  levelHeight: number;
}>;

function lifted(col: number, row: number, levels: number, space: IsoColumnSpace): IsoPoint {
  const point = projectIso(col, row, space.cellSize);
  return { x: point.x, y: point.y - levels * space.levelHeight };
}

/** Height of a cell, or 0 outside the grid (the ground). */
function heightOrGround(space: IsoColumnSpace, col: number, row: number): number {
  return col >= 0 && row >= 0 && col < space.gridSize && row < space.gridSize
    ? getCellHeight(space.heights, col, row)
    : 0;
}

/** Top outline of a footprint standing on columns of height `levels`. */
export function getRaisedFootprintDiamond(
  col: number,
  row: number,
  footprint: IsoFootprint,
  levels: number,
  space: IsoColumnSpace,
): IsoPoint[] {
  const { cols, rows } = getFootprintSpan(footprint);
  return [
    lifted(col, row, levels, space),
    lifted(col + cols, row, levels, space),
    lifted(col + cols, row + rows, levels, space),
    lifted(col, row + rows, levels, space),
  ];
}

/** Screen outline of one column, from its top down to the ground. */
export function getColumnSilhouette(col: number, row: number, space: IsoColumnSpace): IsoPoint[] {
  const levels = getCellHeight(space.heights, col, row);
  return [
    lifted(col, row, levels, space),
    lifted(col + 1, row, levels, space),
    lifted(col + 1, row, 0, space),
    lifted(col + 1, row + 1, 0, space),
    lifted(col, row + 1, 0, space),
    lifted(col, row + 1, levels, space),
  ];
}

function polygonContains(polygon: readonly IsoPoint[], point: IsoPoint): boolean {
  let inside = false;
  for (let index = 0, previous = polygon.length - 1; index < polygon.length; previous = index++) {
    const a = polygon[index]!;
    const b = polygon[previous]!;
    if (a.y > point.y !== b.y > point.y && point.x < ((b.x - a.x) * (point.y - a.y)) / (b.y - a.y) + a.x) {
      inside = !inside;
    }
  }
  return inside;
}

/** Cells ordered nearest first, so raised front columns win hit tests. */
function cellsFrontToBack(gridSize: number): IsoCell[] {
  return Array.from({ length: gridSize * gridSize }, (_, index) => ({
    col: index % gridSize,
    row: Math.floor(index / gridSize),
  })).sort((left, right) => right.col + right.row - (left.col + left.row));
}

/** The visible column under a field-local point, or null. */
export function getColumnAtPoint(point: IsoPoint, space: IsoColumnSpace): IsoCell | null {
  return (
    cellsFrontToBack(space.gridSize).find((cell) =>
      polygonContains(getColumnSilhouette(cell.col, cell.row, space), point),
    ) ?? null
  );
}

/** The column under the point, or the nearest grid cell when the point is off the field. */
export function getNearestColumn(point: IsoPoint, space: IsoColumnSpace): IsoCell {
  const hit = getColumnAtPoint(point, space);
  if (hit) return hit;
  const x = point.x / space.cellSize;
  const y = (2 * point.y) / space.cellSize;
  const clamp = (value: number) => Math.min(space.gridSize - 1, Math.max(0, Math.floor(value)));
  return { col: clamp(x + y), row: clamp(y - x) };
}

/** Vertical edge at grid vertex (col, row); `owner` is the column it belongs to. */
type VerticalSpan = Readonly<{ bottom: number; col: number; owner: IsoCell; row: number; top: number }>;

function isInFront(cell: IsoCell, other: IsoCell): boolean {
  return cell.col + cell.row > other.col + other.row;
}

/** Merges overlapping vertical spans at the same grid vertex so dashes stay aligned. */
function mergeVerticalSpans(spans: readonly VerticalSpan[]): VerticalSpan[] {
  const vertices = [...new Set(spans.map((span) => `${span.col},${span.row}`))];
  return vertices.flatMap((vertex) =>
    spans
      .filter((span) => `${span.col},${span.row}` === vertex)
      .sort((left, right) => left.bottom - right.bottom)
      .reduce<VerticalSpan[]>((merged, span) => {
        const last = merged.at(-1);
        return last && span.bottom <= last.top + 1e-6
          ? [
              ...merged.slice(0, -1),
              {
                ...last,
                // The frontmost contributor decides which columns can hide the merged edge.
                owner: isInFront(span.owner, last.owner) ? span.owner : last.owner,
                top: Math.max(last.top, span.top),
              },
            ]
          : [...merged, span];
      }, []),
  );
}

/** Edge between grid vertices (c0, r0) and (c1, r1) at a height in levels. */
type EdgeSpec = readonly [c0: number, r0: number, c1: number, r1: number, levels: number];

/** Exposed face along the vertices (c0, r0)–(c1, r1) between two heights. */
type FaceSpec = readonly [side: IsoColumnFace["side"], c0: number, r0: number, c1: number, r1: number, bottom: number, top: number];

type CellGuide = Readonly<{
  cell: IsoCell;
  edges: readonly EdgeSpec[];
  faces: readonly FaceSpec[];
  verticals: readonly VerticalSpan[];
}>;

/** Top edges and front faces owned by one cell. */
function getCellGuide(space: IsoColumnSpace, cell: IsoCell): CellGuide {
  const { col, row } = cell;
  const top = getCellHeight(space.heights, col, row);
  const nearCol = heightOrGround(space, col + 1, row);
  const nearRow = heightOrGround(space, col, row + 1);
  const colIsBoundary = col + 1 >= space.gridSize;
  const rowIsBoundary = row + 1 >= space.gridSize;
  const colDiffers = !isSameHeight(nearCol, top);
  const rowDiffers = !isSameHeight(nearRow, top);
  const colFace = colDiffers && nearCol < top;
  const rowFace = rowDiffers && nearRow < top;
  const colEdge: EdgeSpec = [col + 1, row, col + 1, row + 1, top];
  const rowEdge: EdgeSpec = [col, row + 1, col + 1, row + 1, top];
  const edges: EdgeSpec[] = [
    // Far edges always belong to this cell's top.
    [col, row, col + 1, row, top],
    [col, row, col, row + 1, top],
    // Near edges are drawn by the neighbour's far edge when heights match.
    ...(colIsBoundary || colDiffers ? [colEdge] : []),
    ...(rowIsBoundary || rowDiffers ? [rowEdge] : []),
    // Faces on the field boundary also need their ground edge.
    ...(colFace && colIsBoundary ? [[col + 1, row, col + 1, row + 1, 0] as const] : []),
    ...(rowFace && rowIsBoundary ? [[col, row + 1, col + 1, row + 1, 0] as const] : []),
  ];
  const verticals: VerticalSpan[] = [
    ...(colFace
      ? [
          { bottom: nearCol, col: col + 1, owner: cell, row, top },
          { bottom: nearCol, col: col + 1, owner: cell, row: row + 1, top },
        ]
      : []),
    ...(rowFace
      ? [
          { bottom: nearRow, col, owner: cell, row: row + 1, top },
          { bottom: nearRow, col: col + 1, owner: cell, row: row + 1, top },
        ]
      : []),
  ];
  const faces: FaceSpec[] = [
    ...(rowFace ? [["left", col, row + 1, col + 1, row + 1, nearRow, top] as const] : []),
    ...(colFace ? [["right", col + 1, row, col + 1, row + 1, nearCol, top] as const] : []),
  ];
  return { cell, edges, faces, verticals };
}

/**
 * Dashed guide for the raised field: every column's top outline plus the
 * front faces that drop to a lower neighbour or to the ground. With all
 * heights at 0 this is exactly the flat rhombus grid.
 */
function getCellGuides(space: IsoColumnSpace): CellGuide[] {
  return Array.from({ length: space.gridSize * space.gridSize }, (_, index) =>
    getCellGuide(space, { col: index % space.gridSize, row: Math.floor(index / space.gridSize) }),
  );
}

export type IsoColumnGuide = Readonly<{ faces: IsoColumnFace[]; segments: IsoSegment[] }>;

/**
 * Silhouettes of raised columns standing in front of `cell`. Only columns on
 * the same or a neighbouring screen column can overlap it.
 */
function getOccluders(space: IsoColumnSpace, cell: IsoCell): IsoPoint[][] {
  const diagonal = cell.col - cell.row;
  return Array.from({ length: space.gridSize * space.gridSize }, (_, index) => ({
    col: index % space.gridSize,
    row: Math.floor(index / space.gridSize),
  }))
    .filter(
      (other) =>
        isInFront(other, cell) &&
        Math.abs(other.col - other.row - diagonal) <= 1 &&
        getCellHeight(space.heights, other.col, other.row) > 0,
    )
    .map((other) => getColumnSilhouette(other.col, other.row, space));
}

/**
 * Dashed guide segments and translucent side faces. With `hideHidden`, every
 * line and face is clipped by the raised columns in front of it, leaving only
 * what a solid model would show.
 */
export function getColumnGuide(space: IsoColumnSpace, hideHidden: boolean): IsoColumnGuide {
  const cells = getCellGuides(space);
  const occludersOf = (cell: IsoCell) => (hideHidden ? getOccluders(space, cell) : []);
  const edges = cells.flatMap((guide) => {
    const occluders = occludersOf(guide.cell);
    return guide.edges.flatMap(([c0, r0, c1, r1, levels]) =>
      clipSegment({ from: lifted(c0, r0, levels, space), to: lifted(c1, r1, levels, space) }, occluders),
    );
  });
  const verticals = mergeVerticalSpans(cells.flatMap((guide) => guide.verticals)).flatMap((span) =>
    clipSegment(
      {
        from: lifted(span.col, span.row, span.bottom, space),
        to: lifted(span.col, span.row, span.top, space),
      },
      occludersOf(span.owner),
    ),
  );
  const faces = cells.flatMap((guide) => {
    const occluders = occludersOf(guide.cell);
    return guide.faces.flatMap(([side, c0, r0, c1, r1, bottom, top]) =>
      clipPolygon(
        [
          lifted(c0, r0, top, space),
          lifted(c1, r1, top, space),
          lifted(c1, r1, bottom, space),
          lifted(c0, r0, bottom, space),
        ],
        occluders,
      ).map((points): IsoColumnFace => ({ points, side })),
    );
  });
  return { faces, segments: [...edges, ...verticals] };
}

/** Side faces of raised columns that are open to a lower neighbour or the ground. */
export function getColumnGuideFaces(space: IsoColumnSpace): IsoColumnFace[] {
  return getColumnGuide(space, false).faces;
}

export function getColumnGuideSegments(space: IsoColumnSpace): IsoSegment[] {
  return getColumnGuide(space, false).segments;
}
