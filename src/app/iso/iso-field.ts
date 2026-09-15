import type { ToolcraftCommand } from "@/toolcraft/runtime";

import {
  cellRectContains,
  eraseCellRect,
  findPlacementAtCell,
  placeObject,
  projectIso,
  unprojectIso,
  type IsoCell,
  type IsoCellRect,
  type IsoPlacement,
  type IsoPoint,
  type IsoRect,
  type IsoSceneModel,
} from "./iso-geometry";
import { createIsoPlacementsCommand, type IsoLibraryObject, type IsoTool } from "./iso-state";

export type IsoFieldContext = Readonly<{
  active: IsoLibraryObject | null;
  cellSize: number;
  gridSize: number;
  model: IsoSceneModel;
  placements: readonly IsoPlacement[];
  selection: IsoCellRect | null;
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

export function clampIsoCell(point: IsoPoint, gridSize: number, cellSize: number): IsoCell {
  const grid = unprojectIso(point, cellSize);
  return {
    col: Math.min(gridSize - 1, Math.max(0, Math.floor(grid.x))),
    row: Math.min(gridSize - 1, Math.max(0, Math.floor(grid.y))),
  };
}

export function getIsoCellRectPolygon(rect: IsoCellRect, cellSize: number): IsoPoint[] {
  return [
    projectIso(rect.col0, rect.row0, cellSize),
    projectIso(rect.col1 + 1, rect.row0, cellSize),
    projectIso(rect.col1 + 1, rect.row1 + 1, cellSize),
    projectIso(rect.col0, rect.row1 + 1, cellSize),
  ];
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
    );
    return next ? createIsoPlacementsCommand(next, "Place object") : null;
  }
  if (field.tool !== "erase") return null;
  const target = getIsoEraseTarget(field, cell, point);
  if (target.kind === "selection") {
    return createIsoPlacementsCommand(eraseCellRect(field.placements, target.rect), "Erase section");
  }
  if (target.kind === "placement") {
    return createIsoPlacementsCommand(
      field.placements.filter((placement) => placement.id !== target.id),
      "Erase object",
    );
  }
  return null;
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
