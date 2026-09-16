import {
  getColumnGuide,
  getRaisedFootprintDiamond,
  type IsoColumnSpace,
} from "./iso-columns";
import {
  expandRect,
  filterRenderablePlacements,
  getFieldBounds,
  getFootprintHeights,
  getPlacementImageRect,
  getPointsBounds,
  sortPlacementsForDrawing,
  toIntegerFrame,
  unionRects,
  type IsoSceneInput,
  type IsoSceneItem,
  type IsoSceneModel,
} from "./iso-geometry";

const GRID_STROKE_MARGIN = 2;

export function getIsoColumnSpace(input: IsoSceneInput): IsoColumnSpace {
  return {
    cellSize: input.cellSize,
    gridSize: input.gridSize,
    heights: input.heights,
    levelHeight: input.levelHeight,
  };
}

/**
 * Pure scene layout: pieces stand on top of their columns (a piece on uneven
 * columns, left over from later height edits, stands on the highest one).
 */
export function buildIsoSceneModel(input: IsoSceneInput): IsoSceneModel {
  const space = getIsoColumnSpace(input);
  const { faces: guideFaces, segments: guide } = getColumnGuide(space, input.hideHiddenLines);
  const field =
    unionRects([
      getFieldBounds(input.gridSize, input.cellSize),
      getPointsBounds(guide.flatMap((segment) => [segment.from, segment.to])),
    ]) ?? getFieldBounds(input.gridSize, input.cellSize);
  const renderable = filterRenderablePlacements(
    input.placements,
    new Set(Object.keys(input.objects)),
    input.gridSize,
  );
  const items = sortPlacementsForDrawing(renderable).map((placement): IsoSceneItem => {
    const record = input.objects[placement.objectId]!;
    const levels = Math.max(0, ...getFootprintHeights(placement, input.heights));
    const elevation = levels * input.levelHeight;
    return {
      diamond: getRaisedFootprintDiamond(
        placement.col,
        placement.row,
        placement.footprint,
        levels,
        space,
      ),
      elevation,
      imageRect: getPlacementImageRect(placement, record, input.cellSize, elevation),
      placement,
      record,
    };
  });
  const content = input.showPieces
    ? unionRects(items.map((item) => item.imageRect ?? getPointsBounds(item.diamond)))
    : null;
  const padding = Math.max(0, input.padding);
  const rawFrame =
    input.crop === "content"
      ? expandRect(unionRects([content ?? field, input.includeGrid ? field : null])!, padding)
      : input.crop === "field"
        ? expandRect(unionRects([field, content])!, padding)
        : expandRect(unionRects([field, content])!, GRID_STROKE_MARGIN);
  const frame = toIntegerFrame(rawFrame);
  const center = { x: frame.x + frame.width / 2, y: frame.y + frame.height / 2 };
  return {
    center,
    field,
    frame,
    guide,
    guideFaces,
    items,
    piecesVisible: input.showPieces,
    worldFrame: {
      height: frame.height,
      width: frame.width,
      x: frame.x - center.x,
      y: frame.y - center.y,
    },
  };
}
