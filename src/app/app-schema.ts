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
  ISO_LIBRARY_MAX_OBJECTS,
  ISO_TARGETS,
} from "./iso/iso-state";

const always = { mode: "always" } as const;
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
              preset: {
                applicability: always,
                defaultValue: ISO_DEFAULTS.gridPreset,
                description: "Switching the preset rebuilds the field; pieces outside it are hidden.",
                label: "Size",
                options: [
                  { label: "6×6", value: "6" },
                  { label: "12×12", value: "12" },
                ],
                orderRole: "mode",
                performanceRole: "responsiveness",
                target: ISO_TARGETS.gridPreset,
                type: "segmented",
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
              visible: {
                applicability: always,
                defaultValue: ISO_DEFAULTS.gridVisible,
                label: "Visible",
                orderRole: "detail",
                performanceRole: "responsiveness",
                target: ISO_TARGETS.gridVisible,
                type: "switch",
              } satisfies ToolcraftControlSchema,
            },
            id: "grid",
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
                  "Place puts the active object on the clicked cell, Select drags a section, Erase removes a clicked object or the selected section.",
                label: "Tool",
                options: [
                  { label: "Place", value: "place" },
                  { label: "Select", value: "select" },
                  { label: "Erase", value: "erase" },
                ],
                orderRole: "mode",
                performanceRole: "responsiveness",
                target: ISO_TARGETS.tool,
                type: "segmented",
              } satisfies ToolcraftControlSchema,
              commands: {
                actions: [
                  { label: "Fill section", value: ISO_ACTIONS.fillSelection },
                  { label: "Fill field", value: ISO_ACTIONS.fillField },
                  { label: "Clear field", value: ISO_ACTIONS.clearField },
                ],
                applicability: always,
                label: false,
                orderRole: "action",
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
              opacity: {
                applicability: always,
                defaultValue: ISO_DEFAULTS.shadowOpacity,
                label: "Opacity",
                max: 100,
                min: 0,
                orderRole: "strength",
                performanceRole: "responsiveness",
                sliderValueKind: "continuous",
                step: 1,
                target: ISO_TARGETS.shadowOpacity,
                type: "slider",
                unit: "%",
              } satisfies ToolcraftControlSchema,
              blur: {
                applicability: always,
                defaultValue: ISO_DEFAULTS.shadowBlur,
                label: "Blur",
                max: 40,
                min: 0,
                orderRole: "detail",
                performanceRole: "responsiveness",
                sliderValueKind: "continuous",
                step: 0.5,
                target: ISO_TARGETS.shadowBlur,
                type: "slider",
                unit: "px",
              } satisfies ToolcraftControlSchema,
            },
            id: "shadow",
            title: "Shadow",
          },
          {
            controls: {
              offset: {
                applicability: always,
                defaultValue: ISO_DEFAULTS.shadowOffset,
                description: "Moves every shadow by up to half a cell in each direction.",
                label: false,
                orderRole: "spatial",
                performanceRole: "responsiveness",
                target: ISO_TARGETS.shadowOffset,
                type: "vector",
              } satisfies ToolcraftControlSchema,
            },
            id: "shadow-offset",
            title: "Shadow Offset",
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
    toolbar: {
      history: true,
      radar: true,
      zoom: true,
    },
  },
  modules: [mediaSourceModule(), canvasEditingModule(), imageExportModule()],
});
