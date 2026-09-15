import { describe, expect, it } from "vitest";

import {
  buildIsoSceneModel,
  checkPlacement,
  eraseCellRect,
  fillCellRect,
  filterRenderablePlacements,
  getCellAtPoint,
  getPlacementImageRect,
  placeObject,
  projectIso,
  sortPlacementsForDrawing,
  unprojectIso,
  type IsoObjectRecord,
  type IsoPlacement,
  type IsoSceneInput,
} from "./iso-geometry";

const record: IsoObjectRecord = {
  anchor: { x: 0.5, y: 0.9 },
  footprint: "1x1",
  name: "roll",
  scale: 1,
  size: { height: 300, width: 200 },
};

function at(objectId: string, col: number, row: number, footprint: IsoPlacement["footprint"] = "1x1"): IsoPlacement {
  return { col, footprint, id: `${objectId}@${col},${row}`, objectId, row };
}

function sceneInput(overrides: Partial<IsoSceneInput> = {}): IsoSceneInput {
  return {
    cellSize: 100,
    crop: "content",
    gridSize: 6,
    includeGrid: false,
    objects: { roll: record },
    padding: 10,
    placements: [],
    shadow: { blur: 0, offset: { x: 0, y: 0 }, opacity: 0 },
    ...overrides,
  };
}

describe("iso projection", () => {
  it("projects grid coordinates with the 2:1 rhombus formula", () => {
    expect(projectIso(2, 1, 64)).toEqual({ x: 32, y: 48 });
    expect(unprojectIso({ x: 32, y: 48 }, 64)).toEqual({ x: 2, y: 1 });
  });

  it("hit-tests the cell under a point and rejects points outside the field", () => {
    expect(getCellAtPoint(projectIso(3.5, 2.5, 72), 6, 72)).toEqual({ col: 3, row: 2 });
    expect(getCellAtPoint(projectIso(6.5, 0.5, 72), 6, 72)).toBeNull();
  });
});

describe("iso placement operations", () => {
  it("rejects footprints that leave the grid or overlap occupied cells", () => {
    expect(checkPlacement([], 5, 5, "2x2", 6)).toEqual({ ok: false, reason: "outside" });
    expect(checkPlacement([at("roll", 1, 1, "2x1")], 2, 1, "1x1", 6)).toEqual({
      ok: false,
      reason: "occupied",
    });
    expect(placeObject([], "roll", 4, 5, "2x1", 6)).toHaveLength(1);
  });

  it("tiles a section with the footprint and leaves the remainder empty", () => {
    const filled = fillCellRect([], { col0: 0, col1: 2, row0: 0, row1: 1 }, "roll", "2x1", 6);
    expect(filled.map((placement) => [placement.col, placement.row])).toEqual([
      [0, 0],
      [0, 1],
    ]);
  });

  it("fills around existing objects without overlap", () => {
    const filled = fillCellRect([at("maki", 1, 0)], { col0: 0, col1: 2, row0: 0, row1: 0 }, "roll", "1x1", 6);
    expect(filled.map((placement) => placement.id).sort()).toEqual(["maki@1,0", "roll@0,0", "roll@2,0"]);
  });

  it("erases every placement intersecting a section", () => {
    const placements = [at("roll", 0, 0, "2x2"), at("roll", 4, 4)];
    expect(eraseCellRect(placements, { col0: 1, col1: 1, row0: 1, row1: 1 })).toEqual([at("roll", 4, 4)]);
  });

  it("ignores placements of removed objects, outside the grid, or overlapping", () => {
    const placements = [at("gone", 0, 0), at("roll", 5, 5, "2x1"), at("roll", 1, 1), at("roll", 1, 1)];
    expect(filterRenderablePlacements(placements, new Set(["roll"]), 6)).toEqual([at("roll", 1, 1)]);
  });
});

describe("iso drawing order", () => {
  it("orders single cells by far-corner depth then column", () => {
    const order = sortPlacementsForDrawing([at("a", 1, 1), at("b", 0, 1), at("c", 1, 0), at("d", 0, 0)]);
    expect(order.map((placement) => placement.objectId)).toEqual(["d", "b", "c", "a"]);
  });

  it("draws a cell directly behind a wide footprint before it", () => {
    const wide = at("wide", 0, 1, "2x1");
    const behind = at("behind", 1, 0);
    expect(sortPlacementsForDrawing([wide, behind]).map((placement) => placement.objectId)).toEqual([
      "behind",
      "wide",
    ]);
  });

  it("draws a 2x2 footprint after both neighbours it overlaps from the front", () => {
    const large = at("large", 1, 1, "2x2");
    const left = at("left", 0, 1);
    const top = at("top", 1, 0);
    const front = at("front", 3, 1);
    const order = sortPlacementsForDrawing([front, large, left, top]).map((placement) => placement.objectId);
    expect(order.indexOf("left")).toBeLessThan(order.indexOf("large"));
    expect(order.indexOf("top")).toBeLessThan(order.indexOf("large"));
    expect(order.indexOf("large")).toBeLessThan(order.indexOf("front"));
  });
});

describe("iso scene model", () => {
  it("aligns the anchor with the floor center of the footprint and scales by footprint width", () => {
    expect(getPlacementImageRect(at("roll", 0, 0), record, 100)).toEqual({
      height: 150,
      width: 100,
      x: -50,
      y: -110,
    });
    expect(getPlacementImageRect(at("roll", 0, 0, "2x1"), record, 100)?.width).toBe(150);
  });

  it("crops content mode to objects plus padding and centers the frame on the origin", () => {
    const model = buildIsoSceneModel(sceneInput({ placements: [at("roll", 0, 0)] }));
    expect(model.frame).toEqual({ height: 170, width: 120, x: -60, y: -120 });
    expect(model.worldFrame).toEqual({ height: 170, width: 120, x: -60, y: -85 });
  });

  it("keeps the whole field inside field crop", () => {
    const model = buildIsoSceneModel(sceneInput({ crop: "field", placements: [at("roll", 0, 0)] }));
    expect(model.frame.x).toBeLessThanOrEqual(-300 - 10);
    expect(model.frame.x + model.frame.width).toBeGreaterThanOrEqual(300 + 10);
    expect(model.frame.y).toBe(-120);
    expect(Number.isInteger(model.frame.width)).toBe(true);
  });

  it("falls back to the field when content crop has no objects", () => {
    const model = buildIsoSceneModel(sceneInput());
    expect(model.frame).toEqual({ height: 320, width: 620, x: -310, y: -10 });
  });
});
