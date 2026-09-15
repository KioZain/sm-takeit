import type { ToolcraftPanelActionContext } from "@/toolcraft/runtime/react";

import { fillCellRect } from "./iso-geometry";
import {
  createIsoPlacementsCommand,
  getIsoActiveObjectId,
  getIsoActivePlacements,
  getIsoGridSize,
  getIsoLibraryObjects,
  ISO_ACTIONS,
  readIsoSelection,
} from "./iso-state";

/** Local Field commands: fill the selected section, fill the whole field, clear it. */
export function handleIsoPanelAction({
  action,
  dispatch,
  reportFeedback,
  state,
}: ToolcraftPanelActionContext): void {
  const placements = getIsoActivePlacements(state);
  const gridSize = getIsoGridSize(state.values);

  if (action.value === ISO_ACTIONS.clearField) {
    if (placements.length > 0 || state.values["field.placements"] !== undefined) {
      dispatch(createIsoPlacementsCommand([], "Clear field"));
    }
    return;
  }

  if (action.value !== ISO_ACTIONS.fillField && action.value !== ISO_ACTIONS.fillSelection) {
    return;
  }

  const activeId = getIsoActiveObjectId(state);
  const active = getIsoLibraryObjects(state).find((object) => object.id === activeId);
  if (!active) {
    reportFeedback({
      code: "iso-no-active-object",
      message: "Upload an object image and select it in the library first.",
    });
    return;
  }

  const rect =
    action.value === ISO_ACTIONS.fillField
      ? { col0: 0, col1: gridSize - 1, row0: 0, row1: gridSize - 1 }
      : readIsoSelection(state.values);
  if (!rect) {
    reportFeedback({
      code: "iso-no-selection",
      message: "Select a section on the canvas with the Select tool first.",
    });
    return;
  }

  const next = fillCellRect(placements, rect, active.id, active.record.footprint, gridSize);
  dispatch(
    createIsoPlacementsCommand(
      next,
      action.value === ISO_ACTIONS.fillField ? "Fill field" : "Fill section",
    ),
  );
}
