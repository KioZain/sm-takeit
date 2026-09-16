import { describe, expect, it } from "vitest";

import {
  getColumnAtPoint,
  getColumnGuideFaces,
  getColumnGuideSegments,
  getColumnSilhouette,
  type IsoColumnSpace,
} from "./iso-columns";
import { checkPlacement, projectIso } from "./iso-geometry";

function space(heights: Record<string, number>, gridSize = 3): IsoColumnSpace {
  return { cellSize: 100, gridSize, heights: new Map(Object.entries(heights)), levelHeight: 50 };
}

describe("iso columns", () => {
  it("draws the flat grid as far edges plus the near boundary", () => {
    expect(getColumnGuideSegments(space({}))).toHaveLength(2 * 3 * 4);
  });

  it("draws a raised column's top, front faces, and merged vertical edges", () => {
    const segments = getColumnGuideSegments(space({ "0,0": 1 }, 1));
    // 2 far + 2 near top edges, 2 ground edges, 3 vertical edges (the shared front one merged).
    expect(segments).toHaveLength(9);
    const verticals = segments.filter((segment) => segment.from.x === segment.to.x);
    expect(verticals.map((segment) => segment.to.y - segment.from.y)).toEqual([-50, -50, -50]);
  });

  it("fills only the exposed side faces of raised columns", () => {
    expect(getColumnGuideFaces(space({}))).toEqual([]);
    // (0,0) at 2 levels next to (1,0) at 1: its right face shows one level, its left face two.
    const faces = getColumnGuideFaces(space({ "0,0": 2, "1,0": 1 }, 2));
    const heights = (side: string) =>
      faces
        .filter((face) => face.side === side)
        .map((face) => face.points[3]!.y - face.points[0]!.y)
        .sort((left, right) => left - right);
    expect(heights("left")).toEqual([50, 100]);
    expect(heights("right")).toEqual([50, 50]);
  });

  it("hits the raised front column before the ground behind it", () => {
    const heights = space({ "1,1": 2 });
    // A point just above cell (1,1)'s ground diamond lies on its raised face.
    const behind = projectIso(1, 1, 100);
    expect(getColumnAtPoint({ x: behind.x, y: behind.y + 5 }, heights)).toEqual({ col: 1, row: 1 });
    expect(getColumnAtPoint({ x: behind.x, y: behind.y + 5 }, space({}))).toEqual({ col: 1, row: 1 });
    const top = getColumnSilhouette(1, 1, heights)[0]!;
    expect(getColumnAtPoint({ x: top.x, y: top.y + 10 }, heights)).toEqual({ col: 1, row: 1 });
    expect(getColumnAtPoint({ x: top.x, y: top.y + 10 }, space({}))).toBeNull();
    expect(getColumnAtPoint({ x: 1000, y: 0 }, heights)).toBeNull();
  });

  it("forbids a multi-cell piece on uneven columns", () => {
    const heights = new Map([["0,0", 1]]);
    expect(checkPlacement([], 0, 0, "2x1", 3, heights)).toEqual({ ok: false, reason: "uneven" });
    expect(checkPlacement([], 0, 0, "1x1", 3, heights)).toEqual({ ok: true });
    expect(checkPlacement([], 1, 0, "2x2", 3, heights)).toEqual({ ok: true });
  });
});
