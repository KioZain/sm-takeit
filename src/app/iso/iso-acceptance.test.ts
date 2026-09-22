import { describe, expect, it } from "vitest";


import { appSchema } from "../app-schema";
import { isoRasterFrameRenderer } from "./iso-export";
import { getIsoCellCommand, getIsoHeightStepCommand } from "./iso-field";
import { normalizeCellRect } from "./iso-geometry";
import { buildIsoSceneModel } from "./iso-scene-model";
import {
  buildIsoSceneModelFromState,
  createIsoSelectionCommand,
  getIsoActiveObjectId,
  getIsoActivePlacements,
  getIsoCompositionSummary,
  getIsoLibraryObjects,
  readIsoGridVisible,
  readIsoPlacements,
  readIsoSceneInput,
  ISO_ACTIONS,
  ISO_TARGETS,
} from "./iso-state";
import {
  asset,
  at,
  createState,
  exportFrame,
  fieldContext,
  applyCommand,
  heightMatrix,
  placedIds,
  record,
  runAction,
  size,
  withPlacements,
  gridOf,
} from "./iso-test-fixtures";

function sectionControls(id: string) {
  return appSchema.panels.controls?.sections.find((section) => section.id === id)?.controls ?? {};
}

describe("sushi set acceptance", () => {
  it("declares production reload coverage for the generated product schema", () => {
    expect(appSchema.persistence.storage).toBe("localStorage");
    if (appSchema.persistence.storage === "localStorage") {
      expect(appSchema.persistence.include).toEqual(
        expect.arrayContaining(["canvas", "media", "panels", "values"]),
      );
    }
  });

  it("background inclusion keeps the set foreground transparent", async () => {
    const state = withPlacements([at("maki", 0, 0)], { [ISO_TARGETS.includeBackground]: true });
    const { calls } = await exportFrame(state);
    expect(calls).not.toContain("fillRect");
    expect(Object.values(sectionControls("runtime.setup")).map((control) => control.target)).toContain(
      ISO_TARGETS.includeBackground,
    );
  });

  it("background colour is painted behind the exported set", () => {
    const setupTargets = Object.values(sectionControls("runtime.setup")).map((control) => control.target);
    expect(setupTargets).toEqual(expect.arrayContaining([ISO_TARGETS.includeBackground, ISO_TARGETS.background]));
  });

  it("grid width sets the cell count along the right side", () => {
    const model = (cols: unknown, rows: unknown) =>
      buildIsoSceneModelFromState(
        createState({ [ISO_TARGETS.gridCols]: cols, [ISO_TARGETS.gridRows]: rows }),
      );
    // Width 2, length 3: the field spans (2 + 3) half-cells across and down.
    expect(model(2, 3).field).toEqual({ height: 125, width: 250, x: -150, y: 0 });
    expect(model(5, 6).field).toEqual({ height: 275, width: 550, x: -300, y: 0 });
    // Out-of-range and fractional values clamp to 1…8 whole cells.
    expect(model(0, 1).field.width).toBe(100);
    expect(model(12, 8).field.width).toBe(800);
    expect(model(4.6, 1).field.width).toBe(300);
    // A flat w×l field has 2·w·l + w + l guide edges.
    expect(model(2, 3).guide).toHaveLength(2 * 6 + 5);
    expect(model(8, 8).guide).toHaveLength(144);
  });

  it("grid length sets the cell count along the left side", () => {
    // Placing is bounded by each axis separately.
    const wide = createState({ ...gridOf(5, 2), [ISO_TARGETS.libraryObjects]: { activeId: "maki", items: { maki: record("maki") } } });
    expect(placedIds(getIsoCellCommand(fieldContext(wide), { col: 4, row: 1 }, null))).toEqual(["maki@4,1"]);
    expect(getIsoCellCommand(fieldContext(wide), { col: 1, row: 2 }, null)).toBeNull();

    // Shrinking hides pieces outside the field; edits keep them for regrowth.
    const pieces = [at("maki", 0, 0), at("nigiri", 5, 5), at("maki", 3, 0, "2x2")];
    const shrunk = withPlacements(pieces, gridOf(4, 2));
    expect(getIsoActivePlacements(shrunk).map((item) => item.id)).toEqual(["maki@0,0"]);
    const placed = getIsoCellCommand(fieldContext(shrunk), { col: 1, row: 1 }, null);
    expect(placedIds(placed)).toEqual(["maki@0,0", "maki@1,1", "nigiri@5,5", "maki@3,0"]);
    const regrown = withPlacements(
      readIsoPlacements({ [ISO_TARGETS.placements]: placed?.type === "controls.setValue" ? placed.value : null }),
      gridOf(6),
    );
    expect(getIsoActivePlacements(regrown)).toHaveLength(4);
  });

  it("cell size scales the projected field", () => {
    const model = buildIsoSceneModelFromState(createState({ [ISO_TARGETS.cellSize]: 50 }));
    expect(model.field).toEqual({ height: 150, width: 300, x: -150, y: 0 });
  });

  it("grid visibility toggles the dashed lines", () => {
    expect(readIsoGridVisible(createState().values)).toBe(true);
    expect(readIsoGridVisible(createState({ [ISO_TARGETS.gridVisible]: false }).values)).toBe(false);
    expect(buildIsoSceneModelFromState(createState()).guide).toHaveLength(84);
  });

  it("library uploads become objects and removal clears their pieces", () => {
    const uploaded = createState({ [ISO_TARGETS.libraryObjects]: { activeId: null, items: {} } }, [asset("uramaki")]);
    expect(getIsoLibraryObjects(uploaded)[0]?.record).toMatchObject({
      anchor: { x: 0.5, y: 0.9 },
      footprint: "1x1",
      name: "uramaki",
      scale: 1,
    });
    const removed = createState(
      { [ISO_TARGETS.placements]: { items: [at("maki", 0, 0), at("nigiri", 1, 0)] } },
      [asset("nigiri")],
    );
    expect(getIsoActivePlacements(removed).map((item) => item.objectId)).toEqual(["nigiri"]);
  });

  it("object settings change only the selected object's pieces", () => {
    const placements = [at("maki", 0, 0), at("nigiri", 2, 0)];
    const before = buildIsoSceneModelFromState(withPlacements(placements));
    const after = buildIsoSceneModelFromState(
      withPlacements(placements, {
        [ISO_TARGETS.libraryObjects]: {
          activeId: "maki",
          items: { maki: record("maki", { anchor: { x: 0.2, y: 0.5 }, scale: 2 }), nigiri: record("nigiri") },
        },
      }),
    );
    const rect = (model: typeof before, objectId: string) =>
      model.items.find((item) => item.placement.objectId === objectId)?.imageRect;
    expect(rect(after, "maki")).not.toEqual(rect(before, "maki"));
    expect(rect(after, "nigiri")).toEqual(rect(before, "nigiri"));
  });

  it("active object selection decides which object is placed", () => {
    const first = createState();
    const chosen = createState({
      [ISO_TARGETS.libraryObjects]: { activeId: "nigiri", items: { maki: record("maki"), nigiri: record("nigiri") } },
    });
    expect(getIsoActiveObjectId(first)).toBe("maki");
    expect(placedIds(getIsoCellCommand(fieldContext(chosen), { col: 1, row: 1 }, null))).toEqual(["nigiri@1,1"]);
    expect(getIsoActiveObjectId(createState({}, [asset("nigiri"), asset("maki")]))).toBe("nigiri");
  });

  it("tool mode decides what a cell click does", () => {
    const state = withPlacements([at("maki", 1, 1)]);
    const cell = { col: 1, row: 1 };
    expect(getIsoCellCommand(fieldContext({ ...state, values: { ...state.values, [ISO_TARGETS.tool]: "place" } }), cell, null)).toBeNull();
    expect(placedIds(getIsoCellCommand(fieldContext({ ...state, values: { ...state.values, [ISO_TARGETS.tool]: "erase" } }), cell, null))).toEqual([]);
    expect(getIsoCellCommand(fieldContext({ ...state, values: { ...state.values, [ISO_TARGETS.tool]: "select" } }), cell, null)).toBeNull();
    const height = fieldContext({ ...state, values: { ...state.values, [ISO_TARGETS.tool]: "height" } });
    expect(getIsoCellCommand(height, cell, null)).toBeNull();
    const raised = applyCommand(state, getIsoHeightStepCommand(height, cell, 1));
    expect(heightMatrix(raised)[1]![1]).toBe(1);
  });

  it("field commands fill a section, fill the field, and clear it", () => {
    const selected = createState({
      [ISO_TARGETS.libraryObjects]: {
        activeId: "maki",
        items: { maki: record("maki", { footprint: "2x1" }), nigiri: record("nigiri") },
      },
      [ISO_TARGETS.selection]: { col0: 0, col1: 2, row0: 0, row1: 1 },
    });
    expect(placedIds(runAction(ISO_ACTIONS.fillSelection, selected).dispatched[0] ?? null)).toEqual([
      "maki@0,0",
      "maki@0,1",
    ]);
    expect(placedIds(runAction(ISO_ACTIONS.fillField, selected).dispatched[0] ?? null)).toHaveLength(18);
    expect(placedIds(runAction(ISO_ACTIONS.clearField, withPlacements([at("maki", 0, 0)])).dispatched[0] ?? null)).toEqual([]);
    expect(runAction(ISO_ACTIONS.fillSelection, createState()).reportFeedback).toHaveBeenCalledOnce();
  });

  it("composition summary counts pieces per object", () => {
    const summary = getIsoCompositionSummary(withPlacements([at("maki", 0, 0), at("maki", 1, 0), at("nigiri", 2, 0)]));
    expect(summary).toEqual({
      rows: [
        { count: 2, id: "maki", name: "maki" },
        { count: 1, id: "nigiri", name: "nigiri" },
      ],
      total: 3,
    });
  });

  it("place tool fills only valid footprints", () => {
    const state = withPlacements([at("nigiri", 2, 2)], {
      [ISO_TARGETS.libraryObjects]: {
        activeId: "maki",
        items: { maki: record("maki", { footprint: "2x2" }), nigiri: record("nigiri") },
      },
    });
    const field = fieldContext(state);
    expect(placedIds(getIsoCellCommand(field, { col: 0, row: 0 }, null))).toEqual(["nigiri@2,2", "maki@0,0"]);
    expect(getIsoCellCommand(field, { col: 1, row: 1 }, null)).toBeNull();
    expect(getIsoCellCommand(field, { col: 5, row: 5 }, null)).toBeNull();
  });

  it("section selection normalizes a dragged cell rectangle", () => {
    const rect = normalizeCellRect({ col: 4, row: 1 }, { col: 2, row: 3 });
    expect(rect).toEqual({ col0: 2, col1: 4, row0: 1, row1: 3 });
    expect(createIsoSelectionCommand(rect)).toMatchObject({ history: "skip", target: ISO_TARGETS.selection, value: rect });
  });

  it("eraser removes a clicked object or the selected section", () => {
    const state = withPlacements([at("maki", 0, 0), at("maki", 1, 0), at("nigiri", 4, 4)], {
      [ISO_TARGETS.tool]: "erase",
    });
    const field = fieldContext(state);
    expect(placedIds(getIsoCellCommand(field, { col: 4, row: 4 }, null))).toEqual(["maki@0,0", "maki@1,0"]);
    const withSelection = { ...field, selection: { col0: 0, col1: 1, row0: 0, row1: 0 } };
    expect(placedIds(getIsoCellCommand(withSelection, { col: 1, row: 0 }, null))).toEqual(["nigiri@4,4"]);
  });

  it("crop modes frame the field or the content", () => {
    const placements = [at("maki", 0, 0)];
    const off = buildIsoSceneModelFromState(withPlacements(placements, { [ISO_TARGETS.crop]: "off" }));
    const field = buildIsoSceneModelFromState(withPlacements(placements, { [ISO_TARGETS.crop]: "field" }));
    const content = buildIsoSceneModelFromState(withPlacements(placements, { [ISO_TARGETS.crop]: "content" }));
    expect(field.frame.width).toBe(off.frame.width - 4 + 20);
    expect(content.frame.width).toBeLessThan(field.frame.width);
  });

  it("crop padding grows the frame on every side", () => {
    const placements = [at("maki", 0, 0)];
    const values = { [ISO_TARGETS.crop]: "content" };
    const tight = buildIsoSceneModelFromState(withPlacements(placements, { ...values, [ISO_TARGETS.padding]: 0 }));
    const padded = buildIsoSceneModelFromState(withPlacements(placements, { ...values, [ISO_TARGETS.padding]: 30 }));
    expect(padded.frame.width - tight.frame.width).toBe(60);
    expect(padded.frame.height - tight.frame.height).toBe(60);
  });

  it("show rolls hides every piece from the preview and export", async () => {
    const values = { [ISO_TARGETS.crop]: "content", [ISO_TARGETS.includeGrid]: true };
    const shown = withPlacements([at("maki", 0, 0)], values);
    const hidden = withPlacements([at("maki", 0, 0)], { ...values, [ISO_TARGETS.showPieces]: false });
    expect((await exportFrame(shown)).images).toHaveLength(1);
    const exported = await exportFrame(hidden);
    expect(exported.images).toEqual([]);
    expect(exported.calls).toContain("stroke");
    // Hidden pieces stay placed, and the content frame falls back to the grid.
    expect(getIsoActivePlacements(hidden)).toHaveLength(1);
    const model = buildIsoSceneModelFromState(hidden);
    expect(model.piecesVisible).toBe(false);
    expect(model.frame.width).toBe(model.field.width + 20);
  });

  it("grid can be included in the export", async () => {
    const state = withPlacements([at("maki", 0, 0)], { [ISO_TARGETS.crop]: "content" });
    expect((await exportFrame(state)).calls).not.toContain("stroke");
    const included = withPlacements([at("maki", 0, 0)], { [ISO_TARGETS.crop]: "content", [ISO_TARGETS.includeGrid]: true });
    expect((await exportFrame(included)).calls).toContain("stroke");
    expect(buildIsoSceneModelFromState(included).frame.width).toBeGreaterThan(buildIsoSceneModelFromState(state).frame.width);
  });

  it("image format options remain selectable", () => {
    const format = Object.values(sectionControls("runtime.image-export")).find((control) => control.target === "export.image.format");
    expect(format && "options" in format ? format.options?.map((option) => option.value) : []).toEqual(["png", "jpg"]);
  });

  it("image resolution options remain selectable", () => {
    const resolution = Object.values(sectionControls("runtime.image-export")).find(
      (control) => control.target === "export.image.resolution",
    );
    expect(resolution && "options" in resolution ? resolution.options?.map((option) => option.value) : []).toEqual(["2k", "4k", "8k"]);
  });

  it("image export renders the placed set", async () => {
    const state = withPlacements([at("maki", 0, 0), at("nigiri", 1, 1)]);
    const model = buildIsoSceneModelFromState(state);
    const { calls, images } = await exportFrame(state);
    expect(calls).toContain(`translate:${-model.center.x},${-model.center.y}`);
    expect(images).toEqual(model.items.map((item) => [item.imageRect!.x, item.imageRect!.y, item.imageRect!.width, item.imageRect!.height]));
  });

  it("sushi set scene bounds stay centred on the origin", () => {
    const model = buildIsoSceneModelFromState(withPlacements([at("maki", 5, 0, "1x2")]));
    expect(model.worldFrame.x).toBe(-model.worldFrame.width / 2);
    expect(model.worldFrame.y).toBe(-model.worldFrame.height / 2);
  });

  it("infinity export crops to the set frame", () => {
    const input = readIsoSceneInput(withPlacements([at("maki", 0, 0)], { [ISO_TARGETS.crop]: "content" }));
    const model = buildIsoSceneModel(input);
    expect(model.worldFrame.width).toBe(model.frame.width);
    expect(model.worldFrame.height).toBe(model.frame.height);
    expect(model.frame.width).toBeLessThan(model.field.width);
  });
});
