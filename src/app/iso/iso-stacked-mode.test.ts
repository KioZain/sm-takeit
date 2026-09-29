import { describe, expect, it } from "vitest";

import { getFieldBounds, getFloorCells, getFloorOverlap, heightKey } from "./iso-geometry";
import { getIsoFloorOffset, getIsoStack } from "./iso-stack";
import {
  buildIsoSceneModelFromState,
  getIsoActivePlacements,
  getIsoFloorCount,
  getIsoGridMode,
  getIsoGridSize,
  getIsoOffGridPlacements,
  getIsoReliefLayers,
  ISO_TARGETS,
  readIsoSceneInput,
} from "./iso-state";
import { asset, at, createState, record } from "./iso-test-fixtures";

const ZONE = 3;

function stacked(values: Record<string, unknown> = {}) {
  return createState({
    [ISO_TARGETS.gridFloors]: 3,
    [ISO_TARGETS.gridMode]: "stacked",
    [ISO_TARGETS.gridZone]: ZONE,
    ...values,
  });
}

/**
 * Dashed segments of one zone: two far edges per cell it owns plus the near
 * border of the row and column that have nothing in front of them. A raised
 * floor hands its near corner block to the floor below, which already draws
 * those rhombi, so it contributes that much less.
 */
function zoneSegments(side: number, overlap = 0): number {
  return 2 * (side * side - overlap * overlap) + 2 * (side - overlap);
}

const SEGMENTS_PER_ZONE = zoneSegments(ZONE);
const SEGMENTS_PER_RAISED_ZONE = zoneSegments(ZONE, getFloorOverlap({ cols: ZONE, rows: ZONE }));

/** A slope the stacked relief cap leaves alone, so both fields keep its peak. */
const SLOPE = {
  [ISO_TARGETS.reliefCorner]: "top",
  [ISO_TARGETS.reliefMax]: 2,
  [ISO_TARGETS.reliefPattern]: "corner-diagonal",
  [ISO_TARGETS.reliefStep]: 4,
};

/**
 * Every column of a three-floor tower stands as high as the cell it lands on
 * in a single field of the tower's span: one surface, one pattern, no restart
 * at a floor.
 */
function expectsOneField(relief: Record<string, unknown>): void {
  const square = { cols: ZONE, rows: ZONE };
  const step = ZONE - getFloorOverlap(square);
  const span = ZONE + 2 * step;
  const tower = getIsoReliefLayers(stacked(relief)).heights;
  const field = getIsoReliefLayers(
    createState({ ...relief, [ISO_TARGETS.gridCols]: span, [ISO_TARGETS.gridRows]: span }),
  ).heights;

  [0, 1, 2].forEach((floor) => {
    getFloorCells(square, floor).forEach((cell) => {
      const ahead = floor * step;
      expect(tower.get(heightKey(cell.col, cell.row, floor)) ?? 0).toBeCloseTo(
        field.get(heightKey(cell.col + ahead, cell.row + ahead)) ?? 0,
      );
    });
  });
}

describe("stacked grid mode", () => {
  it("reads one square zone and its floor count", () => {
    const state = stacked();
    expect(getIsoGridMode(state.values)).toBe("stacked");
    expect(getIsoGridSize(state.values)).toEqual({ cols: ZONE, rows: ZONE });
    expect(getIsoFloorCount(state.values)).toBe(3);

    // Width and length belong to the classic layout and are ignored here.
    const wide = stacked({ [ISO_TARGETS.gridCols]: 8, [ISO_TARGETS.gridRows]: 7 });
    expect(getIsoGridSize(wide.values)).toEqual({ cols: ZONE, rows: ZONE });
  });

  it("takes a four-cell zone and keeps growing only in height", () => {
    const side = 4;
    const of = (floors: number) =>
      stacked({ [ISO_TARGETS.gridFloors]: floors, [ISO_TARGETS.gridZone]: side });
    expect(getIsoGridSize(of(2).values)).toEqual({ cols: side, rows: side });

    const one = buildIsoSceneModelFromState(of(1));
    const two = buildIsoSceneModelFromState(of(2));
    const square = { cols: side, rows: side };
    const offset = getIsoFloorOffset(square, readIsoSceneInput(of(2)).cellSize);

    // Half of a four-cell zone is two whole cells, so the raised floor hands
    // down a 2×2 block instead of the single cell of zones 2 and 3.
    expect(getFloorOverlap(square)).toBe(2);
    expect(one.guide).toHaveLength(zoneSegments(side));
    expect(two.guide).toHaveLength(zoneSegments(side) + zoneSegments(side, 2));
    expect(two.field.width).toBeCloseTo(one.field.width);
    expect(two.field.height).toBeCloseTo(one.field.height + offset);
  });

  it("hands the whole shared block down at zone 4", () => {
    const side = 4;
    const cells = [0, 1, 2, 3].map((index) => ({
      col: index % 2,
      row: Math.floor(index / 2),
    }));
    const on = (floor: number) =>
      stacked({
        [ISO_TARGETS.gridFloors]: 2,
        [ISO_TARGETS.gridZone]: side,
        [ISO_TARGETS.placements]: {
          items: cells.map((cell) => at("maki", cell.col, cell.row, "1x1", floor)),
        },
      });

    // All four rhombi belong to the first floor, so the later one takes none.
    expect(getIsoActivePlacements(on(1))).toHaveLength(0);
    expect(getIsoOffGridPlacements(on(1))).toHaveLength(4);
    expect(getIsoActivePlacements(on(0))).toHaveLength(4);

    // The later floor still owns the other twelve cells.
    const beside = stacked({
      [ISO_TARGETS.gridFloors]: 2,
      [ISO_TARGETS.gridZone]: side,
      [ISO_TARGETS.placements]: {
        items: [at("maki", 2, 0, "1x1", 1), at("maki", 0, 2, "1x1", 1)],
      },
    });
    expect(getIsoActivePlacements(beside)).toHaveLength(2);
  });

  it("holds the zone inside the range the panel offers", () => {
    expect(getIsoGridSize(stacked({ [ISO_TARGETS.gridZone]: 9 }).values)).toEqual({
      cols: 4,
      rows: 4,
    });
    expect(getIsoGridSize(stacked({ [ISO_TARGETS.gridZone]: 1 }).values)).toEqual({
      cols: 2,
      rows: 2,
    });
  });

  it("keeps the classic layout on one ground floor", () => {
    const classic = createState({ [ISO_TARGETS.gridMode]: "classic", [ISO_TARGETS.gridFloors]: 5 });
    expect(getIsoFloorCount(classic.values)).toBe(1);
    expect(getIsoGridSize(classic.values)).toEqual({ cols: 6, rows: 6 });
  });

  it("draws every floor and grows only in height", () => {
    const one = buildIsoSceneModelFromState(stacked({ [ISO_TARGETS.gridFloors]: 1 }));
    const three = buildIsoSceneModelFromState(stacked());
    const offset = getIsoFloorOffset({ cols: ZONE, rows: ZONE }, readIsoSceneInput(stacked()).cellSize);

    expect(one.guide).toHaveLength(SEGMENTS_PER_ZONE);
    expect(three.guide).toHaveLength(SEGMENTS_PER_ZONE + 2 * SEGMENTS_PER_RAISED_ZONE);
    expect(three.field.width).toBeCloseTo(one.field.width);
    expect(three.field.height).toBeCloseTo(one.field.height + 2 * offset);
  });

  it("grows downwards and leaves the floors already there in place", () => {
    const of = (floors: number) =>
      buildIsoSceneModelFromState(stacked({ [ISO_TARGETS.gridFloors]: floors }));
    const one = of(1);

    // The first zone keeps its place: the field starts at the same top edge
    // and every added floor only reaches further down, towards the viewer.
    [2, 3, 8].forEach((floors) => {
      const grown = of(floors);
      expect(grown.field.y).toBeCloseTo(one.field.y);
      expect(grown.field.x).toBeCloseTo(one.field.x);
      expect(grown.field.height).toBeGreaterThan(one.field.height);
    });
  });

  it("overlaps neighbouring floors by exactly one cell", () => {
    const input = readIsoSceneInput(stacked());
    const zoneHeight = getFieldBounds(input.gridSize, input.cellSize).height;
    const stack = getIsoStack(input.gridSize, input.cellSize, input.floors);

    expect(stack.floors).toBe(3);
    expect(stack.offset).toBeCloseTo(((ZONE - 1) * input.cellSize) / 2);
    // One cell of the zone's own height stays inside the floor below.
    expect(zoneHeight - stack.offset).toBeCloseTo(input.cellSize / 2);
  });

  it("gives the shared corner cell to the floor before it", () => {
    const pieces = [at("maki", 0, 0, "1x1", 1), at("maki", ZONE - 1, ZONE - 1, "1x1", 0)];
    const state = stacked({ [ISO_TARGETS.placements]: { items: pieces } });

    // Both would stand in the same rhombus, so the later floor gives it up.
    const active = getIsoActivePlacements(state);
    expect(active).toHaveLength(1);
    expect(active[0]!.floor).toBe(0);
    // The refused piece is stored, not lost.
    expect(getIsoOffGridPlacements(state)).toHaveLength(1);

    // The floor still owns every other cell.
    const beside = stacked({
      [ISO_TARGETS.placements]: { items: [at("maki", 1, 0, "1x1", 1)] },
    });
    expect(getIsoActivePlacements(beside)).toHaveLength(1);
  });

  it("places pieces on their own floor and keeps them apart", () => {
    const pieces = [at("maki", 1, 1, "1x1", 0), at("maki", 1, 1, "1x1", 2)];
    const state = stacked({ [ISO_TARGETS.placements]: { items: pieces } });

    // The same cell on two floors is two different pieces, not an overlap.
    expect(getIsoActivePlacements(state)).toHaveLength(2);
    const model = buildIsoSceneModelFromState(state);
    expect(model.items).toHaveLength(2);
    const [back, front] = model.items;
    expect(back!.placement.floor).toBe(0);
    expect(front!.placement.floor).toBe(2);
    // The first floor lies furthest away, so it is drawn higher up and first.
    expect(back!.imageRect!.y).toBeLessThan(front!.imageRect!.y);
  });

  it("draws the tower as one receding field, nearest piece last", () => {
    // One piece per floor: the far corner of the first floor, the near corner
    // of the last one, and a middle floor cell between them.
    const pieces = [
      at("maki", ZONE - 1, ZONE - 1, "1x1", 2),
      at("nigiri", 1, 1, "1x1", 1),
      at("maki", 0, 0, "1x1", 0),
    ];
    const state = stacked({ [ISO_TARGETS.placements]: { items: pieces } });
    const items = buildIsoSceneModelFromState(state).items;

    // Painted from the furthest zone to the nearest, exactly like one field.
    expect(items.map((item) => item.placement.floor)).toEqual([0, 1, 2]);
    // Each next piece is drawn lower on screen, so it overlaps the one before.
    const tops = items.map((item) => item.imageRect!.y);
    expect(tops[0]!).toBeLessThan(tops[1]!);
    expect(tops[1]!).toBeLessThan(tops[2]!);
  });

  it("keeps a later floor in front of the one before it at the seam", () => {
    // The last floor's far corner cell is the rhombus it gave up, so the
    // pieces it does own there must be painted after the earlier floor's.
    const pieces = [
      at("maki", ZONE - 1, ZONE - 1, "1x1", 0),
      at("nigiri", 1, 0, "1x1", 1),
      at("maki", 0, 1, "1x1", 1),
    ];
    const state = stacked({ [ISO_TARGETS.placements]: { items: pieces } });
    const items = buildIsoSceneModelFromState(state).items;

    expect(items.map((item) => item.placement.floor)).toEqual([0, 1, 1]);
  });

  it("stores pieces of floors above the current count and brings them back", () => {
    const pieces = [at("maki", ZONE - 1, ZONE - 1, "1x1", 4)];
    const short = stacked({ [ISO_TARGETS.gridFloors]: 2, [ISO_TARGETS.placements]: { items: pieces } });
    const tall = stacked({ [ISO_TARGETS.gridFloors]: 6, [ISO_TARGETS.placements]: { items: pieces } });

    expect(getIsoActivePlacements(short)).toHaveLength(0);
    expect(getIsoOffGridPlacements(short)).toHaveLength(1);
    expect(getIsoActivePlacements(tall)).toHaveLength(1);
  });

  it("runs one wave through the whole tower instead of repeating it per floor", () => {
    const waving = stacked({
      [ISO_TARGETS.reliefMax]: 4,
      [ISO_TARGETS.reliefPattern]: "corner-diagonal",
      [ISO_TARGETS.reliefWave]: true,
      [ISO_TARGETS.reliefWaveLength]: 6,
    });
    const { heights } = getIsoReliefLayers(waving);
    const cornerOf = (floor: number) => heights.get(floor === 0 ? "0,0" : `0,0@${floor}`) ?? 0;

    // The same cell of different floors sits at a different point of the wave.
    expect(new Set([cornerOf(0), cornerOf(1), cornerOf(2)]).size).toBeGreaterThan(1);
  });

  it("runs one pattern over the whole tower instead of repeating it per floor", () => {
    const { heights } = getIsoReliefLayers(stacked(SLOPE));

    // The slope is measured from the corner of the whole tower, so the same
    // cell sits further down it on every next floor instead of starting over.
    expect(heights.get("1,1")).toBe(2);
    expect(heights.get("2,2")).toBe(1);
    expect(heights.get("1,1@2") ?? 0).toBe(0);
    expectsOneField(SLOPE);
  });

  it("waves over the tower exactly as over one field of the same span", () => {
    expectsOneField({
      ...SLOPE,
      [ISO_TARGETS.reliefWave]: true,
      [ISO_TARGETS.reliefWaveLength]: 6,
    });
  });

  it("caps a stacked relief at the gap between floors", () => {
    const tall = stacked({ [ISO_TARGETS.reliefMax]: 8, [ISO_TARGETS.reliefPattern]: "corner-rings" });
    const { heights } = getIsoReliefLayers(tall);
    const input = readIsoSceneInput(tall);
    const fitting = Math.floor(
      getIsoFloorOffset(input.gridSize, input.cellSize) / input.levelHeight,
    );

    // A column may not grow through the floor above it.
    expect(Math.max(...heights.values())).toBeLessThanOrEqual(fitting);
    expect(fitting).toBeGreaterThan(0);

    // The classic layout keeps the peak the panel asks for.
    const classic = createState({ [ISO_TARGETS.reliefMax]: 8, [ISO_TARGETS.reliefPattern]: "corner-rings" });
    expect(Math.max(...getIsoReliefLayers(classic).heights.values())).toBe(8);
  });

  it("keeps a classic field byte-for-byte on the ground", () => {
    const pieces = [at("maki", 1, 1), at("nigiri", 2, 2)];
    const state = createState(
      { [ISO_TARGETS.placements]: { items: pieces } },
      [asset("maki"), asset("nigiri")],
    );
    const model = buildIsoSceneModelFromState(state);

    expect(readIsoSceneInput(state).floors).toBe(1);
    expect(model.items.every((item) => item.placement.floor === 0)).toBe(true);
    expect(model.field).toEqual(
      getFieldBounds(getIsoGridSize(state.values), readIsoSceneInput(state).cellSize),
    );
    expect(record("maki").name).toBe("maki");
  });
});
