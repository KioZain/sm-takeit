import {
  getToolcraftFiniteArtboardRect,
  resolveToolcraftProductSceneFrame,
  resolveToolcraftSceneBounds,
  unionToolcraftSceneRects,
  type ToolcraftProductSceneFrame,
  type ToolcraftProductSceneBoundsProvider,
  type ToolcraftRuntimeSceneVisibility,
  type ToolcraftSceneRect,
} from "../scene";
import { getToolcraftCanvasFrame } from "../state/canvas-frame";
import type { ReadonlyToolcraftState } from "../state/readonly-state";
import { createToolcraftArtifactFrameState } from "./artifact-frame-state";
import { yieldToolcraftArtifactExport } from "./artifact-export-yield";
import type { ToolcraftVideoFrameScheduleEntry } from "./video-frame-schedule";
import {
  resolveToolcraftExportFrame,
  ToolcraftSceneExportError,
  type ToolcraftExportFrame,
  type ToolcraftExportFrameResult,
} from "./export-frame";

type ToolcraftArtifactSceneFrameBaseRequest = Readonly<{
  boundsProvider: ToolcraftProductSceneBoundsProvider | undefined;
  productSceneRequired: boolean;
  visibility: ToolcraftRuntimeSceneVisibility;
}>;

export type ToolcraftStillArtifactSceneFrameRequest =
  ToolcraftArtifactSceneFrameBaseRequest &
    Readonly<{ state: ReadonlyToolcraftState }>;

export type ToolcraftVideoArtifactSceneFrameRequest =
  ToolcraftArtifactSceneFrameBaseRequest &
    Readonly<{
      state: ReadonlyToolcraftState;
      schedule: readonly ToolcraftVideoFrameScheduleEntry[];
      signal: AbortSignal;
      yieldToBrowser?: () => Promise<void>;
    }>;

export type ToolcraftArtifactScenePlan = Readonly<{
  outputFrame: ToolcraftExportFrame;
  productFrame: ToolcraftProductSceneFrame;
}>;

export type ToolcraftVideoArtifactScenePlan = Readonly<{
  /** Only Infinity needs a prepass; never retain evaluated frame states. */
  productFrames: readonly ToolcraftProductSceneFrame[] | null;
  outputFrame: ToolcraftExportFrame;
}>;

function requireFrame(result: ToolcraftExportFrameResult): ToolcraftExportFrame {
  if (!result.ok) {
    throw new ToolcraftSceneExportError(result);
  }

  return result.frame;
}

export function resolveToolcraftArtifactProductFrame(
  state: ReadonlyToolcraftState,
  request: ToolcraftArtifactSceneFrameBaseRequest,
): ToolcraftProductSceneFrame {
  if (!request.productSceneRequired) {
    return { kind: "empty", rect: null };
  }

  const canvas = getToolcraftCanvasFrame(state.canvas);
  const productFrame = resolveToolcraftProductSceneFrame({
    boundsProvider: request.boundsProvider,
    fallbackRect:
      !request.boundsProvider &&
      canvas.kind === "finite"
        ? getToolcraftFiniteArtboardRect(canvas.size)
        : undefined,
    state,
  });

  if (productFrame.kind === "unavailable") {
    throw new ToolcraftSceneExportError({
      code: "scene-bounds-unavailable",
      message: request.boundsProvider
        ? "Product scene bounds are unavailable or invalid."
        : "This infinite product scene does not provide export bounds.",
      ok: false,
    });
  }

  return productFrame;
}

function isFiniteCanvas(state: ReadonlyToolcraftState): boolean {
  return getToolcraftCanvasFrame(state.canvas).kind === "finite";
}

export function resolveToolcraftStillArtifactFrame(
  request: ToolcraftStillArtifactSceneFrameRequest,
): ToolcraftArtifactScenePlan {
  const productFrame = resolveToolcraftArtifactProductFrame(request.state, request);
  const bounds = isFiniteCanvas(request.state)
    ? null
    : resolveToolcraftSceneBounds(
        request.state,
        productFrame.kind === "ready" ? [productFrame.rect] : [],
        request.visibility,
      );
  return {
    outputFrame: requireFrame(
      resolveToolcraftExportFrame(request.state, bounds),
    ),
    productFrame,
  };
}

export async function resolveToolcraftVideoArtifactFrame(
  request: ToolcraftVideoArtifactSceneFrameRequest,
): Promise<ToolcraftVideoArtifactScenePlan> {
  request.signal.throwIfAborted();
  if (request.schedule.length === 0) {
    throw new ToolcraftSceneExportError({
      code: "empty-scene",
      message: "Video export has no scheduled frames.",
      ok: false,
    });
  }
  if (isFiniteCanvas(request.state)) {
    return {
      productFrames: null,
      outputFrame: requireFrame(resolveToolcraftExportFrame(request.state, null)),
    };
  }
  let union: ToolcraftSceneRect | null = null;
  const productFrames: ToolcraftProductSceneFrame[] = [];
  for (const entry of request.schedule) {
    request.signal.throwIfAborted();
    const state = createToolcraftArtifactFrameState(request.state, entry.timeSeconds);
    const productFrame = resolveToolcraftArtifactProductFrame(state, request);
    const result = resolveToolcraftSceneBounds(
      state,
      productFrame.kind === "ready" ? [productFrame.rect] : [],
      request.visibility,
    );
    if (result.ok) {
      union = unionToolcraftSceneRects(union ? [union, result.bounds] : [result.bounds]);
    } else if (result.code !== "empty-scene") {
      throw new ToolcraftSceneExportError(result);
    }
    productFrames.push(productFrame.kind === "ready"
      ? Object.freeze({ ...productFrame, rect: Object.freeze({ ...productFrame.rect }) })
      : Object.freeze({ ...productFrame }));
    await (request.yieldToBrowser ?? yieldToolcraftArtifactExport)();
    request.signal.throwIfAborted();
  }

  return {
    productFrames: Object.freeze(productFrames),
    outputFrame: requireFrame(
      resolveToolcraftExportFrame(
        request.state,
        union,
      ),
    ),
  };
}
