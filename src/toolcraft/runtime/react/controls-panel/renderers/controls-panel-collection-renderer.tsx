import * as React from "react";
import { CollectionActions, type ControlChangeMeta } from "@/toolcraft/ui";

import type { ToolcraftControlSchema } from "../../../schema/types";
import type { ToolcraftCommand } from "../../../state/types";
import { useControlsPanelCollectionKeyframes } from "../keyframes/controls-panel-collection-keyframes";
import { ControlsPanelCollectionItems } from "./controls-panel-collection-items";
import {
  asCollectionItems,
  getCollectionHardMaxItems,
  getCollectionItemBaseLabel,
  getCollectionItemName,
  getCollectionMinItems,
} from "../values/controls-panel-values";

export type CollectionControlSetValue = (
  target: string,
  value: unknown,
  label?: string,
  meta?: ControlChangeMeta,
) => void;

export type CollectionControlRenderArgs = {
  control: ToolcraftControlSchema;
  name: string;
  setControlValue: CollectionControlSetValue;
  dispatchCommand: (command: ToolcraftCommand) => void;
  selectedIndex?: number | null;
  value: unknown;
};

function updateCollectionItem({
  control,
  fieldName,
  index,
  items,
  meta,
  name,
  nextValue,
  setControlValue,
}: {
  control: ToolcraftControlSchema;
  fieldName?: string;
  index: number;
  items: readonly unknown[];
  meta?: ControlChangeMeta;
  name: string;
  nextValue: unknown;
  setControlValue: CollectionControlSetValue;
}): void {
  const nextItems = items.map((item, itemIndex) =>
    itemIndex === index ? nextValue : item,
  );
  const itemName = getCollectionItemName(control, index) || name;
  const historyLabel = fieldName ? `${itemName} ${fieldName}` : itemName;

  setControlValue(control.target, nextItems, historyLabel, meta);
}

function CollectionActionsControl({
  control,
  dispatchCommand,
  name,
  selectedIndex,
  setControlValue,
  value,
}: CollectionControlRenderArgs): React.JSX.Element {
  const items = asCollectionItems(value, control.defaultValue);
  const minItems = getCollectionMinItems(control);
  const hardMaxItems = getCollectionHardMaxItems(control);
  const canAdd = hardMaxItems === null || items.length < hardMaxItems;
  const canRemove = items.length > minItems;

  const withFieldKeyframeAction = useControlsPanelCollectionKeyframes({
    control,
    dispatchCommand,
    items,
  });

  return (
    <div className="min-w-0 space-y-3" data-slot="collection-actions-control">
      <CollectionActions
        addLabel={control.addLabel ?? `Add ${getCollectionItemBaseLabel(control)}`}
        canAdd={canAdd}
        canRemove={canRemove}
        name={name}
        onAdd={() => {
          if (canAdd) {
            dispatchCommand({
              label: control.addLabel ?? "Add item",
              target: control.target,
              type: "controls.addCollectionItem",
            });
          }
        }}
        onRemove={() => {
          if (canRemove) {
            dispatchCommand({
              label: control.removeLabel ?? "Remove item",
              target: control.target,
              type: "controls.removeCollectionItem",
            });
          }
        }}
        removeLabel={
          control.removeLabel ?? `Remove ${getCollectionItemBaseLabel(control)}`
        }
      />
      <ControlsPanelCollectionItems
        control={control}
        items={items}
        onItemChange={(index, nextValue, meta, fieldName, fieldId, fieldValue) => {
          if (fieldId === undefined) {
            updateCollectionItem({
              control,
              fieldName,
              index,
              items,
              meta,
              name,
              nextValue,
              setControlValue,
            });
            return;
          }
          dispatchCommand({
            fieldId,
            history: meta?.history,
            historyGroup: meta?.historyGroup,
            itemIndex: index,
            label: fieldName,
            target: control.target,
            type: "controls.setCollectionItemField",
            value: fieldValue,
          });
        }}
        onSelectItem={(index) =>
          dispatchCommand({
            itemIndex: index,
            target: control.target,
            type: "controls.selectCollectionItem",
          })
        }
        selectedIndex={selectedIndex}
        slotPrefix="collection-actions"
        withFieldKeyframeAction={withFieldKeyframeAction}
      />
    </div>
  );
}

function SourceCollectionControl({
  control,
  name,
  setControlValue,
  value,
}: CollectionControlRenderArgs): React.JSX.Element {
  const items = asCollectionItems(value, control.defaultValue);

  return (
    <div className="min-w-0" data-slot="source-collection-control">
      <ControlsPanelCollectionItems
        control={control}
        items={items}
        onItemChange={(index, nextValue, meta, fieldName) =>
          updateCollectionItem({
            control,
            fieldName,
            index,
            items,
            meta,
            name,
            nextValue,
            setControlValue,
          })
        }
        slotPrefix="source-collection"
      />
    </div>
  );
}

function ControlsPanelCollectionRenderer(
  args: CollectionControlRenderArgs,
): React.JSX.Element {
  switch (args.control.type) {
    case "collectionActions":
      return <CollectionActionsControl {...args} />;
    case "sourceCollection":
      return <SourceCollectionControl {...args} />;
    default:
      throw new Error(
        `Unsupported Toolcraft collection control: ${args.control.type}`,
      );
  }
}

export function renderCollectionControl(
  args: CollectionControlRenderArgs,
): React.JSX.Element {
  return <ControlsPanelCollectionRenderer {...args} />;
}
