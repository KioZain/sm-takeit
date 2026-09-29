import { describe, expect, it } from "vitest";

import {
  getCellAtPoint,
  getFieldBounds,
  getFloorCells,
  getFloorOverlap,
  getGridCells,
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
  it("overlaps floors by half a zone, in whole cells", () => {
    expect([2, 3, 4].map((side) => getFloorOverlap(zone(side)))).toEqual([1, 1, 2]);

    [2, 3, 4].forEach((side) => {
      // A whole number of cell diagonals, so the tower keeps one grid.
      const step = side - getFloorOverlap(zone(side));
      expect(getIsoFloorOffset(zone(side), CELL)).toBeCloseTo((step * CELL) / 2);
    });

    // An even zone overlaps by exactly half. Zone 3 would need half a cell, so
    // it keeps one cell and its floors stand a little further apart.
    [2, 4].forEach((side) => {
      expect(getIsoFloorOffset(zone(side), CELL)).toBeCloseTo(
        getFieldBounds(zone(side), CELL).height / 2,
      );
    });
    expect(getIsoFloorOffset(zone(3), CELL)).toBeGreaterThan(
      getFieldBounds(zone(3), CELL).height / 2,
    );
  });

  it("drops a floor's far corner block onto the near corner block before it", () => {
    [2, 3, 4].forEach((side) => {
      const stack = getIsoStack(zone(side), CELL, 2);
      const overlap = getFloorOverlap(zone(side));
      const step = side - overlap;

      // Cell for cell, corner for corner: the shared block of the tower,
      // standing in one place and drawn once.
      getGridCells({ cols: overlap, rows: overlap }).forEach((cell) => {
        const ahead = cellCorners(cell.col, cell.row).map((point) =>
          liftPoint(point, 1, stack),
        );
        const before = cellCorners(step + cell.col, step + cell.row);
        ahead.forEach((point, index) => {
          expect(point.x).toBeCloseTo(before[index]!.x);
          expect(point.y).toBeCloseTo(before[index]!.y);
        });
      });
    });
  });

  it("meets the zone before it at the side corners of the shared block", () => {
    [3, 4].forEach((side) => {
      const stack = getIsoStack(zone(side), CELL, 2);
      const overlap = getFloorOverlap(zone(side));
      const step = side - overlap;
      const { bottom, left, right, top } = corners(side);
      const ahead = {
        left: liftPoint(left, 1, stack),
        right: liftPoint(right, 1, stack),
        top: liftPoint(top, 1, stack),
      };

      // The next zone's upper-right edge meets this one's lower-right edge at
      // the right corner of the shared block — a grid vertex, as many cells in
      // from this zone's right corner as the floors share.
      const rightCorner = crossing(ahead.top, ahead.right, right, bottom)!;
      expect(rightCorner.x).toBeCloseTo(projectIso(side, step, CELL).x);
      expect(rightCorner.y).toBeCloseTo(projectIso(side, step, CELL).y);
      expect(rightCorner.t).toBeCloseTo(overlap / side);

      const leftCorner = crossing(ahead.top, ahead.left, left, bottom)!;
      expect(leftCorner.x).toBeCloseTo(projectIso(step, side, CELL).x);
      expect(leftCorner.y).toBeCloseTo(projectIso(step, side, CELL).y);
    });
  });

  it("leaves the shared block to the floor that carries it", () => {
    [2, 3, 4].forEach((side) => {
      const overlap = getFloorOverlap(zone(side));
      expect(getFloorCells(zone(side), 0)).toHaveLength(side * side);
      expect(getFloorCells(zone(side), 1)).toHaveLength(side * side - overlap * overlap);

      // The block is the far corner of a later floor, and nothing on the first.
      expect(
        getFloorCells(zone(side), 1).some((cell) => cell.col < overlap && cell.row < overlap),
      ).toBe(false);
      expect(isFloorSeamCell(zone(side), 0, 0, 0)).toBe(false);
      expect(isFloorSeamCell(zone(side), overlap, 0, 1)).toBe(false);
    });
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

  it("picks the nearest floor everywhere but the shared block", () => {
    const stack = getIsoStack(zone(3), CELL, 3);
    const resolve = (local: IsoPoint, floor: number) => {
      const cell = getCellAtPoint(local, zone(3), CELL);
      return cell && !isFloorSeamCell(zone(3), cell.col, cell.row, floor) ? { cell, floor } : null;
    };

    // The middle of the shared rhombus: cell (0, 0) of floor 1, cell (2, 2) of floor 0.
    const shared = liftPoint(projectIso(0.5, 0.5, CELL), 1, stack);
    expect(findIsoFloorAtPoint(shared, stack, resolve)).toEqual({
      cell: { col: 2, row: 2 },
      floor: 0,
    });

    // Every other cell stays with the floor that owns it.
    const own = liftPoint(projectIso(1.5, 1.5, CELL), 1, stack);
    expect(findIsoFloorAtPoint(own, stack, resolve)).toEqual({ cell: { col: 1, row: 1 }, floor: 1 });
    expect(getIsoFloors(stack)).toEqual([0, 1, 2]);
  });
});
