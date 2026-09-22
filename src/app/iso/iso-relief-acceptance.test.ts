import { describe, expect, it } from "vitest";

import { buildIsoSceneModel } from "./iso-scene-model";
import { getIsoCellCommand, moveIsoHeightDrag, startIsoHeightDrag } from "./iso-field";
import {
  buildIsoSceneModelFromState,
  createIsoReliefEditsCommand,
  readIsoReliefEdits,
  readIsoSceneInput,
  ISO_RELIEF_ACTIONS,
  ISO_TARGETS,
} from "./iso-state";
import {
  applyCommand,
  at,
  createState,
  editsValue,
  fieldContext,
  heightMatrix,
  placedIds,
  record,
  reliefLevels,
  runAction,
  withPlacements,
  gridOf,
} from "./iso-test-fixtures";

const corner = { [ISO_TARGETS.reliefPattern]: "corner-diagonal" };
const corner_ = (value: string) => ({ [ISO_TARGETS.reliefCorner]: value, [ISO_TARGETS.reliefPattern]: "corner-rings" });

describe("sushi set relief acceptance", () => {
  it("height tool drags columns with magnetic snapping", () => {
    // Column (2,0) is raised to 3 levels by hand; drag column (0,0) which carries a piece.
    const state = withPlacements([at("maki", 0, 0)], {
      [ISO_TARGETS.reliefEdits]: editsValue([[0, 0, 3]]),
      [ISO_TARGETS.tool]: "height",
    });
    const field = fieldContext(state);
    const gesture = {
      drag: startIsoHeightDrag(field, { col: 0, row: 0 }),
      group: "test",
      pointerId: 1,
      startY: 500,
      unitsPerPixel: 1,
    };
    const none = { altKey: false, shiftKey: false };
    // One level is 50px; 2.9 levels up snaps to the neighbour at 3 and reports it as a guide.
    const snapped = moveIsoHeightDrag(field, gesture, 500 - 145, none);
    expect(snapped.level).toBe(3);
    expect(snapped.guides).toEqual([{ col: 2, row: 0 }]);
    expect(snapped.command).toMatchObject({ history: "merge", historyGroup: "test", target: ISO_TARGETS.reliefEdits });
    expect(moveIsoHeightDrag(field, gesture, 500 - 145, { altKey: true, shiftKey: false }).level).toBe(2.9);
    expect(moveIsoHeightDrag(field, gesture, 500 - 70, { altKey: false, shiftKey: true }).level).toBe(1);
    expect(moveIsoHeightDrag(field, gesture, 900, none).level).toBe(0);

    // The piece rises with its column.
    const raised = applyCommand(state, snapped.command);
    const lift = buildIsoSceneModelFromState(state).items[0]!.imageRect!.y - buildIsoSceneModelFromState(raised).items[0]!.imageRect!.y;
    expect(lift).toBe(150);

    // A 2×2 piece moves all of its columns together, and uneven columns block placing one.
    const wide = withPlacements([at("maki", 0, 0, "2x2")], { [ISO_TARGETS.tool]: "height" });
    expect(startIsoHeightDrag(fieldContext(wide), { col: 1, row: 1 }).cells).toHaveLength(4);
    const uneven = createState({
      [ISO_TARGETS.reliefEdits]: editsValue([[1, 0]]),
      [ISO_TARGETS.libraryObjects]: { activeId: "maki", items: { maki: record("maki", { footprint: "2x1" }) } },
    });
    expect(getIsoCellCommand(fieldContext(uneven), { col: 0, row: 0 }, null)).toBeNull();
    expect(placedIds(getIsoCellCommand(fieldContext(uneven), { col: 0, row: 1 }, null))).toEqual(["maki@0,1"]);
  });

  it("hand edits stay on top of a live pattern", () => {
    // Pattern gives (4,4) level 0; drag it to the level-2 neighbours.
    const state = createState({ ...corner, [ISO_TARGETS.tool]: "height" });
    const field = fieldContext(state);
    const gesture = { drag: startIsoHeightDrag(field, { col: 4, row: 4 }), group: "g", pointerId: 1, startY: 0, unitsPerPixel: 1 };
    const moved = moveIsoHeightDrag(field, gesture, -98, { altKey: false, shiftKey: false });
    expect(moved.level).toBe(2);
    const edited = applyCommand(state, moved.command);
    expect(heightMatrix(edited)[4]![4]).toBe(2);
    expect(readIsoReliefEdits(edited.values).get("4,4")).toBe(2);
    // Lowering the peak keeps the +2 edit over the new pattern level.
    const lower = { ...edited, values: { ...edited.values, [ISO_TARGETS.reliefMax]: 8 } };
    expect(heightMatrix(lower)[4]![4]).toBe(6);
    // Edits never push a column below the ground.
    expect(reliefLevels({ ...corner, [ISO_TARGETS.reliefEdits]: editsValue([[-9]]) })[0]![0]).toBe(0);
    expect(createIsoReliefEditsCommand(new Map([["0,0", 0]]), "Drag")).toMatchObject({ value: { cells: {} } });
  });

  it("relief patterns raise columns live", () => {
    const pattern = (value: string) =>
      reliefLevels({ [ISO_TARGETS.reliefPattern]: value, [ISO_TARGETS.reliefMax]: 2, [ISO_TARGETS.reliefStep]: 1 }, 4);
    expect(pattern("flat")).toEqual([[0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]]);
    expect(pattern("corner-diagonal")).toEqual([[2, 1, 0, 0], [1, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]]);
    expect(pattern("corner-rings")).toEqual([[2, 1, 0, 0], [1, 1, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]]);
    expect(pattern("edge")).toEqual([[2, 1, 0, 0], [2, 1, 0, 0], [2, 1, 0, 0], [2, 1, 0, 0]]);
    expect(pattern("pyramid")).toEqual([[1, 1, 1, 1], [1, 2, 2, 1], [1, 2, 2, 1], [1, 1, 1, 1]]);
    expect(pattern("checker")).toEqual([[2, 0, 2, 0], [0, 2, 0, 2], [2, 0, 2, 0], [0, 2, 0, 2]]);
    expect(pattern("alternate-rows")).toEqual([[2, 2, 2, 2], [0, 0, 0, 0], [2, 2, 2, 2], [0, 0, 0, 0]]);
    expect(pattern("alternate-cols")).toEqual([[2, 0, 2, 0], [2, 0, 2, 0], [2, 0, 2, 0], [2, 0, 2, 0]]);
    // The scene is rebuilt from the pattern without any command.
    const flat = buildIsoSceneModelFromState(createState());
    const raised = buildIsoSceneModelFromState(createState(corner));
    expect(raised.field.y).toBeLessThan(flat.field.y);
    // A 2×1 piece straddling a level change stands on columns levelled to its top.
    const levelled = withPlacements([at("maki", 1, 0, "2x1")], { ...corner, ...gridOf(3), [ISO_TARGETS.reliefStep]: 1 });
    expect(heightMatrix(levelled)).toEqual([[4, 3, 3], [3, 2, 1], [2, 1, 0]]);
  });

  it("relief patterns follow the real corners of a rectangular field", () => {
    const rings = (corner: string) =>
      reliefLevels({ ...corner_(corner), [ISO_TARGETS.reliefStep]: 1, [ISO_TARGETS.reliefMax]: 4 }, 5, 3);
    // Width 5, length 3: the right corner is (4, 0), the bottom corner (4, 2).
    expect(rings("right")[0]![4]).toBe(4);
    expect(rings("bottom")[2]![4]).toBe(4);
    expect(rings("left")[2]![0]).toBe(4);
    const edge = reliefLevels(
      { [ISO_TARGETS.reliefEdge]: "bottom-right", [ISO_TARGETS.reliefPattern]: "edge", [ISO_TARGETS.reliefStep]: 1 },
      5,
      3,
    );
    expect(edge.map((row) => row[4])).toEqual([4, 4, 4]);
    // The pyramid becomes a ridge along the longer side.
    const pyramid = reliefLevels({ [ISO_TARGETS.reliefPattern]: "pyramid", [ISO_TARGETS.reliefStep]: 1 }, 5, 3);
    expect(pyramid[1]).toEqual([3, 4, 4, 4, 3]);
    expect(pyramid[0]).toEqual([3, 3, 3, 3, 3]);
    // A single-cell field still works.
    expect(reliefLevels({ ...corner_("top") }, 1, 1)).toEqual([[4]]);
  });

  it("relief peak corner moves the highest column", () => {
    const peak = (value: string) => {
      const levels = reliefLevels({ ...corner, [ISO_TARGETS.reliefCorner]: value });
      const cells = levels.flatMap((row, rowIndex) => row.map((level, col) => ({ col, level, row: rowIndex })));
      return cells.filter((cell) => cell.level === 4).map(({ col, row }) => [col, row]);
    };
    expect(peak("top")).toContainEqual([0, 0]);
    expect(peak("right")).toContainEqual([4, 0]);
    expect(peak("bottom")).toContainEqual([4, 4]);
    expect(peak("left")).toContainEqual([0, 4]);
    // The example from the request: 5×5, peak in the top corner, two cells per level.
    expect(reliefLevels(corner)).toEqual([
      [4, 4, 3, 3, 2],
      [4, 3, 3, 2, 2],
      [3, 3, 2, 2, 1],
      [3, 2, 2, 1, 1],
      [2, 2, 1, 1, 0],
    ]);
  });

  it("relief edge picks the slope side", () => {
    const side = (edge: string) =>
      reliefLevels({ [ISO_TARGETS.reliefEdge]: edge, [ISO_TARGETS.reliefPattern]: "edge", [ISO_TARGETS.reliefStep]: 1 }, 3);
    expect(side("top-left")[0]).toEqual([4, 3, 2]);
    expect(side("top-right").map((row) => row[0])).toEqual([4, 3, 2]);
    expect(side("bottom-right")[0]).toEqual([2, 3, 4]);
    expect(side("bottom-left").map((row) => row[0])).toEqual([2, 3, 4]);
  });

  it("relief peak height scales applied levels", () => {
    expect(reliefLevels({ ...corner, [ISO_TARGETS.reliefMax]: 2 })[0]![0]).toBe(2);
    expect(reliefLevels({ ...corner, [ISO_TARGETS.reliefMax]: 8 })[0]![0]).toBe(8);
  });

  it("relief falloff widens each level band", () => {
    const band = (step: number) => reliefLevels({ ...corner, [ISO_TARGETS.reliefStep]: step })[0]!;
    expect(band(1)).toEqual([4, 3, 2, 1, 0]);
    expect(band(4)).toEqual([4, 4, 4, 4, 3]);
  });

  it("reset edits clears hand edits in the field or a section", () => {
    const edited = createState({
      ...corner,
      ...gridOf(3),
      [ISO_TARGETS.reliefEdits]: editsValue([[1, 1, 1], [1, 1, 1]]),
      [ISO_TARGETS.reliefStep]: 1,
      [ISO_TARGETS.selection]: { col0: 0, col1: 2, row0: 0, row1: 0 },
    });
    expect(heightMatrix(edited)).toEqual([[5, 4, 3], [4, 3, 2], [2, 1, 0]]);
    const section = applyCommand(edited, runAction(ISO_RELIEF_ACTIONS.resetEdits, edited).dispatched[0]);
    expect(heightMatrix(section)).toEqual([[4, 3, 2], [4, 3, 2], [2, 1, 0]]);
    const whole = { ...edited, values: { ...edited.values, [ISO_TARGETS.selection]: null } };
    const reset = applyCommand(whole, runAction(ISO_RELIEF_ACTIONS.resetEdits, whole).dispatched[0]);
    expect(heightMatrix(reset)).toEqual([[4, 3, 2], [3, 2, 1], [2, 1, 0]]);
  });

  it("solid column mode clips guide lines behind raised columns", () => {
    // A tall column at (1,1) stands in front of the cell (0,0) and hides its top edges.
    const values = { ...gridOf(3), [ISO_TARGETS.reliefEdits]: editsValue([[0, 0, 0], [0, 2, 0]]) };
    // The mode is fixed under the hood (ISO_SOLID_COLUMNS), so it is exercised through the scene input.
    const input = readIsoSceneInput(createState(values));
    const shown = buildIsoSceneModel({ ...input, hideHiddenLines: false });
    const hidden = buildIsoSceneModel({ ...input, hideHiddenLines: true });
    const length = (model: typeof shown) =>
      model.guide.reduce((sum, segment) => sum + Math.hypot(segment.to.x - segment.from.x, segment.to.y - segment.from.y), 0);
    expect(length(hidden)).toBeLessThan(length(shown) - 100);
    const farEdge = (segment: { from: { x: number; y: number }; to: { x: number; y: number } }) =>
      segment.from.x === 0 && segment.from.y === 0;
    expect(shown.guide.some(farEdge)).toBe(true);
    expect(hidden.guide.some(farEdge)).toBe(false);
    // The column's own outline and faces stay whole.
    expect(hidden.guideFaces).toHaveLength(shown.guideFaces.length);
    expect(hidden.frame).toEqual(shown.frame);
  });

  it("level height scales raised columns live", () => {
    const edits = editsValue([[2]]);
    const tall = buildIsoSceneModelFromState(createState({ [ISO_TARGETS.reliefEdits]: edits, [ISO_TARGETS.levelHeight]: 100 }));
    const short = buildIsoSceneModelFromState(createState({ [ISO_TARGETS.reliefEdits]: edits, [ISO_TARGETS.levelHeight]: 25 }));
    expect(tall.field.y).toBe(-200);
    expect(short.field.y).toBe(-50);
    expect(readIsoSceneInput(createState({ [ISO_TARGETS.levelHeight]: 500 })).levelHeight).toBe(100);
  });

});
