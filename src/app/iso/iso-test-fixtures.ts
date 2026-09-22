import { vi } from "vitest";

import type {
  ToolcraftCommand,
  ToolcraftProductExportFrameContext,
  ToolcraftRendererPipelineClient,
} from "@/toolcraft/runtime";
import type { ToolcraftPanelActionContext } from "@/toolcraft/runtime/react";

import { handleIsoPanelAction } from "./iso-actions";
import { isoRasterFrameRenderer } from "./iso-export";
import type { IsoFieldContext } from "./iso-field";
import type { IsoObjectRecord, IsoPlacement } from "./iso-geometry";
import { getIsoColumnSpace } from "./iso-scene-model";
import {
  buildIsoSceneModelFromState,
  getIsoActiveObjectId,
  getIsoActivePlacements,
  getIsoLibraryObjects,
  getIsoGridSize,
  getIsoOffGridPlacements,
  getIsoReliefLayers,
  readIsoPlacements,
  readIsoSceneInput,
  readIsoTool,
  ISO_DEFAULTS,
  ISO_TARGETS,
  type IsoStateSource,
} from "./iso-state";

/** Shared state builders for the sushi set acceptance tests. */
export type TestAsset = IsoStateSource["mediaAssets"][number] & { resourceRef: string };

export const size = { height: 150, width: 100 };

export function asset(id: string): TestAsset {
  return {
    assetKind: "file",
    fileName: `${id}.png`,
    id,
    resourceRef: `ref-${id}`,
    sourceTarget: ISO_TARGETS.libraryFiles,
  };
}

export function record(name: string, patch: Partial<IsoObjectRecord> = {}): IsoObjectRecord {
  return { anchor: { x: 0.5, y: 0.9 }, footprint: "1x1", name, scale: 1, size, ...patch };
}

export function at(objectId: string, col: number, row: number, footprint: IsoPlacement["footprint"] = "1x1"): IsoPlacement {
  return { col, footprint, id: `${objectId}@${col},${row}`, objectId, row };
}

export function createState(
  values: Record<string, unknown> = {},
  assets: readonly TestAsset[] = [asset("maki"), asset("nigiri")],
): IsoStateSource & { mediaAssets: readonly TestAsset[] } {
  return {
    mediaAssets: assets,
    values: {
      [ISO_TARGETS.cellSize]: 100,
      [ISO_TARGETS.crop]: ISO_DEFAULTS.crop,
      [ISO_TARGETS.gridCols]: ISO_DEFAULTS.gridCols,
      [ISO_TARGETS.gridRows]: ISO_DEFAULTS.gridRows,
      [ISO_TARGETS.gridVisible]: true,
      [ISO_TARGETS.includeBackground]: false,
      [ISO_TARGETS.includeGrid]: false,
      [ISO_TARGETS.libraryObjects]: {
        activeId: null,
        items: { maki: record("maki"), nigiri: record("nigiri") },
      },
      [ISO_TARGETS.padding]: 10,
      [ISO_TARGETS.placements]: { items: [] },
      [ISO_TARGETS.levelHeight]: 50,
      [ISO_TARGETS.tool]: "place",
      ...values,
    },
  };
}

export function withPlacements(items: readonly IsoPlacement[], values: Record<string, unknown> = {}) {
  return createState({ [ISO_TARGETS.placements]: { items }, ...values });
}

export function fieldContext(state: ReturnType<typeof createState>): IsoFieldContext {
  const activeId = getIsoActiveObjectId(state);
  const input = readIsoSceneInput(state);
  return {
    active: getIsoLibraryObjects(state).find((object) => object.id === activeId) ?? null,
    cellSize: input.cellSize,
    gridSize: input.gridSize,
    model: buildIsoSceneModelFromState(state),
    offGrid: getIsoOffGridPlacements(state),
    placements: getIsoActivePlacements(state),
    relief: getIsoReliefLayers(state),
    selection: null,
    space: getIsoColumnSpace(input),
    tool: readIsoTool(state.values),
  };
}

export function placedIds(command: ToolcraftCommand | null): string[] {
  if (!command || command.type !== "controls.setValue") return [];
  return readIsoPlacements({ [ISO_TARGETS.placements]: command.value }).map((item) => item.id);
}

/** Hand edits value from a `levels[row][col]` matrix of offsets. */
export function editsValue(levels: readonly (readonly number[])[]) {
  const cells: Record<string, number> = {};
  levels.forEach((row, rowIndex) =>
    row.forEach((level, colIndex) => {
      if (level !== 0) cells[`${colIndex},${rowIndex}`] = level;
    }),
  );
  return { cells };
}

/** State after a `controls.setValue` command. */
export function applyCommand<State extends IsoStateSource>(
  state: State,
  command: ToolcraftCommand | null | undefined,
): State {
  if (command?.type !== "controls.setValue") return state;
  return { ...state, values: { ...state.values, [command.target]: command.value } };
}

/** `levels[row][col]` matrix of the final column heights. */
export function heightMatrix(state: IsoStateSource): number[][] {
  const { heights } = getIsoReliefLayers(state);
  const gridSize = getIsoGridSize(state.values);
  return Array.from({ length: gridSize.rows }, (_, row) =>
    Array.from({ length: gridSize.cols }, (_, col) => heights.get(`${col},${row}`) ?? 0),
  );
}

/** Final heights of a pattern on an otherwise empty field. */
export function reliefLevels(values: Record<string, unknown>, cols = 5, rows = cols): number[][] {
  return heightMatrix(createState({ ...gridOf(cols, rows), ...values }));
}

/** Grid size values for `cols` × `rows` cells (square by default). */
export function gridOf(cols: number, rows = cols): Record<string, number> {
  return { [ISO_TARGETS.gridCols]: cols, [ISO_TARGETS.gridRows]: rows };
}

export function runAction(value: string, state: ReturnType<typeof createState>) {
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

export function createRecordingContext() {
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

export async function exportFrame(
  state: IsoStateSource,
  pixelRatio = 2,
  timelineProgress = 0,
) {
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
    timelineProgress,
  } as unknown as ToolcraftProductExportFrameContext);
  return recording;
}
