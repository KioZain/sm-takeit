import { describe, expect, it } from "vitest";

import type { ToolcraftCommand } from "@/toolcraft/runtime";

import { appSchema } from "../app-schema";
import {
  addIsoSavedPreset,
  createIsoSavedPreset,
  getIsoSavedPresetCommand,
  getIsoSavedPresetMatch,
  ISO_EMPTY_SAVED_PRESETS,
  ISO_PRESET_VALUE_TARGETS,
  readIsoSavedPresets,
  removeIsoSavedPreset,
  renameIsoSavedPreset,
  toIsoSavedPresetsFile,
} from "./iso-saved-presets";
import { ISO_PRESETS } from "./iso-presets";
import { ISO_TARGETS } from "./iso-state";
import { asset, at, createState, record, withPlacements } from "./iso-test-fixtures";

/** The values an apply command carries, narrowed once for the assertions below. */
function applied(command: ToolcraftCommand): Record<string, unknown> {
  return command.type === "controls.apply" ? { ...command.values } : {};
}

function labelOf(command: ToolcraftCommand): string | undefined {
  return command.type === "controls.apply" ? command.label : undefined;
}

function savedOf(state: ReturnType<typeof createState>, name = "Сет А") {
  return createIsoSavedPreset(state, name, "preset-a", "2026-09-24T00:00:00.000Z");
}

/** Fresh uploads of the same files, so ids differ but names match. */
function reuploaded() {
  return createState(
    {
      [ISO_TARGETS.libraryObjects]: {
        activeId: null,
        items: { "maki-2": record("maki"), "nigiri-2": record("nigiri") },
      },
      [ISO_TARGETS.placements]: { items: [] },
    },
    [asset("maki-2"), asset("nigiri-2")],
  );
}

describe("sushi set saved presets", () => {
  it("captures the settings, objects, and layout of the current set", () => {
    const state = withPlacements([at("maki", 1, 2), at("nigiri", 0, 0, "2x2")], {
      [ISO_TARGETS.gridCols]: 5,
      [ISO_TARGETS.reliefPattern]: "corner-rings",
    });
    const preset = savedOf(state);

    expect(preset.name).toBe("Сет А");
    expect(preset.values[ISO_TARGETS.gridCols]).toBe(5);
    expect(preset.values[ISO_TARGETS.reliefPattern]).toBe("corner-rings");
    expect(preset.objects.map((object) => object.name)).toEqual(["maki", "nigiri"]);
    expect(preset.placements).toEqual([
      { col: 1, footprint: "1x1", objectName: "maki", row: 2 },
      { col: 0, footprint: "2x2", objectName: "nigiri", row: 0 },
    ]);
  });

  it("never stores uploads or session-only state", () => {
    const preset = savedOf(createState({ [ISO_TARGETS.tool]: "erase" }));
    const stored = Object.keys(preset.values);

    expect(stored).not.toContain(ISO_TARGETS.libraryFiles);
    expect(stored).not.toContain(ISO_TARGETS.libraryObjects);
    expect(stored).not.toContain(ISO_TARGETS.placements);
    expect(stored).not.toContain(ISO_TARGETS.tool);
    expect(stored.every((target) => ISO_PRESET_VALUE_TARGETS.includes(target))).toBe(true);
  });

  it("restores a preset onto re-uploaded files by object name", () => {
    const preset = savedOf(
      withPlacements([at("maki", 1, 2)], { [ISO_TARGETS.gridCols]: 5 }),
    );
    const command = getIsoSavedPresetCommand(reuploaded(), preset);

    expect(command.type).toBe("controls.apply");
    expect(labelOf(command)).toBe("Пресет «Сет А»");
    const values = applied(command);
    expect(values[ISO_TARGETS.gridCols]).toBe(5);
    expect(values[ISO_TARGETS.placements]).toEqual({
      items: [{ col: 1, footprint: "1x1", id: "maki-2@1,2", objectId: "maki-2", row: 2 }],
    });
    const library = values[ISO_TARGETS.libraryObjects] as { activeId: string; items: object };
    expect(Object.keys(library.items)).toEqual(["maki-2", "nigiri-2"]);
    expect(library.activeId).toBe("maki-2");
  });

  it("skips pieces whose object is not uploaded and reports the missing names", () => {
    const preset = savedOf(withPlacements([at("maki", 1, 2), at("nigiri", 3, 3)]));
    const onlyMaki = createState(
      {
        [ISO_TARGETS.libraryObjects]: { activeId: null, items: { "maki-2": record("maki") } },
        [ISO_TARGETS.placements]: { items: [] },
      },
      [asset("maki-2")],
    );

    expect(getIsoSavedPresetMatch(onlyMaki, preset)).toEqual({ matched: 1, missing: ["nigiri"] });
    const values = applied(getIsoSavedPresetCommand(onlyMaki, preset));
    expect(values[ISO_TARGETS.placements]).toEqual({
      items: [{ col: 1, footprint: "1x1", id: "maki-2@1,2", objectId: "maki-2", row: 2 }],
    });
  });

  it("adds, renames, and removes presets without touching the others", () => {
    const first = savedOf(createState(), "Первый");
    const second = createIsoSavedPreset(createState(), "Второй", "preset-b", "");
    const two = addIsoSavedPreset(addIsoSavedPreset(ISO_EMPTY_SAVED_PRESETS, first), second);

    expect(two.items.map((preset) => preset.name)).toEqual(["Первый", "Второй"]);
    expect(renameIsoSavedPreset(two, "preset-a", "  Новое имя ").items.map((p) => p.name)).toEqual([
      "Новое имя",
      "Второй",
    ]);
    // An empty name keeps the previous one instead of leaving an unnamed row.
    expect(renameIsoSavedPreset(two, "preset-a", "   ").items[0]?.name).toBe("Первый");
    expect(removeIsoSavedPreset(two, "preset-a").items.map((p) => p.id)).toEqual(["preset-b"]);
  });

  it("reads back what it stored and repairs damaged entries", () => {
    const stored = addIsoSavedPreset(ISO_EMPTY_SAVED_PRESETS, savedOf(withPlacements([at("maki", 1, 1)])));
    const values = { [ISO_TARGETS.savedPresets]: JSON.parse(JSON.stringify(stored)) };

    expect(readIsoSavedPresets(values)).toEqual(stored);
    expect(readIsoSavedPresets({})).toEqual(ISO_EMPTY_SAVED_PRESETS);
    expect(
      readIsoSavedPresets({
        [ISO_TARGETS.savedPresets]: { items: [{ name: 42, placements: [{ col: "x" }] }] },
      }).items[0]?.placements,
    ).toEqual([]);
  });

  it("hands the presets over as a readable file", () => {
    const stored = addIsoSavedPreset(ISO_EMPTY_SAVED_PRESETS, savedOf(createState()));
    const file = JSON.parse(toIsoSavedPresetsFile(stored));

    expect(file.version).toBe(1);
    expect(file.presets).toHaveLength(1);
    expect(file.presets[0].name).toBe("Сет А");
  });

  it("ships baked presets that carry settings only", () => {
    // The owner rebuilds the layouts in the tool, so no baked preset owns pieces.
    expect(ISO_PRESETS.every((preset) => preset.objects.length === 0)).toBe(true);
    expect(ISO_PRESETS.every((preset) => preset.placements.length === 0)).toBe(true);
    expect(ISO_PRESETS.map((preset) => preset.name)).toEqual([
      "Стандартный сет (16 шт)",
      "Средний сет (24 шт)",
      "Обычный (8 шт)",
      "Стандартный сет (16_шт) v2",
      "Большой сет (40)",
    ]);
  });

  it("leaves the field alone for a settings-only preset", () => {
    const settingsOnly = ISO_PRESETS.find((preset) => preset.objects.length === 0);
    const values = applied(getIsoSavedPresetCommand(withPlacements([at("maki", 0, 0)]), settingsOnly!));
    expect(settingsOnly!.values[ISO_TARGETS.gridCols]).toBe(4);

    expect(values[ISO_TARGETS.placements]).toBeUndefined();
    expect(values[ISO_TARGETS.libraryObjects]).toBeUndefined();
  });

  it("is reachable from the Presets section", () => {
    const presets = appSchema.panels.controls?.sections.find((section) => section.id === "presets");
    const targets = Object.values(presets?.controls ?? {}).map((control) => control.target);

    expect(targets).toContain(ISO_TARGETS.savedPresets);
  });
});
