import { getRaisedFootprintDiamond } from "./iso-columns";
import {
  getIsoCellRectTops,
  getIsoEraseTarget,
  getIsoPlacementHeights,
  startIsoHeightDrag,
  type IsoFieldContext,
  type IsoHeightGesture,
} from "./iso-field";
import {
  checkPlacement,
  getCellHeight,
  getFootprintHeights,
  type IsoCell,
  type IsoCellRect,
  type IsoPoint,
} from "./iso-geometry";
import { toSvgPath } from "./iso-scene";

export type IsoOverlayTone = "hoverCell" | "hoverInvalid" | "hoverValid" | "selection" | "snapGuide";

/** One editor overlay path; the optional fields become `data-iso-*` test hooks. */
export type IsoOverlayPath = Readonly<{
  d: string;
  hover?: "erase" | "height" | "invalid" | "valid";
  key: string;
  selection?: string;
  snapGuides?: number;
  strokeWidth: number;
  tone: IsoOverlayTone;
}>;

export type IsoOverlayInput = Readonly<{
  cursor: IsoCell | null;
  dragging: boolean;
  erasePoint: IsoPoint | null;
  field: IsoFieldContext;
  heightGesture: IsoHeightGesture | null;
  selection: IsoCellRect | null;
  snapGuides: readonly IsoCell[];
}>;

function columnTop(field: IsoFieldContext, cell: IsoCell): IsoPoint[] {
  const levels = getCellHeight(field.space.heights, cell.col, cell.row);
  return getRaisedFootprintDiamond(cell.col, cell.row, "1x1", levels, field.space);
}

function getPlaceHover(field: IsoFieldContext, cursor: IsoCell): IsoOverlayPath | null {
  if (!field.active) return null;
  const footprint = field.active.record.footprint;
  const valid = checkPlacement(
    field.placements,
    cursor.col,
    cursor.row,
    footprint,
    field.gridSize,
    getIsoPlacementHeights(field),
  ).ok;
  const levels = Math.max(
    0,
    ...getFootprintHeights({ col: cursor.col, footprint, row: cursor.row }, field.space.heights),
  );
  const outline = getRaisedFootprintDiamond(cursor.col, cursor.row, footprint, levels, field.space);
  return {
    d: toSvgPath([outline]),
    hover: valid ? "valid" : "invalid",
    key: "hover",
    strokeWidth: 1.5,
    tone: valid ? "hoverValid" : "hoverInvalid",
  };
}

function getEraseHover(
  field: IsoFieldContext,
  cursor: IsoCell | null,
  erasePoint: IsoPoint | null,
): IsoOverlayPath | null {
  const target = getIsoEraseTarget(field, cursor, erasePoint);
  const item =
    target.kind === "placement"
      ? field.model.items.find((candidate) => candidate.placement.id === target.id)
      : undefined;
  return item
    ? { d: toSvgPath([item.diamond]), hover: "erase", key: "hover", strokeWidth: 1.5, tone: "hoverInvalid" }
    : null;
}

function getHeightHover(
  field: IsoFieldContext,
  cursor: IsoCell | null,
  gesture: IsoHeightGesture | null,
): IsoOverlayPath | null {
  const cells = gesture ? gesture.drag.cells : cursor ? startIsoHeightDrag(field, cursor).cells : [];
  if (cells.length === 0) return null;
  return {
    d: toSvgPath(cells.map((cell) => columnTop(field, cell))),
    hover: "height",
    key: "hover",
    strokeWidth: 1.5,
    tone: "hoverValid",
  };
}

function getToolHover(input: IsoOverlayInput): IsoOverlayPath | null {
  const { cursor, field } = input;
  switch (field.tool) {
    case "place":
      return cursor ? getPlaceHover(field, cursor) : null;
    case "erase":
      return getEraseHover(field, cursor, input.erasePoint);
    case "height":
      return getHeightHover(field, cursor, input.heightGesture);
    default:
      return cursor && !input.dragging
        ? { d: toSvgPath([columnTop(field, cursor)]), key: "hover", strokeWidth: 1, tone: "hoverCell" }
        : null;
  }
}

/** Selection, tool hover, and magnet guides, in paint order. */
export function getIsoOverlayPaths(input: IsoOverlayInput): IsoOverlayPath[] {
  const { field, selection, snapGuides } = input;
  const selectionPath: IsoOverlayPath | null = selection
    ? {
        d: toSvgPath(getIsoCellRectTops(selection, field.space)),
        key: "selection",
        selection: `${selection.col0},${selection.row0},${selection.col1},${selection.row1}`,
        strokeWidth: 1.5,
        tone: "selection",
      }
    : null;
  const guidePath: IsoOverlayPath | null =
    snapGuides.length > 0
      ? {
          d: toSvgPath(snapGuides.map((cell) => columnTop(field, cell))),
          key: "snap",
          snapGuides: snapGuides.length,
          strokeWidth: 1.5,
          tone: "snapGuide",
        }
      : null;
  return [selectionPath, getToolHover(input), guidePath].filter(
    (path): path is IsoOverlayPath => path !== null,
  );
}
