import { describe, expect, it } from "vitest";

import {
  getIsoPresetRows,
  moveIsoPreset,
  overwriteIsoPreset,
  renameIsoPreset,
  resetIsoPreset,
  toIsoPresetsFile,
} from "./iso-preset-list";
import { ISO_PRESETS } from "./iso-presets";
import { addIsoSavedPreset, createIsoSavedPreset, ISO_EMPTY_SAVED_PRESETS } from "./iso-saved-presets";
import { ISO_TARGETS } from "./iso-state";
import { at, createState, withPlacements } from "./iso-test-fixtures";

const now = "2026-09-25T10:00:00.000Z";

function withSaved(value: { items: readonly unknown[] }, extra: Record<string, unknown> = {}) {
  return createState({ [ISO_TARGETS.savedPresets]: value, ...extra });
}

describe("sushi set preset list", () => {
  it("lists the baked presets first and the owner's own after them", () => {
    const own = createIsoSavedPreset(createState(), "Свой", "preset-own", now);
    const rows = getIsoPresetRows(withSaved(addIsoSavedPreset(ISO_EMPTY_SAVED_PRESETS, own)).values);

    expect(rows.map((row) => row.preset.name)).toEqual([
      ...ISO_PRESETS.map((preset) => preset.name),
      "Свой",
    ]);
    expect(rows.map((row) => row.builtIn)).toEqual([...ISO_PRESETS.map(() => true), false]);
    expect(rows.every((row) => !row.overridden)).toBe(true);
  });

  it("overwrites a baked preset with the current set and marks it as edited", () => {
    const baked = getIsoPresetRows(createState().values)[0]!;
    const state = withPlacements([at("maki", 2, 1)], { [ISO_TARGETS.gridCols]: 3 });
    const stored = overwriteIsoPreset(ISO_EMPTY_SAVED_PRESETS, baked, state, now);
    const rows = getIsoPresetRows(withSaved(stored).values);

    expect(rows[0]!.overridden).toBe(true);
    expect(rows[0]!.builtIn).toBe(true);
    // The name survives an overwrite; the contents come from the current set.
    expect(rows[0]!.preset.name).toBe(baked.preset.name);
    expect(rows[0]!.preset.values[ISO_TARGETS.gridCols]).toBe(3);
    expect(rows[0]!.preset.placements).toEqual([
      { col: 2, footprint: "1x1", objectName: "maki", row: 1 },
    ]);
    expect(rows).toHaveLength(ISO_PRESETS.length);
  });

  it("returns an edited baked preset to its source version", () => {
    const baked = getIsoPresetRows(createState().values)[1]!;
    const edited = overwriteIsoPreset(ISO_EMPTY_SAVED_PRESETS, baked, createState(), now);
    const editedRow = getIsoPresetRows(withSaved(edited).values)[1]!;
    const reset = resetIsoPreset(edited, editedRow);
    const rows = getIsoPresetRows(withSaved(reset).values);

    expect(editedRow.overridden).toBe(true);
    expect(rows[1]!.overridden).toBe(false);
    expect(rows[1]!.preset).toEqual(ISO_PRESETS[1]);
  });

  it("renames a baked preset without touching the rest of it", () => {
    const baked = getIsoPresetRows(createState().values)[1]!;
    const stored = renameIsoPreset(ISO_EMPTY_SAVED_PRESETS, baked, "Сет на вынос");
    const row = getIsoPresetRows(withSaved(stored).values)[1]!;

    expect(row.preset.name).toBe("Сет на вынос");
    expect(row.preset.placements).toEqual(ISO_PRESETS[1]!.placements);
    expect(renameIsoPreset(ISO_EMPTY_SAVED_PRESETS, baked, "  ")).toBe(ISO_EMPTY_SAVED_PRESETS);
  });

  it("shows the edited version in the row a preset is applied from", () => {
    const baked = getIsoPresetRows(createState().values)[0]!;
    const edited = overwriteIsoPreset(
      ISO_EMPTY_SAVED_PRESETS,
      baked,
      createState({ [ISO_TARGETS.gridCols]: 7 }),
      now,
    );
    const row = getIsoPresetRows(withSaved(edited).values)[0]!;

    expect(row.preset.values[ISO_TARGETS.gridCols]).toBe(7);
    expect(row.overridden).toBe(true);
  });

  it("moves a preset to another row and keeps the order", () => {
    const own = createIsoSavedPreset(createState(), "Свой", "preset-own", now);
    const stored = addIsoSavedPreset(ISO_EMPTY_SAVED_PRESETS, own);
    const rows = getIsoPresetRows(withSaved(stored).values);
    const last = rows[rows.length - 1]!.preset.id;
    const first = rows[0]!.preset.id;

    const moved = moveIsoPreset(stored, rows, last, first);
    expect(getIsoPresetRows(withSaved(moved).values).map((row) => row.preset.id)).toEqual([
      last,
      ...rows.slice(0, -1).map((row) => row.preset.id),
    ]);
    // Dropping a row on itself changes nothing.
    expect(moveIsoPreset(stored, rows, first, first)).toBe(stored);
    expect(moveIsoPreset(stored, rows, "missing", first)).toBe(stored);
  });

  it("keeps the dragged order across a reload and after a rename", () => {
    const rows = getIsoPresetRows(createState().values);
    const moved = moveIsoPreset(ISO_EMPTY_SAVED_PRESETS, rows, rows[2]!.preset.id, rows[0]!.preset.id);
    const reloaded = JSON.parse(JSON.stringify(moved));
    const afterRename = renameIsoPreset(reloaded, getIsoPresetRows(withSaved(reloaded).values)[0]!, "Первый");

    expect(getIsoPresetRows(withSaved(reloaded).values)[0]!.preset.id).toBe(rows[2]!.preset.id);
    expect(getIsoPresetRows(withSaved(afterRename).values)[0]!.preset.name).toBe("Первый");
    expect(getIsoPresetRows(withSaved(afterRename).values)[0]!.preset.id).toBe(rows[2]!.preset.id);
  });

  it("hands over baked and own presets in one file", () => {
    const own = createIsoSavedPreset(createState(), "Свой", "preset-own", now);
    const rows = getIsoPresetRows(withSaved(addIsoSavedPreset(ISO_EMPTY_SAVED_PRESETS, own)).values);
    const file = JSON.parse(toIsoPresetsFile(rows));

    expect(file.version).toBe(1);
    expect(file.presets).toHaveLength(ISO_PRESETS.length + 1);
    expect(file.presets.map((preset: { id: string }) => preset.id)).toEqual([
      ...ISO_PRESETS.map((preset) => preset.id),
      "preset-own",
    ]);
  });
});
