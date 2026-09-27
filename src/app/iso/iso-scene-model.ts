import {
  getColumnGuide,
  getRaisedFootprintDiamond,
  type IsoColumnSpace,
} from "./iso-columns";
import {
  expandRect,
  filterRenderablePlacements,
  getCellHeight,
  getFieldBounds,
  getFloorCells,
  getFootprintHeights,
  getPlacementImageRect,
  getPointsBounds,
  projectIso,
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
import {
  getIsoFloors,
  getIsoStack,
  liftFace,
  liftPoint,
  liftRect,
  liftSegment,
  type IsoStack,
} from "./iso-stack";

const GRID_STROKE_MARGIN = 2;

/** Column space of one floor; a classic field only ever asks for floor 0. */
export function getIsoColumnSpace(input: IsoSceneInput, floor = 0): IsoColumnSpace {
  return {
    cellSize: input.cellSize,
    floor,
    gridSize: input.gridSize,
    heights: input.heights,
    levelHeight: input.levelHeight,
  };
}

export function getIsoSceneStack(input: IsoSceneInput): IsoStack {
  return getIsoStack(input.gridSize, input.cellSize, input.floors);
}

/** One column space per floor, ground first. */
export function getIsoColumnSpaces(input: IsoSceneInput): IsoColumnSpace[] {
  return getIsoFloors(getIsoSceneStack(input)).map((floor) => getIsoColumnSpace(input, floor));
}

/** Ground field of one floor, stretched up to its highest column top. */
function getRaisedFloorBounds(
  input: IsoSceneInput,
  heights: IsoHeightMap,
  floor: number,
  stack: IsoStack,
): IsoRect {
  const ground = liftRect(getFieldBounds(input.gridSize, input.cellSize), floor, stack);
  const tops = getFloorCells(input.gridSize, floor).map((cell) => {
    const level = getCellHeight(heights, cell.col, cell.row, floor);
    return liftPoint(projectIso(cell.col, cell.row, input.cellSize), floor, stack).y
      - level * input.levelHeight;
  });
  const top = Math.min(ground.y, ...tops);
  return { ...ground, height: ground.y + ground.height - top, y: top };
}

function getRaisedFieldBounds(
  input: IsoSceneInput,
  heights: IsoHeightMap,
  stack: IsoStack,
): IsoRect {
  return (
    unionRects(
      getIsoFloors(stack).map((floor) => getRaisedFloorBounds(input, heights, floor, stack)),
    ) ?? getFieldBounds(input.gridSize, input.cellSize)
  );
}

function buildFloorItems(
  input: IsoSceneInput,
  placements: readonly IsoPlacement[],
  stack: IsoStack,
): IsoSceneItem[] {
  return placements.map((placement): IsoSceneItem => {
    const record = input.objects[placement.objectId]!;
    const space = getIsoColumnSpace(input, placement.floor);
    const levels = Math.max(0, ...getFootprintHeights(placement, input.heights));
    const elevation = levels * input.levelHeight;
    const imageRect = getPlacementImageRect(placement, record, input.cellSize, elevation);
    return {
      diamond: getRaisedFootprintDiamond(
        placement.col,
        placement.row,
        placement.footprint,
        levels,
        space,
      ).map((point) => liftPoint(point, placement.floor, stack)),
      elevation,
      imageRect: imageRect ? liftRect(imageRect, placement.floor, stack) : null,
      placement,
      record,
    };
  });
}

/**
 * Pure scene layout: pieces stand on top of their columns (a piece on uneven
 * columns, left over from later height edits, stands on the highest one).
 * Floors are laid out from the ground up, and pieces are drawn in one order
 * across the whole tower: a higher floor stands further back, so everything in
 * front of it overlaps it.
 */
export function buildIsoSceneModel(input: IsoSceneInput): IsoSceneModel {
  const stack = getIsoSceneStack(input);
  const floors = getIsoFloors(stack);
  const guides = floors.map((floor) =>
    getColumnGuide(getIsoColumnSpace(input, floor), input.hideHiddenLines),
  );
  const guide = guides.flatMap(({ segments }, floor) =>
    segments.map((segment) => liftSegment(segment, floor, stack)),
  );
  const guideFaces = guides.flatMap(({ faces }, floor) =>
    faces.map((face) => liftFace(face, floor, stack)),
  );
  const ground = getFieldBounds(input.gridSize, input.cellSize);
  const field =
    unionRects([
      ...floors.map((floor) => liftRect(ground, floor, stack)),
      getPointsBounds(guide.flatMap((segment) => [segment.from, segment.to])),
    ]) ?? ground;
  const range = input.heightRange;
  const frameField = range
    ? (unionRects([field, getRaisedFieldBounds(input, range.high, stack)]) ?? field)
    : field;
  const renderable = filterRenderablePlacements(
    input.placements,
    new Set(Object.keys(input.objects)),
    input.gridSize,
    stack.floors,
  );
  const items = buildFloorItems(
    input,
    sortPlacementsForDrawing(renderable, input.gridSize),
    stack,
  );
  const elevationIn = (heights: IsoHeightMap, placement: IsoPlacement) =>
    Math.max(0, ...getFootprintHeights(placement, heights)) * input.levelHeight;
  const rectIn = (heights: IsoHeightMap, item: IsoSceneItem) => {
    const rect = getPlacementImageRect(
      item.placement,
      item.record,
      input.cellSize,
      elevationIn(heights, item.placement),
    );
    return rect ? liftRect(rect, item.placement.floor, stack) : null;
  };
  // While animating, each piece counts at its lowest and highest elevation of the loop.
  const pieceRects = items.flatMap((item) =>
    range
      ? [rectIn(range.low, item), rectIn(range.high, item)]
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
