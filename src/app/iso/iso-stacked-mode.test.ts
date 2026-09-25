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
    expect(three.guide).toHaveLength(SEGMENTS_PER_ZONE * 3);
    expect(three.field.width).toBeCloseTo(one.field.width);
    expect(three.field.height).toBeCloseTo(one.field.height + 2 * offset);
  });

  it("overlaps neighbouring floors by exactly half a zone", () => {
    const input = readIsoSceneInput(stacked());
    const zoneHeight = getFieldBounds(input.gridSize, input.cellSize).height;
    const stack = getIsoStack(input.gridSize, input.cellSize, input.floors);

    expect(stack.floors).toBe(3);
    expect(stack.offset).toBeCloseTo(zoneHeight / 2);
  });

  it("places pieces on their own floor and keeps them apart", () => {
    const pieces = [at("maki", 1, 1, "1x1", 0), at("maki", 1, 1, "1x1", 2)];
    const state = stacked({ [ISO_TARGETS.placements]: { items: pieces } });

    // The same cell on two floors is two different pieces, not an overlap.
    expect(getIsoActivePlacements(state)).toHaveLength(2);
    const model = buildIsoSceneModelFromState(state);
    expect(model.items).toHaveLength(2);
    const [ground, top] = model.items;
    expect(top!.placement.floor).toBe(2);
    // The upper piece is drawn higher and later, so it overlaps the lower one.
    expect(top!.imageRect!.y).toBeLessThan(ground!.imageRect!.y);
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
