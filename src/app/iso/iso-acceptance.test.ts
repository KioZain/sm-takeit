import { describe, expect, it, vi } from "vitest";

import type {
  ToolcraftCommand,
  ToolcraftProductExportFrameContext,
  ToolcraftRendererPipelineClient,
} from "@/toolcraft/runtime";
import type { ToolcraftPanelActionContext } from "@/toolcraft/runtime/react";

import { appSchema } from "../app-schema";
import { handleIsoPanelAction } from "./iso-actions";
import { isoRasterFrameRenderer } from "./iso-export";
import { getIsoCellCommand, type IsoFieldContext } from "./iso-field";
import {
  buildIsoSceneModel,
  normalizeCellRect,
  type IsoObjectRecord,
  type IsoPlacement,
} from "./iso-geometry";
import { getIsoGridLines } from "./iso-scene";
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
  readIsoTool,
  ISO_ACTIONS,
  ISO_DEFAULTS,
  ISO_TARGETS,
  type IsoStateSource,
} from "./iso-state";

type TestAsset = IsoStateSource["mediaAssets"][number] & { resourceRef: string };

const size = { height: 150, width: 100 };

function asset(id: string): TestAsset {
  return {
    assetKind: "file",
    fileName: `${id}.png`,
    id,
    resourceRef: `ref-${id}`,
    sourceTarget: ISO_TARGETS.libraryFiles,
  };
}

function record(name: string, patch: Partial<IsoObjectRecord> = {}): IsoObjectRecord {
  return { anchor: { x: 0.5, y: 0.9 }, footprint: "1x1", name, scale: 1, size, ...patch };
}

function at(objectId: string, col: number, row: number, footprint: IsoPlacement["footprint"] = "1x1"): IsoPlacement {
  return { col, footprint, id: `${objectId}@${col},${row}`, objectId, row };
}

function createState(
  values: Record<string, unknown> = {},
  assets: readonly TestAsset[] = [asset("maki"), asset("nigiri")],
): IsoStateSource & { mediaAssets: readonly TestAsset[] } {
  return {
    mediaAssets: assets,
    values: {
      [ISO_TARGETS.cellSize]: 100,
      [ISO_TARGETS.crop]: ISO_DEFAULTS.crop,
      [ISO_TARGETS.gridPreset]: ISO_DEFAULTS.gridPreset,
      [ISO_TARGETS.gridVisible]: true,
      [ISO_TARGETS.includeBackground]: false,
      [ISO_TARGETS.includeGrid]: false,
      [ISO_TARGETS.libraryObjects]: {
        activeId: null,
        items: { maki: record("maki"), nigiri: record("nigiri") },
      },
      [ISO_TARGETS.padding]: 10,
      [ISO_TARGETS.placements]: { items: [] },
      [ISO_TARGETS.shadowBlur]: 0,
      [ISO_TARGETS.shadowOffset]: { x: 0, y: 0 },
      [ISO_TARGETS.shadowOpacity]: 30,
      [ISO_TARGETS.tool]: "place",
      ...values,
    },
  };
}

function withPlacements(items: readonly IsoPlacement[], values: Record<string, unknown> = {}) {
  return createState({ [ISO_TARGETS.placements]: { items }, ...values });
}

function fieldContext(state: ReturnType<typeof createState>): IsoFieldContext {
  const activeId = getIsoActiveObjectId(state);
  const input = readIsoSceneInput(state);
  return {
    active: getIsoLibraryObjects(state).find((object) => object.id === activeId) ?? null,
    cellSize: input.cellSize,
    gridSize: input.gridSize,
    model: buildIsoSceneModelFromState(state),
    placements: getIsoActivePlacements(state),
    selection: null,
    tool: readIsoTool(state.values),
  };
}

function placedIds(command: ToolcraftCommand | null): string[] {
  if (!command || command.type !== "controls.setValue") return [];
  return readIsoPlacements({ [ISO_TARGETS.placements]: command.value }).map((item) => item.id);
}

function runAction(value: string, state: ReturnType<typeof createState>) {
  const dispatch = vi.fn<(command: ToolcraftCommand) => void>();
  const reportFeedback = vi.fn();
  handleIsoPanelAction({
    action: { value },
    dispatch,
    reportFeedback,
    state,
  } as unknown as ToolcraftPanelActionContext);
  return { dispatched: dispatch.mock.calls.map(([command]) => command), reportFeedback };
}

function createRecordingContext() {
  const calls: string[] = [];
  const images: number[][] = [];
  const context = {
    beginPath: () => calls.push("beginPath"),
    closePath: () => undefined,
    drawImage: (_image: unknown, x: number, y: number, width: number, height: number) =>
      images.push([x, y, width, height]),
    fill: () => calls.push("fill"),
    fillRect: () => calls.push("fillRect"),
    lineTo: () => undefined,
    moveTo: () => undefined,
    restore: () => calls.push("restore"),
    save: () => calls.push("save"),
    set filter(value: string) {
      calls.push(`filter:${value}`);
    },
    set globalAlpha(value: number) {
      calls.push(`alpha:${value}`);
    },
    setLineDash: () => calls.push("dash"),
    stroke: () => calls.push("stroke"),
    translate: (x: number, y: number) => calls.push(`translate:${x},${y}`),
  };
  return { calls, context, images };
}

async function exportFrame(state: ReturnType<typeof createState>, pixelRatio = 2) {
  const recording = createRecordingContext();
  const store = {
    dispose: () => undefined,
    load: async () => ({ bitmap: {}, ...size }),
    register: () => undefined,
    unregister: () => undefined,
  };
  const pipeline = {
    runPass: async (
      _pass: unknown,
      _input: unknown,
      work: (context: { getOrCreateResource: () => Promise<typeof store> }) => unknown,
    ) => work({ getOrCreateResource: async () => store }),
  } as unknown as ToolcraftRendererPipelineClient;
  await isoRasterFrameRenderer.renderFrame({
    context: recording.context,
    pixelRatio,
    rendererPipeline: pipeline,
    signal: new AbortController().signal,
    state,
  } as unknown as ToolcraftProductExportFrameContext);
  return recording;
}

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

  it("grid presets rebuild the rhombus field", () => {
    const small = buildIsoSceneModelFromState(createState({ [ISO_TARGETS.gridPreset]: "6" }));
    const large = buildIsoSceneModelFromState(createState({ [ISO_TARGETS.gridPreset]: "12" }));
    expect(small.field.width).toBe(600);
    expect(large.field.width).toBe(1200);
    expect(getIsoGridLines(12, 100)).toHaveLength(26);
  });

  it("cell size scales the projected field", () => {
    const model = buildIsoSceneModelFromState(createState({ [ISO_TARGETS.cellSize]: 50 }));
    expect(model.field).toEqual({ height: 150, width: 300, x: -150, y: 0 });
  });

  it("grid visibility toggles the dashed lines", () => {
    expect(readIsoGridVisible(createState().values)).toBe(true);
    expect(readIsoGridVisible(createState({ [ISO_TARGETS.gridVisible]: false }).values)).toBe(false);
    expect(getIsoGridLines(6, 100)).toHaveLength(14);
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

  it("shadow opacity scales the shadow layer", () => {
    const placements = [at("maki", 0, 0)];
    expect(readIsoSceneInput(withPlacements(placements, { [ISO_TARGETS.shadowOpacity]: 45 })).shadow.opacity).toBe(0.45);
    expect(buildIsoSceneModelFromState(withPlacements(placements, { [ISO_TARGETS.shadowOpacity]: 0 })).shadowPolygons).toHaveLength(0);
  });

  it("shadow blur expands shadow bounds", async () => {
    const placements = [at("maki", 0, 0)];
    const content = { [ISO_TARGETS.crop]: "content" };
    const sharp = buildIsoSceneModelFromState(withPlacements(placements, { ...content, [ISO_TARGETS.shadowBlur]: 0 }));
    const soft = buildIsoSceneModelFromState(withPlacements(placements, { ...content, [ISO_TARGETS.shadowBlur]: 20 }));
    expect(soft.frame.height).toBeGreaterThan(sharp.frame.height);
    const { calls } = await exportFrame(withPlacements(placements, { [ISO_TARGETS.shadowBlur]: 5 }), 3);
    expect(calls).toContain("filter:blur(15px)");
  });

  it("shadow offset moves every shadow polygon", () => {
    const placements = [at("maki", 0, 0), at("nigiri", 1, 0)];
    const base = buildIsoSceneModelFromState(withPlacements(placements));
    const moved = buildIsoSceneModelFromState(withPlacements(placements, { [ISO_TARGETS.shadowOffset]: { x: 0.5, y: -1 } }));
    moved.shadowPolygons.forEach((polygon, index) => {
      expect(polygon[0]).toEqual({ x: base.shadowPolygons[index]![0]!.x + 25, y: base.shadowPolygons[index]![0]!.y - 50 });
    });
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
