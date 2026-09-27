import { describe, expect, it } from "vitest";

import { getFieldBounds } from "./iso-geometry";
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

/** One dashed zone contributes two cell edges per cell plus its two far borders. */
const SEGMENTS_PER_ZONE = 2 * ZONE * ZONE + ZONE + ZONE;

/**
 * A raised floor hands its near corner cell to the floor below, which already
 * draws that rhombus: two cell edges and two border edges less.
 */
const SEGMENTS_PER_RAISED_ZONE = SEGMENTS_PER_ZONE - 4;

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

  it("overlaps neighbouring floors by exactly one cell", () => {
    const input = readIsoSceneInput(stacked());
    const zoneHeight = getFieldBounds(input.gridSize, input.cellSize).height;
    const stack = getIsoStack(input.gridSize, input.cellSize, input.floors);

    expect(stack.floors).toBe(3);
    expect(stack.offset).toBeCloseTo(((ZONE - 1) * input.cellSize) / 2);
    // One cell of the zone's own height stays inside the floor below.
    expect(zoneHeight - stack.offset).toBeCloseTo(input.cellSize / 2);
  });

  it("gives the shared corner cell to the floor below", () => {
    const pieces = [at("maki", ZONE - 1, ZONE - 1, "1x1", 1), at("maki", 0, 0, "1x1", 0)];
    const state = stacked({ [ISO_TARGETS.placements]: { items: pieces } });

    // Both would stand in the same rhombus, so the raised floor gives it up.
    const active = getIsoActivePlacements(state);
    expect(active).toHaveLength(1);
    expect(active[0]!.floor).toBe(0);
    // The refused piece is stored, not lost.
    expect(getIsoOffGridPlacements(state)).toHaveLength(1);

    // The floor still owns every other cell.
    const beside = stacked({
      [ISO_TARGETS.placements]: { items: [at("maki", ZONE - 2, ZONE - 1, "1x1", 1)] },
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
    expect(back!.placement.floor).toBe(2);
    expect(front!.placement.floor).toBe(0);
    // The upper piece is drawn higher on screen and first, being further back.
    expect(back!.imageRect!.y).toBeLessThan(front!.imageRect!.y);
  });

  it("draws the tower as one receding field, nearest piece last", () => {
    // One piece per floor: the far corner of the top floor, the near corner of
    // the ground floor, and a middle floor cell between them.
    const pieces = [
      at("maki", 0, 0, "1x1", 2),
      at("nigiri", 1, 1, "1x1", 1),
      at("maki", ZONE - 1, ZONE - 1, "1x1", 0),
    ];
    const state = stacked({ [ISO_TARGETS.placements]: { items: pieces } });
    const items = buildIsoSceneModelFromState(state).items;

    // Painted from the furthest zone to the nearest, exactly like one field.
    expect(items.map((item) => item.placement.floor)).toEqual([2, 1, 0]);
    // Each next piece is drawn lower on screen, so it overlaps the one before.
    const tops = items.map((item) => item.imageRect!.y);
    expect(tops[0]!).toBeLessThan(tops[1]!);
    expect(tops[1]!).toBeLessThan(tops[2]!);
  });

  it("keeps a lower floor in front of the floor above at the seam", () => {
    // The ground floor's far corner cell is the rhombus the floor above gave
    // up, so it must be painted after that floor's nearest pieces.
    const pieces = [
      at("maki", ZONE - 2, ZONE - 1, "1x1", 1),
      at("nigiri", ZONE - 1, ZONE - 2, "1x1", 1),
      at("maki", 0, 0, "1x1", 0),
    ];
    const state = stacked({ [ISO_TARGETS.placements]: { items: pieces } });
    const items = buildIsoSceneModelFromState(state).items;

    expect(items.map((item) => item.placement.floor)).toEqual([1, 1, 0]);
  });

  it("stores pieces of floors above the current count and brings them back", () => {
    const pieces = [at("maki", 0, 0, "1x1", 4)];
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

  it("repeats a static relief on every floor and keys it per floor", () => {
    const state = stacked({ [ISO_TARGETS.reliefMax]: 3, [ISO_TARGETS.reliefPattern]: "corner-rings" });
    const { heights } = getIsoReliefLayers(state);

    // A still pattern is the same on each floor, stored under its own key.
    expect(heights.get("0,0")).toBe(heights.get("0,0@2"));
    expect(heights.get("0,0")).toBeGreaterThan(0);
    expect([...heights.keys()].some((key) => key.endsWith("@2"))).toBe(true);
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
