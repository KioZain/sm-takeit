import { describe, expect, it } from "vitest";

import { getCellAtPoint, getFieldBounds, projectIso, type IsoGridSize } from "./iso-geometry";
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
  it("overlaps floors by exactly half a zone", () => {
    [2, 3].forEach((side) => {
      const height = getFieldBounds(zone(side), CELL).height;
      expect(getIsoFloorOffset(zone(side), CELL)).toBeCloseTo(height / 2);
      // Half the zone height is a quarter of the cell size per zone cell.
      expect(getIsoFloorOffset(zone(side), CELL)).toBeCloseTo((side * CELL) / 4);
    });
  });

  it("drops a floor's bottom corner into the middle of the floor below", () => {
    const side = 3;
    const stack = getIsoStack(zone(side), CELL, 2);
    const { bottom, left, right } = corners(side);
    const upperBottom = liftPoint(bottom, 1, stack);

    // The upper zone ends level with the side corners of the lower one.
    expect(upperBottom.x).toBeCloseTo(0);
    expect(upperBottom.y).toBeCloseTo(left.y);
    expect(upperBottom.y).toBeCloseTo(right.y);
  });

  it("crosses the lower zone at the midpoints of its upper edges", () => {
    const side = 3;
    const stack = getIsoStack(zone(side), CELL, 2);
    const { bottom, left, right, top } = corners(side);
    const upper = {
      bottom: liftPoint(bottom, 1, stack),
      left: liftPoint(left, 1, stack),
      right: liftPoint(right, 1, stack),
    };

    // The upper zone's lower-right edge meets the lower zone's upper-right edge.
    const rightCorner = crossing(upper.right, upper.bottom, top, right)!;
    expect(rightCorner.x).toBeCloseTo((side * CELL) / 4);
    expect(rightCorner.y).toBeCloseTo((side * CELL) / 8);
    // Halfway along the lower zone's edge, so the mark sits on the zone seam.
    expect(rightCorner.t).toBeCloseTo(0.5);

    const leftCorner = crossing(upper.left, upper.bottom, top, left)!;
    expect(leftCorner.x).toBeCloseTo((-side * CELL) / 4);
    expect(leftCorner.y).toBeCloseTo((side * CELL) / 8);
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

  it("gives the overlap to the upper floor when picking", () => {
    const stack = getIsoStack(zone(3), CELL, 3);
    // A point inside both floor 0 and floor 1 resolves to the higher one.
    const inBoth = liftPoint(projectIso(1.5, 1.5, CELL), 1, stack);
    const picked = findIsoFloorAtPoint(inBoth, stack, (local, floor) => {
      const cell = getCellAtPoint(local, zone(3), CELL);
      return cell ? { cell, floor } : null;
    });

    expect(picked?.cell).toEqual({ col: 1, row: 1 });

    expect(picked?.floor).toBe(1);
    expect(getIsoFloors(stack)).toEqual([0, 1, 2]);
  });
});
