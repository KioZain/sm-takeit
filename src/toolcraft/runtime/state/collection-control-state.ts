import {
  getToolcraftCollectionActionsControls,
  isToolcraftCollectionItemControlAddress,
  isToolcraftCollectionFieldKeyframeable,
} from "../schema/collection-actions";
import { getToolcraftCollectionItemDefault } from "../schema/collection-item-defaults";
import type { ResolvedToolcraftControlSchema } from "../schema/types";
import {
  cloneToolcraftJsonValue,
  decodeToolcraftBuiltInControlValue,
} from "./control-value-codecs";
import {
  decodeToolcraftCollectionItemControlAddress,
  getToolcraftCollectionItemControlAddress,
} from "./collection-control-address";
import type {
  ToolcraftCommand,
  ToolcraftState,
  ToolcraftTimelineKeyframeGroup,
  ToolcraftTimelineState,
} from "./types";
import { commitToolcraftControlStateReplacement } from "./control-state-replacement";
import { normalizeToolcraftControlValue } from "./control-value-normalization";
import { upsertToolcraftTimelineControlValue } from "./timeline-keyframe-data";
import { getToolcraftSelectedKeyframeTime } from "./selected-keyframe-time";
import { formatToolcraftControlValueLabel } from "./control-value-labels";

export function getToolcraftCollectionControl(
  state: Pick<ToolcraftState, "schema">,
  target: string,
): ResolvedToolcraftControlSchema | undefined {
  return getToolcraftCollectionActionsControls(
    state.schema.panels.controls,
  ).get(target);
}

export function createToolcraftCollectionSelectionDefaults(
  schema: ToolcraftState["schema"],
): Record<string, null> {
  return Object.fromEntries(
    [
      ...getToolcraftCollectionActionsControls(schema.panels.controls).values(),
    ].flatMap((control) =>
      control.selectionTarget ? [[control.selectionTarget, null] as const] : [],
    ),
  );
}

export function normalizeToolcraftCollectionSelections({
  controls,
  values,
}: {
  controls: ReadonlyMap<string, ResolvedToolcraftControlSchema>;
  values: Record<string, unknown>;
}): Record<string, unknown> {
  const nextValues = { ...values };
  for (const control of controls.values()) {
    const target = control.selectionTarget;
    if (!target) continue;
    const items = nextValues[control.target];
    const selection = nextValues[target];
    nextValues[target] =
      Array.isArray(items) &&
      Number.isSafeInteger(selection) &&
      (selection as number) >= 0 &&
      (selection as number) < items.length
        ? selection
        : null;
  }
  return nextValues;
}

export function applyToolcraftCollectionParentReplacements({
  replacedTargets,
  state,
  values,
}: {
  replacedTargets: ReadonlySet<string>;
  state: ToolcraftState;
  values: Record<string, unknown>;
}): Pick<ToolcraftState, "timeline" | "values"> {
  const controls = getToolcraftCollectionActionsControls(
    state.schema.panels.controls,
  );
  const collectionTargets = [...replacedTargets].filter((target) =>
    controls.has(target),
  );
  let timeline = state.timeline;
  for (const target of collectionTargets) {
    timeline = pruneToolcraftCollectionKeyframes(timeline, target);
  }
  return {
    timeline,
    values: normalizeToolcraftCollectionSelections({
      controls,
      values,
    }),
  };
}

export function createToolcraftCollectionItem(
  control: ResolvedToolcraftControlSchema,
): unknown {
  const value = getToolcraftCollectionItemDefault(control);
  return value === undefined ? undefined : cloneToolcraftJsonValue(value);
}

function createCanonicalCollectionItem(
  control: ResolvedToolcraftControlSchema,
): unknown {
  const draft = createToolcraftCollectionItem(control);
  if (draft === undefined) return undefined;
  const normalized = normalizeToolcraftControlValue(control, [draft]);
  return normalized.accepted && Array.isArray(normalized.value)
    ? normalized.value[0]
    : undefined;
}

export function getToolcraftCollectionItems(
  state: ToolcraftState,
  control: ResolvedToolcraftControlSchema,
): readonly unknown[] | null {
  const value = state.values[control.target];
  return Array.isArray(value) ? value : null;
}

export function decodeToolcraftCollectionFieldValue(
  control: ResolvedToolcraftControlSchema,
  fieldId: string,
  candidate: unknown,
): { accepted: true; value: unknown } | { accepted: false } {
  const field = control.itemControls?.[fieldId];
  if (!field) return { accepted: false };
  return (
    decodeToolcraftBuiltInControlValue(field, candidate) ?? { accepted: false }
  );
}

export function getToolcraftCollectionFieldAddress(
  control: ResolvedToolcraftControlSchema,
  index: number,
  fieldId: string,
): string | null {
  const field = control.itemControls?.[fieldId];
  if (!field || !isToolcraftCollectionFieldKeyframeable(field)) return null;
  return getToolcraftCollectionItemControlAddress(
    control.target,
    index,
    fieldId,
  );
}

export function pruneToolcraftCollectionKeyframes(
  timeline: ToolcraftTimelineState,
  collectionTarget: string,
  keepItemCount = 0,
): ToolcraftTimelineState {
  const removedIds = new Set<string>();
  const keyframeGroups = timeline.keyframeGroups.filter((group) => {
    const address = decodeToolcraftCollectionItemControlAddress(
      group.controlId,
    );
    const remove =
      address?.collectionTarget === collectionTarget &&
      address.index >= keepItemCount;
    if (remove) {
      for (const keyframe of group.keyframes) removedIds.add(keyframe.id);
    }
    return !remove;
  });
  if (keyframeGroups.length === timeline.keyframeGroups.length) return timeline;
  return {
    ...timeline,
    keyframeGroups,
    selectedKeyframeId:
      timeline.selectedKeyframeId && removedIds.has(timeline.selectedKeyframeId)
        ? null
        : timeline.selectedKeyframeId,
  };
}

export function normalizeToolcraftCollectionKeyframeGroups({
  controls,
  groups,
  values,
}: {
  controls: ReadonlyMap<string, ResolvedToolcraftControlSchema>;
  groups: readonly ToolcraftTimelineKeyframeGroup[];
  values: Readonly<Record<string, unknown>>;
}): ToolcraftTimelineKeyframeGroup[] {
  return groups.flatMap((group) => {
    const address = decodeToolcraftCollectionItemControlAddress(
      group.controlId,
    );
    if (!address) {
      return isToolcraftCollectionItemControlAddress(group.controlId)
        ? []
        : [group];
    }
    const control = controls.get(address.collectionTarget);
    const items = values[address.collectionTarget];
    const field = control?.itemControls?.[address.fieldId];
    if (
      !control ||
      !Array.isArray(items) ||
      address.index >= items.length ||
      !field ||
      !isToolcraftCollectionFieldKeyframeable(field)
    )
      return [];
    const keyframes = group.keyframes.flatMap((keyframe) => {
      const decoded = decodeToolcraftBuiltInControlValue(field, keyframe.value);
      return decoded?.accepted ? [{ ...keyframe, value: decoded.value }] : [];
    });
    return keyframes.length ? [{ ...group, keyframes }] : [];
  });
}

type ToolcraftCollectionCommand = Extract<
  ToolcraftCommand,
  {
    type:
      | "controls.addCollectionItem"
      | "controls.removeCollectionItem"
      | "controls.selectCollectionItem"
      | "controls.setCollectionItemField";
  }
>;

function getNextSelectionAfterRemoval(
  selection: unknown,
  removedIndex: number,
  nextLength: number,
): number | null {
  if (selection !== removedIndex) return selection as number | null;
  return nextLength > 0 ? nextLength - 1 : null;
}

export function reduceToolcraftCollectionCommand(
  state: ToolcraftState,
  command: ToolcraftCollectionCommand,
): ToolcraftState {
  const control = getToolcraftCollectionControl(state, command.target);
  if (!control) return state;
  const items = getToolcraftCollectionItems(state, control);
  if (!items) return state;

  switch (command.type) {
    case "controls.addCollectionItem": {
      const hardMax = control.hardMaxItems;
      if (typeof hardMax === "number" && items.length >= hardMax) return state;
      const item = createCanonicalCollectionItem(control);
      if (item === undefined) return state;
      const nextItems = [...items, item];
      const selectionTarget = control.selectionTarget;
      const after = {
        [control.target]: nextItems,
        ...(selectionTarget ? { [selectionTarget]: nextItems.length - 1 } : {}),
      };
      return commitToolcraftControlStateReplacement(
        state,
        {
          timeline: state.timeline,
          values: { ...state.values, ...after },
        },
        command.label ?? `Add ${control.itemLabel ?? "item"}`,
      );
    }

    case "controls.removeCollectionItem": {
      const minItems = control.minItems ?? 0;
      if (items.length <= minItems) return state;
      const removedIndex = items.length - 1;
      const nextItems = items.slice(0, -1);
      const timeline = pruneToolcraftCollectionKeyframes(
        state.timeline,
        control.target,
        nextItems.length,
      );
      const selectionTarget = control.selectionTarget;
      const selection = selectionTarget
        ? getNextSelectionAfterRemoval(
            state.values[selectionTarget],
            removedIndex,
            nextItems.length,
          )
        : null;
      return commitToolcraftControlStateReplacement(
        state,
        {
          timeline,
          values: {
            ...state.values,
            [control.target]: nextItems,
            ...(selectionTarget ? { [selectionTarget]: selection } : {}),
          },
        },
        command.label ?? `Remove ${control.itemLabel ?? "item"}`,
      );
    }

    case "controls.selectCollectionItem": {
      const selectionTarget = control.selectionTarget;
      if (!selectionTarget) return state;
      const index = command.itemIndex;
      if (
        index !== null &&
        (!Number.isSafeInteger(index) || index < 0 || index >= items.length)
      )
        return state;
      if (Object.is(state.values[selectionTarget], index)) return state;
      return {
        ...state,
        values: { ...state.values, [selectionTarget]: index },
      };
    }

    case "controls.setCollectionItemField": {
      if (
        !Number.isSafeInteger(command.itemIndex) ||
        command.itemIndex < 0 ||
        command.itemIndex >= items.length
      )
        return state;
      const decoded = decodeToolcraftCollectionFieldValue(
        control,
        command.fieldId,
        command.value,
      );
      if (!decoded.accepted) return state;
      const currentItem = items[command.itemIndex];
      if (!currentItem || typeof currentItem !== "object") return state;
      const nextItems = items.map((item, index) =>
        index === command.itemIndex
          ? { ...currentItem, [command.fieldId]: decoded.value }
          : item,
      );
      const address = getToolcraftCollectionFieldAddress(
        control,
        command.itemIndex,
        command.fieldId,
      );
      const hasTrack = address
        ? state.timeline.keyframeGroups.some(
            (group) => group.controlId === address,
          )
        : false;
      const timeline =
        hasTrack && address
          ? upsertToolcraftTimelineControlValue(
              {
                ...state,
                values: { ...state.values, [control.target]: nextItems },
              },
              {
                controlId: address,
                controlLabel: command.label ?? command.fieldId,
                timeSeconds:
                  getToolcraftSelectedKeyframeTime(
                    address,
                    state.timeline.keyframeGroups,
                    state.timeline.selectedKeyframeId,
                  ) ?? state.timeline.currentTimeSeconds,
                type: "timeline.upsertControlKeyframe",
                value: decoded.value,
                valueLabel: formatToolcraftControlValueLabel(
                  {
                    ...control.itemControls![command.fieldId]!,
                    applicability: { mode: "always" },
                    target: address,
                  },
                  decoded.value,
                ),
              },
            )
          : state.timeline;
      return commitToolcraftControlStateReplacement(
        state,
        {
          timeline,
          values: { ...state.values, [control.target]: nextItems },
        },
        command.label ?? command.fieldId,
        { group: command.historyGroup, mode: command.history },
      );
    }
  }
}
