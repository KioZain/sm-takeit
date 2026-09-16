import { describe, expect, it } from "vitest";

import type { IsoPoint } from "./iso-geometry";
import { clipPolygon, clipSegment } from "./iso-occlusion";

const square = (x: number, y: number, size: number): IsoPoint[] => [
  { x, y },
  { x: x + size, y },
  { x: x + size, y: y + size },
  { x, y: y + size },
];

function area(polygon: readonly IsoPoint[]): number {
  return Math.abs(
    polygon.reduce((sum, point, index) => {
      const next = polygon[(index + 1) % polygon.length]!;
      return sum + point.x * next.y - next.x * point.y;
    }, 0) / 2,
  );
}

describe("iso occlusion", () => {
  it("cuts the hidden middle out of a segment", () => {
    const pieces = clipSegment({ from: { x: 0, y: 5 }, to: { x: 30, y: 5 } }, [square(10, 0, 10)]);
    expect(pieces).toHaveLength(2);
    expect(pieces[0]!.from.x).toBe(0);
    expect(pieces[0]!.to.x).toBeCloseTo(10, 2);
    expect(pieces[1]!.from.x).toBeCloseTo(20, 2);
    expect(pieces[1]!.to.x).toBe(30);
  });

  it("keeps segments that only touch an occluder's outline", () => {
    const edge = { from: { x: 10, y: 0 }, to: { x: 10, y: 10 } };
    expect(clipSegment(edge, [square(10, 0, 10)])).toEqual([edge]);
    expect(clipSegment({ from: { x: 12, y: 2 }, to: { x: 18, y: 8 } }, [square(10, 0, 10)])).toEqual([]);
  });

  it("merges overlapping occluders", () => {
    const pieces = clipSegment({ from: { x: 0, y: 5 }, to: { x: 40, y: 5 } }, [square(10, 0, 10), square(15, 0, 10)]);
    expect(pieces).toHaveLength(2);
    expect(pieces[0]!.to.x).toBeCloseTo(10, 2);
    expect(pieces[1]!.from.x).toBeCloseTo(25, 2);
  });

  it("subtracts occluders from a polygon", () => {
    const pieces = clipPolygon(square(0, 0, 10), [square(5, 5, 10)]);
    expect(pieces.reduce((sum, piece) => sum + area(piece), 0)).toBeCloseTo(75, 1);
    expect(clipPolygon(square(0, 0, 10), [square(20, 20, 5)])).toEqual([square(0, 0, 10)]);
    expect(clipPolygon(square(2, 2, 4), [square(0, 0, 10)])).toEqual([]);
  });
});
