import type { ToolcraftPanelActionContext } from "@/toolcraft/runtime/react";

import { clampCellRect, fillCellRect } from "./iso-geometry";
import { clearReliefEdits } from "./iso-relief";
import {
  createIsoPlacementsCommand,
  createIsoReliefEditsCommand,
  getIsoActiveObjectId,
  getIsoActivePlacements,
  getIsoGridSize,
  getIsoLibraryObjects,
  getIsoOffGridPlacements,
  getIsoReliefLayers,
  ISO_ACTIONS,
  ISO_RELIEF_ACTIONS,
  readIsoSelection,
} from "./iso-state";

/**
 * Local Field and Relief commands. Resetting height edits acts on the
 * selected section when there is one, otherwise on the whole field.
 */
export function handleIsoPanelAction({
  action,
  dispatch,
  reportFeedback,
  state,
}: ToolcraftPanelActionContext): void {
  const placements = getIsoActivePlacements(state);
  const gridSize = getIsoGridSize(state.values);
  const relief = getIsoReliefLayers(state);
  const selection = readIsoSelection(state.values);

  if (action.value === ISO_RELIEF_ACTIONS.resetEdits) {
    const rect = selection ? clampCellRect(selection, gridSize) : null;
    dispatch(
      createIsoReliefEditsCommand(
        clearReliefEdits(relief.edits, rect),
        rect ? "Reset section edits" : "Reset height edits",
      ),
    );
    return;
  }

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
      : selection;
  if (!rect) {
    reportFeedback({
      code: "iso-no-selection",
      message: "Select a section on the canvas with the Select tool first.",
    });
    return;
  }

  const next = fillCellRect(placements, rect, active.id, active.record.footprint, gridSize, relief.heights);
  dispatch(
    createIsoPlacementsCommand(
      [...next, ...getIsoOffGridPlacements(state)],
      action.value === ISO_ACTIONS.fillField ? "Fill field" : "Fill section",
    ),
  );
}
