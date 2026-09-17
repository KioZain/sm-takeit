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
  type IsoHeightMap,
  type IsoPlacement,
  type IsoRect,
  type IsoSceneInput,
  type IsoSceneItem,
  type IsoSceneModel,
} from "./iso-geometry";

const GRID_STROKE_MARGIN = 2;

/** Ground field stretched up to the highest column top of `heights`. */
function getRaisedFieldBounds(input: IsoSceneInput, heights: IsoHeightMap): IsoRect {
  const ground = getFieldBounds(input.gridSize, input.cellSize);
  const tops = [...heights].map(([key, level]) => {
    const [col = 0, row = 0] = key.split(",").map(Number);
    return ((col + row) * input.cellSize) / 4 - level * input.levelHeight;
  });
  const top = Math.min(ground.y, ...tops);
  return { ...ground, height: ground.y + ground.height - top, y: top };
}

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
  const range = input.heightRange;
  const frameField = range ? (unionRects([field, getRaisedFieldBounds(input, range.high)]) ?? field) : field;
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
  const elevationIn = (heights: IsoHeightMap, placement: IsoPlacement) =>
    Math.max(0, ...getFootprintHeights(placement, heights)) * input.levelHeight;
  // While animating, each piece counts at its lowest and highest elevation of the loop.
  const pieceRects = items.flatMap((item) =>
    range
      ? [
          getPlacementImageRect(item.placement, item.record, input.cellSize, elevationIn(range.low, item.placement)),
          getPlacementImageRect(item.placement, item.record, input.cellSize, elevationIn(range.high, item.placement)),
        ]
      : [item.imageRect ?? getPointsBounds(item.diamond)],
  );
  const content = input.showPieces ? unionRects(pieceRects) : null;
  const padding = Math.max(0, input.padding);
  const rawFrame =
    input.crop === "content"
      ? expandRect(unionRects([content ?? frameField, input.includeGrid ? frameField : null])!, padding)
      : input.crop === "field"
        ? expandRect(unionRects([frameField, content])!, padding)
        : expandRect(unionRects([frameField, content])!, GRID_STROKE_MARGIN);
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
