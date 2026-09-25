import { describe, expect, it } from "vitest";

import appDefaults from "../app-defaults.json" with { type: "json" };
import { filterRenderablePlacements, footprintFitsGrid, type IsoPlacement } from "./iso-geometry";
import { ISO_PRESETS } from "./iso-presets";
import { ISO_TARGETS } from "./iso-state";

/** The images the generator ships with; presets may only rely on these. */
const DEFAULT_IMAGES = appDefaults.state.mediaAssets.map((asset) =>
  asset.fileName.replace(/\.[^.]+$/u, ""),
);

function gridOf(preset: (typeof ISO_PRESETS)[number]) {
  return {
    cols: preset.values[ISO_TARGETS.gridCols] as number,
    rows: preset.values[ISO_TARGETS.gridRows] as number,
  };
}

function placementsOf(preset: (typeof ISO_PRESETS)[number]): IsoPlacement[] {
  return preset.placements.map((piece, index) => ({
    col: piece.col,
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
      "Средний сет (24 шт)",
      "Обычный (8 шт)",
      "Стандартный сет (16_шт) v2",
      "Большой сет (40)",
    ]);
    expect(new Set(ISO_PRESETS.map((preset) => preset.id)).size).toBe(ISO_PRESETS.length);
  });

  it("shows the grid in every preset", () => {
    ISO_PRESETS.forEach((preset) => {
      expect(preset.values[ISO_TARGETS.gridVisible], preset.name).toBe(true);
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
      const pieces = placementsOf(preset);
      const onGrid = pieces.filter((piece) =>
        footprintFitsGrid(piece.col, piece.row, piece.footprint, grid),
      );
      const renders = filterRenderablePlacements(pieces, new Set(DEFAULT_IMAGES), grid);
      // Nothing on the grid is lost to an overlap; pieces beyond it stay stored.
      expect(renders.length, preset.name).toBe(onGrid.length);
      return renders.length;
    });
    expect(rendered).toEqual([16, 24, 8, 0, 32]);
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
