import {
  canvasEditingModule,
  defineToolcraft,
  imageExportModule,
  mediaSourceModule,
  type ToolcraftControlSchema,
} from "@/toolcraft/runtime";

import appDefaults from "./app-defaults.json" with { type: "json" };
import { appIdentity } from "./app-identity";
import {
  isoCompositionControlType,
  isoObjectLibraryControlType,
} from "./iso/iso-control-types";
import {
  ISO_ACTIONS,
  ISO_DEFAULTS,
  ISO_EMPTY_LIBRARY,
  ISO_EMPTY_PLACEMENTS,
  ISO_GRID_SIZE_RANGE,
  ISO_LEVEL_HEIGHT_RANGE,
  ISO_RELIEF_ACTIONS,
  ISO_LIBRARY_MAX_OBJECTS,
  ISO_TARGETS,
} from "./iso/iso-state";

const always = { mode: "always" } as const;
const RAISED_PATTERNS = [
  "corner-diagonal",
  "corner-rings",
  "edge",
  "pyramid",
  "checker",
  "alternate-rows",
  "alternate-cols",
] as const;
const usesPeak = {
  all: [{ oneOf: RAISED_PATTERNS, target: ISO_TARGETS.reliefPattern }],
  mode: "conditional",
} as const;
const usesCorner = {
  all: [{ oneOf: ["corner-diagonal", "corner-rings"], target: ISO_TARGETS.reliefPattern }],
  mode: "conditional",
} as const;
const usesEdge = {
  all: [{ equals: "edge", target: ISO_TARGETS.reliefPattern }],
  mode: "conditional",
} as const;
const usesFalloff = {
  all: [
    { oneOf: ["corner-diagonal", "corner-rings", "edge", "pyramid"], target: ISO_TARGETS.reliefPattern },
  ],
  mode: "conditional",
} as const;
const cropsToFrame = {
  all: [{ oneOf: ["field", "content"], target: ISO_TARGETS.crop }],
  mode: "conditional",
} as const;

export const appSchema = defineToolcraft({
  defaults: appDefaults,
  base: {
    canvas: {
      enabled: true,
      size: { height: 264, unit: "px", width: 480 },
      sizing: { mode: "editable-output" },
      upload: true,
    },
    identity: appIdentity,
    panels: {
      controls: {
        sections: [
          {
            controls: {
              includeBackground: {
                applicability: always,
                defaultValue: ISO_DEFAULTS.includeBackground,
                label: "Include",
                performanceRole: "responsiveness",
                target: ISO_TARGETS.includeBackground,
                type: "switch",
              } satisfies ToolcraftControlSchema,
              background: {
                applicability: always,
                defaultValue: ISO_DEFAULTS.background,
                label: false,
                performanceRole: "responsiveness",
                target: ISO_TARGETS.background,
                type: "color",
              } satisfies ToolcraftControlSchema,
            },
            id: "background",
            layoutGroups: [
              { columns: 2, controls: ["includeBackground", "background"], layout: "inline" },
            ],
            title: "Background",
          },
          {
            controls: {
              size: {
                applicability: always,
                defaultValue: ISO_DEFAULTS.gridSize,
                description:
                  "Cells per side, from 2×2 to 8×8. Pieces and column heights outside the field are kept and return when it grows.",
                label: "Size",
                max: ISO_GRID_SIZE_RANGE.max,
                min: ISO_GRID_SIZE_RANGE.min,
                orderRole: "primary",
                performanceRole: "responsiveness",
                sliderValueKind: "discrete",
                step: 1,
                target: ISO_TARGETS.gridSize,
                type: "slider",
                unit: "cells",
                variant: "discrete",
              } satisfies ToolcraftControlSchema,
              cellSize: {
                applicability: always,
                defaultValue: ISO_DEFAULTS.cellSize,
                description: "Rhombus width of one cell; the field size on the canvas follows it.",
                label: "Cell",
                max: 240,
                min: 24,
                orderRole: "primary",
                performanceRole: "responsiveness",
                sliderValueKind: "continuous",
                step: 1,
                target: ISO_TARGETS.cellSize,
                type: "slider",
                unit: "px",
              } satisfies ToolcraftControlSchema,
              levelHeight: {
                applicability: always,
                defaultValue: ISO_DEFAULTS.levelHeight,
                description: "Height of one column level as a share of the cell width.",
                label: "Level",
                max: ISO_LEVEL_HEIGHT_RANGE.max,
                min: ISO_LEVEL_HEIGHT_RANGE.min,
                orderRole: "detail",
                performanceRole: "responsiveness",
                sliderValueKind: "continuous",
                step: 1,
                target: ISO_TARGETS.levelHeight,
                type: "slider",
                unit: "%",
              } satisfies ToolcraftControlSchema,
              visible: {
                applicability: always,
                defaultValue: ISO_DEFAULTS.gridVisible,
                label: "Visible",
                orderRole: "detail",
                performanceRole: "responsiveness",
                target: ISO_TARGETS.gridVisible,
                type: "switch",
              } satisfies ToolcraftControlSchema,
              hideHiddenLines: {
                applicability: always,
                defaultValue: ISO_DEFAULTS.hideHiddenLines,
                description:
                  "Shows raised columns as solid blocks: grid lines and fills behind them are hidden, leaving only the outer outlines.",
                label: "Solid",
                orderRole: "detail",
                performanceRole: "responsiveness",
                target: ISO_TARGETS.hideHiddenLines,
                type: "switch",
              } satisfies ToolcraftControlSchema,
            },
            id: "grid",
            layoutGroups: [
              { columns: 2, controls: ["visible", "hideHiddenLines"], layout: "inline" },
            ],
            title: "Grid",
          },
          {
            controls: {
              images: {
                accept: ".png,image/png",
                applicability: always,
                assetKind: "file",
                hardMaxItems: ISO_LIBRARY_MAX_OBJECTS,
                label: false,
                multiple: true,
                orderRole: "input",
                performanceRole: "responsiveness",
                target: ISO_TARGETS.libraryFiles,
                type: "fileDrop",
              } satisfies ToolcraftControlSchema,
            },
            description: "Transparent PNG rolls; each uploaded file becomes a placeable object.",
            id: "images",
            title: "Images",
          },
          {
            controls: {
              objects: {
                applicability: always,
                defaultValue: ISO_EMPTY_LIBRARY,
                description:
                  "Pick the active object, click the enlarged preview to set its floor anchor, and edit its name, footprint, and scale.",
                label: false,
                orderRole: "detail",
                performanceRole: "responsiveness",
                target: ISO_TARGETS.libraryObjects,
                type: isoObjectLibraryControlType,
              } satisfies ToolcraftControlSchema,
            },
            id: "library",
            title: "Objects",
          },
          {
            controls: {
              tool: {
                applicability: always,
                defaultValue: ISO_DEFAULTS.tool,
                description:
                  "Place puts the active object on a cell, Select drags a section, Erase removes an object or the section, Height drags columns up and down (magnet snaps to matching columns; Shift uses whole levels, Alt moves freely).",
                label: "Tool",
                options: [
                  { label: "Place", value: "place" },
                  { label: "Select", value: "select" },
                  { label: "Erase", value: "erase" },
                  { label: "Height", value: "height" },
                ],
                orderRole: "mode",
                performanceRole: "responsiveness",
                target: ISO_TARGETS.tool,
                type: "segmented",
              } satisfies ToolcraftControlSchema,
              commands: {
                actions: [
                  { icon: "wand-sparkles", label: "Fill section", value: ISO_ACTIONS.fillSelection },
                  { icon: "wand-sparkles", label: "Fill field", value: ISO_ACTIONS.fillField },
                  { icon: "eraser", label: "Clear field", value: ISO_ACTIONS.clearField },
                ],
                applicability: always,
                label: false,
                orderRole: "action",
                performanceRole: "responsiveness",
                target: ISO_TARGETS.commands,
                type: "actions",
              } satisfies ToolcraftControlSchema,
              composition: {
                applicability: always,
                defaultValue: ISO_EMPTY_PLACEMENTS,
                description: "Pieces per object on the field and the set at app card widths.",
                label: "Composition",
                orderRole: "detail",
                performanceRole: "responsiveness",
                target: ISO_TARGETS.placements,
                type: isoCompositionControlType,
              } satisfies ToolcraftControlSchema,
            },
            id: "field",
            title: "Field",
          },
          {
            controls: {
              pattern: {
                applicability: always,
                defaultValue: ISO_DEFAULTS.reliefPattern,
                description:
                  "Raises the columns live as you change the settings. Height tool edits are kept on top of the pattern.",
                label: "Pattern",
                options: [
                  { label: "Flat", value: "flat" },
                  { label: "Corner, diagonal", value: "corner-diagonal" },
                  { label: "Corner, rings", value: "corner-rings" },
                  { label: "Edge slope", value: "edge" },
                  { label: "Pyramid", value: "pyramid" },
                  { label: "Checker", value: "checker" },
                  { label: "Alternate rows", value: "alternate-rows" },
                  { label: "Alternate columns", value: "alternate-cols" },
                ],
                orderRole: "mode",
                performanceRole: "responsiveness",
                target: ISO_TARGETS.reliefPattern,
                type: "select",
              } satisfies ToolcraftControlSchema,
              corner: {
                applicability: usesCorner,
                defaultValue: ISO_DEFAULTS.reliefCorner,
                description: "Field corner that holds the peak.",
                label: "Peak",
                options: [
                  { label: "Top", value: "top" },
                  { label: "Right", value: "right" },
                  { label: "Bottom", value: "bottom" },
                  { label: "Left", value: "left" },
                ],
                orderRole: "primary",
                performanceRole: "responsiveness",
                target: ISO_TARGETS.reliefCorner,
                type: "segmented",
              } satisfies ToolcraftControlSchema,
              edge: {
                applicability: usesEdge,
                defaultValue: ISO_DEFAULTS.reliefEdge,
                description: "Field side the slope starts from.",
                label: "Side",
                options: [
                  { label: "↖", value: "top-left" },
                  { label: "↗", value: "top-right" },
                  { label: "↘", value: "bottom-right" },
                  { label: "↙", value: "bottom-left" },
                ],
                orderRole: "primary",
                performanceRole: "responsiveness",
                target: ISO_TARGETS.reliefEdge,
                type: "segmented",
              } satisfies ToolcraftControlSchema,
              max: {
                applicability: usesPeak,
                defaultValue: ISO_DEFAULTS.reliefMax,
                label: "Peak height",
                max: 8,
                min: 1,
                orderRole: "strength",
                performanceRole: "responsiveness",
                sliderValueKind: "discrete",
                step: 1,
                target: ISO_TARGETS.reliefMax,
                type: "slider",
                unit: "levels",
                variant: "discrete",
              } satisfies ToolcraftControlSchema,
              step: {
                applicability: usesFalloff,
                defaultValue: ISO_DEFAULTS.reliefStep,
                description: "How many cells the slope runs before dropping one level.",
                label: "Falloff",
                max: 4,
                min: 1,
                orderRole: "detail",
                performanceRole: "responsiveness",
                sliderValueKind: "discrete",
                step: 1,
                target: ISO_TARGETS.reliefStep,
                type: "slider",
                unit: "cells",
                variant: "discrete",
              } satisfies ToolcraftControlSchema,
              commands: {
                actions: [{ icon: "rotate-ccw", label: "Reset edits", value: ISO_RELIEF_ACTIONS.resetEdits }],
                applicability: always,
                label: false,
                orderRole: "action",
                performanceRole: "responsiveness",
                target: ISO_TARGETS.reliefCommands,
                type: "actions",
              } satisfies ToolcraftControlSchema,
            },
            id: "relief",
            title: "Relief",
          },
          {
            controls: {
              crop: {
                applicability: always,
                defaultValue: ISO_DEFAULTS.crop,
                description:
                  "Field and Content resize the artboard around the set so PNG export is cropped. Content hides empty cells outside the set.",
                label: "Crop",
                options: [
                  { label: "Off", value: "off" },
                  { label: "Field", value: "field" },
                  { label: "Content", value: "content" },
                ],
                orderRole: "mode",
                performanceRole: "responsiveness",
                target: ISO_TARGETS.crop,
                type: "segmented",
              } satisfies ToolcraftControlSchema,
              padding: {
                applicability: cropsToFrame,
                defaultValue: ISO_DEFAULTS.padding,
                label: "Padding",
                max: 200,
                min: 0,
                orderRole: "detail",
                performanceRole: "responsiveness",
                sliderValueKind: "continuous",
                step: 1,
                target: ISO_TARGETS.padding,
                type: "slider",
                unit: "px",
              } satisfies ToolcraftControlSchema,
              showPieces: {
                applicability: always,
                defaultValue: ISO_DEFAULTS.showPieces,
                description:
                  "Hides every roll on the canvas, in the card previews, and in the PNG. Pieces stay placed. Turn on Grid in export to save only the grid.",
                label: "Show rolls",
                orderRole: "detail",
                performanceRole: "responsiveness",
                target: ISO_TARGETS.showPieces,
                type: "switch",
              } satisfies ToolcraftControlSchema,
              includeGrid: {
                applicability: always,
                defaultValue: ISO_DEFAULTS.includeGrid,
                label: "Grid in export",
                orderRole: "detail",
                performanceRole: "responsiveness",
                target: ISO_TARGETS.includeGrid,
                type: "switch",
              } satisfies ToolcraftControlSchema,
            },
            id: "framing",
            title: "Framing",
          },
        ],
        title: "Sushi Set",
      },
    },
    persistence: {
      // Hand height edits are canvas-owned values without a panel control.
      additionalValueTargets: [ISO_TARGETS.reliefEdits],
      storage: "localStorage",
    },
    toolbar: {
      history: true,
      radar: true,
      zoom: true,
    },
  },
  modules: [mediaSourceModule(), canvasEditingModule(), imageExportModule()],
});
