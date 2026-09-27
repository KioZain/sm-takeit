import { describe, expect, it } from "vitest";

import {
  getCellAtPoint,
  getFieldBounds,
  getFloorCells,
  isFloorSeamCell,
  projectIso,
  type IsoGridSize,
  type IsoPoint,
} from "./iso-geometry";
import {
  findIsoFloorAtPoint,
  getIsoFloorOffset,
  getIsoFloors,
  getIsoStack,
  getIsoStackBounds,
  ISO_SINGLE_FLOOR,
  liftPoint,
} from "./iso-stack";

const CELL = 72;

function zone(side: number): IsoGridSize {
  return { cols: side, rows: side };
}

/** The four screen corners of a zone's ground diamond, in floor-local space. */
function corners(side: number) {
  return {
    bottom: projectIso(side, side, CELL),
    left: projectIso(0, side, CELL),
    right: projectIso(side, 0, CELL),
    top: projectIso(0, 0, CELL),
  };
}

/** The four corners of one cell, from its far corner clockwise. */
function cellCorners(col: number, row: number): IsoPoint[] {
  return [
    projectIso(col, row, CELL),
    projectIso(col + 1, row, CELL),
    projectIso(col + 1, row + 1, CELL),
    projectIso(col, row + 1, CELL),
  ];
}

/** Where two segments cross, or null when they are parallel. */
function crossing(a0: { x: number; y: number }, a1: { x: number; y: number }, b0: { x: number; y: number }, b1: { x: number; y: number }) {
  const da = { x: a1.x - a0.x, y: a1.y - a0.y };
  const db = { x: b1.x - b0.x, y: b1.y - b0.y };
  const denominator = da.x * db.y - da.y * db.x;
  if (Math.abs(denominator) < 1e-9) return null;
  const t = ((b0.x - a0.x) * db.y - (b0.y - a0.y) * db.x) / denominator;
  return { t, x: a0.x + t * da.x, y: a0.y + t * da.y };
}

describe("stacked zones", () => {
  it("overlaps floors by exactly one cell", () => {
    [2, 3].forEach((side) => {
      // A whole number of cell diagonals, so the tower keeps one grid.
      expect(getIsoFloorOffset(zone(side), CELL)).toBeCloseTo(((side - 1) * CELL) / 2);
    });

    // Half the zone height is the same shift at zone 2 and misses the grid at zone 3.
    expect(getIsoFloorOffset(zone(2), CELL)).toBeCloseTo(getFieldBounds(zone(2), CELL).height / 2);
    expect(getIsoFloorOffset(zone(3), CELL)).not.toBeCloseTo(
      getFieldBounds(zone(3), CELL).height / 2,
    );
  });

  it("drops a floor's near corner cell onto the far corner cell below", () => {
    const side = 3;
    const stack = getIsoStack(zone(side), CELL, 2);
    const seam = cellCorners(side - 1, side - 1).map((point) => liftPoint(point, 1, stack));
    const below = cellCorners(0, 0);

    // The same rhombus, corner for corner: one cell of the tower, drawn once.
    seam.forEach((point, index) => {
      expect(point.x).toBeCloseTo(below[index]!.x);
      expect(point.y).toBeCloseTo(below[index]!.y);
    });
  });

  it("meets the lower zone at the side corners of the shared cell", () => {
    const side = 3;
    const stack = getIsoStack(zone(side), CELL, 2);
    const { bottom, left, right, top } = corners(side);
    const upper = {
      bottom: liftPoint(bottom, 1, stack),
      left: liftPoint(left, 1, stack),
      right: liftPoint(right, 1, stack),
    };

    // The upper zone's lower-right edge meets the lower zone's upper-right edge
    // at the shared cell's right corner — a grid vertex, one cell in from the
    // lower zone's top and one cell up from the upper zone's bottom.
    const rightCorner = crossing(upper.right, upper.bottom, top, right)!;
    expect(rightCorner.x).toBeCloseTo(projectIso(1, 0, CELL).x);
    expect(rightCorner.y).toBeCloseTo(projectIso(1, 0, CELL).y);
    expect(rightCorner.t).toBeCloseTo((side - 1) / side);

    const leftCorner = crossing(upper.left, upper.bottom, top, left)!;
    expect(leftCorner.x).toBeCloseTo(projectIso(0, 1, CELL).x);
    expect(leftCorner.y).toBeCloseTo(projectIso(0, 1, CELL).y);
  });

  it("leaves the shared cell to the floor that carries it", () => {
    expect(getFloorCells(zone(3), 0)).toHaveLength(9);
    expect(getFloorCells(zone(3), 1)).toHaveLength(8);
    expect(getFloorCells(zone(3), 1).some((cell) => cell.col === 2 && cell.row === 2)).toBe(false);
    expect(isFloorSeamCell(zone(3), 2, 2, 0)).toBe(false);
  });

  it("grows the tower in height and never in width", () => {
    const side = 3;
    const ground = getFieldBounds(zone(side), CELL);
    [1, 2, 5, 8].forEach((floors) => {
      const stack = getIsoStack(zone(side), CELL, floors);
      const bounds = getIsoStackBounds(zone(side), CELL, stack);
      expect(bounds.width).toBeCloseTo(ground.width);
      expect(bounds.x).toBeCloseTo(ground.x);
      expect(bounds.height).toBeCloseTo(ground.height + (floors - 1) * stack.offset);
    });
  });

  it("keeps a single floor on the ground", () => {
    const stack = getIsoStack(zone(3), CELL, 1);
    expect(stack).toEqual(ISO_SINGLE_FLOOR);
    expect(liftPoint({ x: 4, y: 7 }, 0, stack)).toEqual({ x: 4, y: 7 });
    expect(getIsoFloors(stack)).toEqual([0]);
  });

  it("picks the upper floor everywhere but the shared cell", () => {
    const stack = getIsoStack(zone(3), CELL, 3);
    const resolve = (local: IsoPoint, floor: number) => {
      const cell = getCellAtPoint(local, zone(3), CELL);
      return cell && !isFloorSeamCell(zone(3), cell.col, cell.row, floor) ? { cell, floor } : null;
    };

    // The middle of the shared rhombus: cell (2, 2) of floor 1, cell (0, 0) of floor 0.
    const shared = liftPoint(projectIso(2.5, 2.5, CELL), 1, stack);
    expect(findIsoFloorAtPoint(shared, stack, resolve)).toEqual({
      cell: { col: 0, row: 0 },
      floor: 0,
    });

    // Every other cell stays with the floor that owns it.
    const own = liftPoint(projectIso(1.5, 1.5, CELL), 1, stack);
    expect(findIsoFloorAtPoint(own, stack, resolve)).toEqual({ cell: { col: 1, row: 1 }, floor: 1 });
    expect(getIsoFloors(stack)).toEqual([0, 1, 2]);
  });
});
