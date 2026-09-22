import type { ToolcraftPanelActionContext } from "@/toolcraft/runtime/react";

import { clampCellRect, fillCellRect } from "./iso-geometry";
import { getIsoPresetCommand } from "./iso-presets";
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
  const presetCommand = getIsoPresetCommand(action.value);
  if (presetCommand) {
    dispatch(presetCommand);
    return;
  }

  const placements = getIsoActivePlacements(state);
  const gridSize = getIsoGridSize(state.values);
  const relief = getIsoReliefLayers(state);
  const selection = readIsoSelection(state.values);

  if (action.value === ISO_RELIEF_ACTIONS.resetEdits) {
    const rect = selection ? clampCellRect(selection, gridSize) : null;
    dispatch(
      createIsoReliefEditsCommand(
        clearReliefEdits(relief.edits, rect),
        rect ? "Сброс правок секции" : "Сброс правок высоты",
      ),
    );
    return;
  }

  if (action.value === ISO_ACTIONS.clearField) {
    if (placements.length > 0 || state.values["field.placements"] !== undefined) {
      dispatch(createIsoPlacementsCommand([], "Очистить поле"));
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
      message: "Сначала загрузите изображение объекта и выберите его в библиотеке.",
    });
    return;
  }

  const rect =
    action.value === ISO_ACTIONS.fillField
      ? { col0: 0, col1: gridSize.cols - 1, row0: 0, row1: gridSize.rows - 1 }
      : selection;
  if (!rect) {
    reportFeedback({
      code: "iso-no-selection",
      message: "Сначала выделите секцию на холсте инструментом Выбор.",
    });
    return;
  }

  const next = fillCellRect(placements, rect, active.id, active.record.footprint, gridSize, relief.animated ? undefined : relief.heights);
  dispatch(
    createIsoPlacementsCommand(
      [...next, ...getIsoOffGridPlacements(state)],
      action.value === ISO_ACTIONS.fillField ? "Заполнить поле" : "Заполнить секцию",
    ),
  );
}
