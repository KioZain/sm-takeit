import { describe, expect, it } from "vitest";

import appDefaults from "../app-defaults.json" with { type: "json" };
import { filterRenderablePlacements, footprintFitsFloor, type IsoPlacement } from "./iso-geometry";
import { ISO_PRESETS } from "./iso-presets";
import { getIsoFloorCount, getIsoGridSize, ISO_TARGETS } from "./iso-state";

/** The images the generator ships with; presets may only rely on these. */
const DEFAULT_IMAGES = appDefaults.state.mediaAssets.map((asset) =>
  asset.fileName.replace(/\.[^.]+$/u, ""),
);

/**
 * The field a preset actually opens in. A stacked preset is one square zone
 * repeated over floors, so its own `grid.cols`/`grid.rows` say nothing about
 * where a piece lands; ask the runtime the same way the app does.
 */
function gridOf(preset: (typeof ISO_PRESETS)[number]) {
  return getIsoGridSize(preset.values);
}

function floorsOf(preset: (typeof ISO_PRESETS)[number]): number {
  return getIsoFloorCount(preset.values);
}

function placementsOf(preset: (typeof ISO_PRESETS)[number]): IsoPlacement[] {
  return preset.placements.map((piece, index) => ({
    col: piece.col,
    floor: piece.floor,
    footprint: piece.footprint,
    id: `${piece.objectName}@${piece.col},${piece.row}#${index}`,
    objectId: piece.objectName,
    row: piece.row,
  }));
}

describe("baked presets", () => {
  it("ships the five named sets", () => {
    expect(ISO_PRESETS.map((preset) => preset.name)).toEqual([
      "Стандартный сет (16 шт)",
      "Средний сет_верт (16 шт)",
      "Обычный (8 шт)",
      "Стандартный сет (16_шт) v2",
      "Большой сет_верт (40)",
    ]);
    expect(new Set(ISO_PRESETS.map((preset) => preset.id)).size).toBe(ISO_PRESETS.length);
  });

  it("remembers the layout every preset was built in", () => {
    expect(ISO_PRESETS.map((preset) => preset.values[ISO_TARGETS.gridMode])).toEqual([
      "classic",
      "stacked",
      "classic",
      "classic",
      "stacked",
    ]);
    // A stacked preset is meaningless without the zone and the floor count it
    // was arranged in, so both travel with it.
    ISO_PRESETS.filter((preset) => preset.values[ISO_TARGETS.gridMode] === "stacked").forEach(
      (preset) => {
        expect(preset.values[ISO_TARGETS.gridZone], preset.name).toBeGreaterThanOrEqual(2);
        expect(floorsOf(preset), preset.name).toBeGreaterThan(1);
      },
    );
  });

  it("shows the grid in every preset", () => {
    ISO_PRESETS.forEach((preset) => {
      expect(preset.values[ISO_TARGETS.gridVisible], preset.name).toBe(true);
    });
  });

  it("gives every preset its own layout", () => {
    ISO_PRESETS.forEach((preset) => {
      expect(preset.placements.length, preset.name).toBeGreaterThan(0);
      expect(preset.objects.length, preset.name).toBeGreaterThan(0);
    });
  });

  it("only uses images the generator ships with", () => {
    ISO_PRESETS.forEach((preset) => {
      const used = [...new Set(preset.placements.map((piece) => piece.objectName))];
      expect(used.filter((name) => !DEFAULT_IMAGES.includes(name)), preset.name).toEqual([]);
      // Every placed image also carries its own anchor, footprint and scale.
      const described = preset.objects.map((object) => object.name);
      expect(used.filter((name) => !described.includes(name)), preset.name).toEqual([]);
    });
  });

  it("places every on-grid piece without overlaps", () => {
    const rendered = ISO_PRESETS.map((preset) => {
      const grid = gridOf(preset);
      const floors = floorsOf(preset);
      const pieces = placementsOf(preset);
      const onGrid = pieces.filter(
        (piece) =>
          piece.floor >= 0 &&
          piece.floor < floors &&
          footprintFitsFloor(piece.col, piece.row, piece.footprint, grid, piece.floor),
      );
      const renders = filterRenderablePlacements(pieces, new Set(DEFAULT_IMAGES), grid, floors);
      // Nothing on the field is lost to an overlap; pieces beyond it stay stored.
      expect(renders.length, preset.name).toBe(onGrid.length);
      return renders.length;
    });
    // What each set actually shows. The two stacked sets and "Обычный" were
    // arranged on a wider field than they open in, so pieces past the zone stay
    // stored and come back if the field is widened again.
    expect(rendered).toEqual([16, 17, 8, 16, 36]);
  });

  it("starts the app on an empty flat field", () => {
    const values = appDefaults.state.values as Record<string, unknown>;
    expect(values[ISO_TARGETS.placements]).toEqual({ items: [] });
    expect(values[ISO_TARGETS.reliefPattern]).toBe("flat");
    expect(values[ISO_TARGETS.reliefWave]).toBe(false);
    expect(values[ISO_TARGETS.reliefEdits] ?? null).toBeNull();
    expect(values[ISO_TARGETS.gridVisible]).toBe(true);
    expect(appDefaults.theme).toBe("light");
    expect(appDefaults.state.mediaAssets).toHaveLength(8);
  });
});
