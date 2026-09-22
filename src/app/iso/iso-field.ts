import type { ToolcraftCommand } from "@/toolcraft/runtime";

import {
  cellRectContains,
  eraseCellRect,
  findPlacementAtCell,
  getCellHeight,
  placeObject,
  type IsoCell,
  type IsoCellRect,
  type IsoGridSize,
  type IsoHeightMap,
  type IsoPlacement,
  type IsoPoint,
  type IsoRect,
  type IsoSceneModel,
} from "./iso-geometry";
import {
  getColumnAtPoint,
  getNearestColumn,
  getRaisedFootprintDiamond,
  type IsoColumnSpace,
} from "./iso-columns";
import {
  dragColumnHeights,
  getLinkedCells,
  getRectCells,
  ISO_SNAP_DISTANCE_PX,
  toReliefEdits,
  type IsoHeightDrag,
} from "./iso-relief";
import {
  createIsoReliefEditsCommand,
  createIsoPlacementsCommand,
  type IsoLibraryObject,
  type IsoTool,
} from "./iso-state";

export type IsoFieldContext = Readonly<{
  active: IsoLibraryObject | null;
  cellSize: number;
  gridSize: IsoGridSize;
  model: IsoSceneModel;
  /** Hidden pieces outside the current grid, appended to every edit. */
  offGrid: readonly IsoPlacement[];
  placements: readonly IsoPlacement[];
  /** Live pattern levels and the hand edits over them. */
  relief: Readonly<{ animated: boolean; edits: IsoHeightMap; pattern: IsoHeightMap }>;
  selection: IsoCellRect | null;
  /** Grid and final column heights used for hit tests and raised outlines. */
  space: IsoColumnSpace;
  tool: IsoTool;
}>;

export type IsoSelectDrag = Readonly<{ from: IsoCell; pointerId: number; to: IsoCell }>;

export type IsoEraseTarget =
  | Readonly<{ kind: "none" }>
  | Readonly<{ kind: "placement"; id: string }>
  | Readonly<{ kind: "selection"; rect: IsoCellRect }>;

/** Maps a pointer offset inside the rendered frame box to field-local coordinates. */
export function toIsoFramePoint(
  model: IsoSceneModel,
  boxWidth: number,
  boxHeight: number,
  offsetX: number,
  offsetY: number,
): IsoPoint {
  return {
    x: model.frame.x + (offsetX * model.frame.width) / Math.max(1, boxWidth),
    y: model.frame.y + (offsetY * model.frame.height) / Math.max(1, boxHeight),
  };
}

/** Heights that decide whether a footprint is level; a running wave levels pieces itself. */
export function getIsoPlacementHeights(field: IsoFieldContext): IsoHeightMap | undefined {
  return field.relief.animated ? undefined : field.space.heights;
}

/** The column under the point, or null off the field. */
export function getIsoCellAt(field: IsoFieldContext, point: IsoPoint): IsoCell | null {
  return getColumnAtPoint(point, field.space);
}

/** The column under the point, clamped to the field for drags that leave it. */
export function clampIsoCell(field: IsoFieldContext, point: IsoPoint): IsoCell {
  return getNearestColumn(point, field.space);
}

/** Raised top outlines of every cell in the rectangle. */
export function getIsoCellRectTops(rect: IsoCellRect, space: IsoColumnSpace): IsoPoint[][] {
  return getRectCells(rect).map((cell) =>
    getRaisedFootprintDiamond(
      cell.col,
      cell.row,
      "1x1",
      getCellHeight(space.heights, cell.col, cell.row),
      space,
    ),
  );
}

function rectContainsPoint(rect: IsoRect, point: IsoPoint): boolean {
  return (
    point.x >= rect.x &&
    point.x <= rect.x + rect.width &&
    point.y >= rect.y &&
    point.y <= rect.y + rect.height
  );
}

/** Selection wins when the cell is inside it; otherwise the topmost object image, then cell occupancy. */
export function getIsoEraseTarget(
  field: IsoFieldContext,
  cell: IsoCell | null,
  point: IsoPoint | null,
): IsoEraseTarget {
  if (cell && field.selection && cellRectContains(field.selection, cell.col, cell.row)) {
    return { kind: "selection", rect: field.selection };
  }
  const hit = point
    ? [...field.model.items]
        .reverse()
        .find((item) => item.imageRect !== null && rectContainsPoint(item.imageRect, point))
    : undefined;
  if (hit) return { id: hit.placement.id, kind: "placement" };
  const placement = cell ? findPlacementAtCell(field.placements, cell.col, cell.row) : null;
  return placement ? { id: placement.id, kind: "placement" } : { kind: "none" };
}

/** The Place or Erase command for one cell, or null when nothing changes. */
export function getIsoCellCommand(
  field: IsoFieldContext,
  cell: IsoCell | null,
  point: IsoPoint | null,
): ToolcraftCommand | null {
  if (field.tool === "place") {
    if (!cell || !field.active) return null;
    const next = placeObject(
      field.placements,
      field.active.id,
      cell.col,
      cell.row,
      field.active.record.footprint,
      field.gridSize,
      getIsoPlacementHeights(field),
    );
    return next ? createIsoPlacementsCommand([...next, ...field.offGrid], "Поставить объект") : null;
  }
  if (field.tool !== "erase") return null;
  const target = getIsoEraseTarget(field, cell, point);
  if (target.kind === "selection") {
    return createIsoPlacementsCommand(
      [...eraseCellRect(field.placements, target.rect), ...field.offGrid],
      "Стереть секцию",
    );
  }
  if (target.kind === "placement") {
    return createIsoPlacementsCommand(
      [...field.placements.filter((placement) => placement.id !== target.id), ...field.offGrid],
      "Стереть объект",
    );
  }
  return null;
}

/** Columns a height drag moves: the selection when pressed inside it, else the pressed column. */
export function startIsoHeightDrag(field: IsoFieldContext, cell: IsoCell): IsoHeightDrag {
  const base =
    field.selection && cellRectContains(field.selection, cell.col, cell.row)
      ? getRectCells(field.selection)
      : [cell];
  return {
    cells: getLinkedCells(base, field.placements).map((linked) => ({
      ...linked,
      start: getCellHeight(field.space.heights, linked.col, linked.row),
    })),
    origin: getCellHeight(field.space.heights, cell.col, cell.row),
  };
}

export type IsoHeightGesture = Readonly<{
  drag: IsoHeightDrag;
  group: string;
  pointerId: number;
  startY: number;
  /** Field-local units per screen pixel, fixed for the whole gesture. */
  unitsPerPixel: number;
}>;

export type IsoHeightDragResult = Readonly<{
  /** Edits command that gives the moved columns their new heights. */
  command: ToolcraftCommand;
  guides: readonly IsoCell[];
  level: number;
}>;

function toEditsCommand(
  field: IsoFieldContext,
  drag: IsoHeightDrag,
  heights: IsoHeightMap,
  label: string,
  history?: Readonly<{ group?: string; mode: "merge" | "record" }>,
): ToolcraftCommand {
  const edits = toReliefEdits(field.relief.edits, field.relief.pattern, heights, drag.cells);
  return createIsoReliefEditsCommand(edits, label, history);
}

/** Result of dragging `clientY` screen pixels from the gesture start (up is higher). */
export function moveIsoHeightDrag(
  field: IsoFieldContext,
  gesture: IsoHeightGesture,
  clientY: number,
  modifiers: Readonly<{ altKey: boolean; shiftKey: boolean }>,
): IsoHeightDragResult {
  const levelPx = Math.max(1e-6, field.space.levelHeight);
  const deltaLevels = ((gesture.startY - clientY) * gesture.unitsPerPixel) / levelPx;
  const result = dragColumnHeights(field.space.heights, gesture.drag, deltaLevels, {
    gridSize: field.gridSize,
    mode: modifiers.altKey ? "free" : modifiers.shiftKey ? "whole" : "magnet",
    threshold: (ISO_SNAP_DISTANCE_PX * gesture.unitsPerPixel) / levelPx,
  });
  return {
    command: toEditsCommand(field, gesture.drag, result.heights, "Изменить высоту колонки", {
      group: gesture.group,
      mode: "merge",
    }),
    guides: result.guides,
    level: result.level,
  };
}

/** Keyboard height step: one whole level up or down for the cursor column or selection. */
export function getIsoHeightStepCommand(
  field: IsoFieldContext,
  cell: IsoCell,
  direction: 1 | -1,
): ToolcraftCommand | null {
  const drag = startIsoHeightDrag(field, cell);
  const target = direction > 0 ? Math.floor(drag.origin + 1e-3) + 1 : Math.ceil(drag.origin - 1e-3) - 1;
  const result = dragColumnHeights(field.space.heights, drag, target - drag.origin, {
    gridSize: field.gridSize,
    mode: "free",
    threshold: 0,
  });
  return result.level === drag.origin
    ? null
    : toEditsCommand(field, drag, result.heights, direction > 0 ? "Поднять колонки" : "Опустить колонки");
}

export function moveIsoSelectDrag(
  current: IsoSelectDrag | null,
  pointerId: number,
  to: IsoCell,
): IsoSelectDrag | null {
  if (!current || current.pointerId !== pointerId) return current;
  return current.to.col === to.col && current.to.row === to.row
    ? current
    : { from: current.from, pointerId, to };
}

export function isSameIsoCell(left: IsoCell | null, right: IsoCell | null): boolean {
  return left?.col === right?.col && left?.row === right?.row;
}
