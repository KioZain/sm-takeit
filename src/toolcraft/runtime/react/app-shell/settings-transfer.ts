import type { ResolvedToolcraftAppSchema } from "../../schema/resolved-app-schema";
import {
  createToolcraftSettingsAttachments,
  parseToolcraftSettingsAttachments,
  type ToolcraftSettingsAttachment,
} from "../../source-assets/settings-media";
import type { ToolcraftSourceAssetCoordinator } from "../../source-assets/source-asset-coordinator";
import { collectToolcraftMediaResourceRefs } from "../../source-assets/repository/resource-reachability";
import { isToolcraftCanvasSizingTarget } from "../../schema/runtime-targets";
import { normalizeToolcraftCanvasAspectRatioValue } from "../../state/canvas-state";
import {
  getToolcraftValueControls,
  normalizeToolcraftControlValue,
} from "../../state/control-value-normalization";
import type {
  ToolcraftCommand,
  ToolcraftMediaAsset,
  ToolcraftState,
  ToolcraftTimelineState,
} from "../../state/types";
import {
  parseToolcraftSettingsCanvas,
  type ToolcraftSettingsCanvasPayload,
} from "./settings-transfer-canvas";

const settingsTransferPayloadSource = "toolcraft-settings";
const settingsTransferPayloadVersion = 3;

type ToolcraftDispatch = (command: ToolcraftCommand) => void;
const activeSettingsImports = new WeakSet<ToolcraftDispatch>();

export type ToolcraftSettingsTransferPayload = {
  appId: string;
  attachments: readonly ToolcraftSettingsAttachment[];
  canvas: ToolcraftSettingsCanvasPayload;
  exportedAt: string;
  source: typeof settingsTransferPayloadSource;
  timeline: Pick<
    ToolcraftTimelineState,
    "currentTimeSeconds" | "durationSeconds" | "expanded" | "isLooping"
  > & {
    isPlaying: false;
  };
  values: Record<string, unknown>;
  version: typeof settingsTransferPayloadVersion;
};

type ImportContext = {
  dispatch: ToolcraftDispatch;
  state: ToolcraftState;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isFinitePositiveNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isCanonicalExportTimestamp(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const timestamp = Date.parse(value);
  return (
    Number.isFinite(timestamp) && new Date(timestamp).toISOString() === value
  );
}

function readToolcraftSettingsTimeline(
  value: Record<string, unknown>,
): ToolcraftSettingsTransferPayload["timeline"] | null {
  if (
    Object.keys(value).sort().join("|") !==
      "currentTimeSeconds|durationSeconds|expanded|isLooping|isPlaying" ||
    !isFiniteNumber(value.currentTimeSeconds) ||
    value.currentTimeSeconds < 0 ||
    !isFinitePositiveNumber(value.durationSeconds) ||
    value.currentTimeSeconds > value.durationSeconds ||
    typeof value.expanded !== "boolean" ||
    typeof value.isLooping !== "boolean" ||
    value.isPlaying !== false
  ) {
    return null;
  }

  return {
    currentTimeSeconds: value.currentTimeSeconds,
    durationSeconds: value.durationSeconds,
    expanded: value.expanded,
    isLooping: value.isLooping,
    isPlaying: false,
  };
}

function pickTransferValues(state: ToolcraftState): Record<string, unknown> {
  const values: Record<string, unknown> = {};
  const targets = new Set([
    ...getToolcraftValueControls(state.schema).keys(),
    ...state.schema.settingsTransfer.additionalValueTargets,
  ]);

  for (const target of targets) {
    if (
      !isToolcraftCanvasSizingTarget(target) &&
      Object.hasOwn(state.values, target)
    ) {
      values[target] = state.values[target];
    }
  }

  return values;
}

export function createToolcraftSettingsPayload(
  state: ToolcraftState,
): ToolcraftSettingsTransferPayload {
  return {
    appId: state.schema.settingsTransfer.appId,
    attachments: createToolcraftSettingsAttachments(state.mediaAssets),
    canvas: {
      ...(Object.hasOwn(state.values, "canvas.aspectRatio")
        ? {
            aspectRatio: normalizeToolcraftCanvasAspectRatioValue(
              state.values["canvas.aspectRatio"],
              state.canvas.size,
            ),
          }
        : {}),
      mode: state.canvas.mode,
      size: state.canvas.size,
    },
    exportedAt: new Date().toISOString(),
    source: settingsTransferPayloadSource,
    timeline: {
      currentTimeSeconds: state.timeline.currentTimeSeconds,
      durationSeconds: state.timeline.durationSeconds,
      expanded: state.timeline.expanded,
      isLooping: state.timeline.isLooping,
      isPlaying: false,
    },
    values: pickTransferValues(state),
    version: settingsTransferPayloadVersion,
  };
}

export function parseToolcraftSettingsPayload(
  schema: ResolvedToolcraftAppSchema,
  value: unknown,
): ToolcraftSettingsTransferPayload | null {
  if (!isRecord(value)) {
    return null;
  }

  if (
    Object.keys(value).sort().join("|") !==
    "appId|attachments|canvas|exportedAt|source|timeline|values|version"
  ) {
    return null;
  }

  if (
    value.source !== settingsTransferPayloadSource ||
    value.version !== settingsTransferPayloadVersion ||
    value.appId !== schema.settingsTransfer.appId ||
    !isCanonicalExportTimestamp(value.exportedAt)
  ) {
    return null;
  }

  if (
    !Array.isArray(value.attachments) ||
    !isRecord(value.values) ||
    !isRecord(value.canvas) ||
    !isRecord(value.timeline)
  ) {
    return null;
  }

  if (Object.keys(value.values).some(isToolcraftCanvasSizingTarget)) {
    return null;
  }

  const canvas = parseToolcraftSettingsCanvas(value.canvas);
  const timeline = readToolcraftSettingsTimeline(value.timeline);

  if (!canvas || !timeline) {
    return null;
  }

  return {
    appId: schema.settingsTransfer.appId,
    attachments: parseToolcraftSettingsAttachments(value.attachments),
    canvas,
    exportedAt: value.exportedAt,
    source: settingsTransferPayloadSource,
    timeline,
    values: value.values,
    version: settingsTransferPayloadVersion,
  };
}

export function applyToolcraftSettingsPayload(
  context: ImportContext,
  payload: ToolcraftSettingsTransferPayload,
  assets: readonly ToolcraftMediaAsset[],
): void {
  const importableTargets = getToolcraftValueControls(context.state.schema);
  const additionalTargets = new Set(
    context.state.schema.settingsTransfer.additionalValueTargets,
  );

  const values: Record<string, unknown> = {};
  for (const [target, value] of Object.entries(payload.values)) {
    const control = importableTargets.get(target);

    if (
      isToolcraftCanvasSizingTarget(target) ||
      (!control && !additionalTargets.has(target))
    ) {
      continue;
    }

    const normalized = control
      ? normalizeToolcraftControlValue(control, value)
      : { accepted: true as const, value };

    values[target] = normalized.accepted
      ? normalized.value
      : normalized.fallback;
  }

  context.dispatch({
    type: "settings.apply",
    settings: {
      assets,
      canvas: payload.canvas,
      timeline: payload.timeline,
      values,
    },
  });
}

export function downloadToolcraftSettings(state: ToolcraftState): void {
  const payload = createToolcraftSettingsPayload(state);
  const blob = new Blob([JSON.stringify(payload, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = state.schema.settingsTransfer.fileName;
  link.click();

  window.setTimeout(() => {
    URL.revokeObjectURL(url);
  }, 0);
}

function reportImportError(error: unknown): void {
  console.error("Could not import Toolcraft settings.", error);
  window.alert("Could not import settings JSON.");
}

export async function importToolcraftSettings(context: {
  dispatch: ToolcraftDispatch;
  getState: () => ToolcraftState;
  sourceAssetCoordinator: Pick<
    ToolcraftSourceAssetCoordinator,
    "resolveSettingsAsset" | "retainResourceRef"
  >;
}): Promise<void> {
  // The store owns the operation even if the controls panel is remounted.
  if (activeSettingsImports.has(context.dispatch)) return;
  activeSettingsImports.add(context.dispatch);
  const input = document.createElement("input");
  input.accept = "application/json,.json";
  input.style.display = "none";
  input.type = "file";
  document.body.append(input);

  try {
    const file = await new Promise<File | null>((resolve) => {
      const finish = (event: Event) => {
        input.removeEventListener("change", finish);
        input.removeEventListener("cancel", finish);
        resolve(
          event.type === "change" ? (input.files?.item(0) ?? null) : null,
        );
      };
      input.addEventListener("change", finish);
      input.addEventListener("cancel", finish);
      input.click();
    });
    if (!file) return;
    const json: unknown = JSON.parse(await file.text());
    const payload = parseToolcraftSettingsPayload(
      context.getState().schema,
      json,
    );

    if (!payload) {
      throw new Error("Invalid Toolcraft settings payload.");
    }

    const releases: (() => void)[] = [];
    try {
      const assets = await Promise.all(
        payload.attachments.map(async ({ asset }) => {
          if (!asset) return null;
          try {
            for (const ref of collectToolcraftMediaResourceRefs([asset])) {
              const release =
                context.sourceAssetCoordinator.retainResourceRef?.(ref);
              if (release) releases.push(release);
            }
            return (
              (await context.sourceAssetCoordinator.resolveSettingsAsset?.(
                asset,
              )) ?? null
            );
          } catch {
            return null;
          }
        }),
      );
      applyToolcraftSettingsPayload(
        { dispatch: context.dispatch, state: context.getState() },
        payload,
        assets.filter((asset) => asset !== null),
      );
    } finally {
      for (const release of releases) release();
    }
  } catch (error) {
    reportImportError(error);
  } finally {
    input.remove();
    activeSettingsImports.delete(context.dispatch);
  }
}
