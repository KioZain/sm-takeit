import type { ToolcraftControlSectionInventoryEntry } from "./acceptance/types";
import { ISO_TARGETS } from "./iso/iso-state";

export const appControlSectionInventory: readonly ToolcraftControlSectionInventoryEntry[] = [
  {
    entity: "Output background",
    entityId: "output-background",
    finiteSelectors: [
      {
        affectedTargets: [ISO_TARGETS.background],
        reason: "Background inclusion decides whether the colour is painted behind the set.",
        role: "branch",
        target: ISO_TARGETS.includeBackground,
      },
    ],
    groupingReason: "Inclusion and colour together define the background behind the set.",
    id: "background",
    targets: [ISO_TARGETS.includeBackground, ISO_TARGETS.background],
    title: "Background",
  },
  {
    entity: "Isometric grid",
    entityId: "isometric-grid",
    finiteSelectors: [
      {
        reason: "The preset changes only the field's cell count.",
        role: "parameter",
        target: ISO_TARGETS.gridPreset,
      },
      {
        reason: "Visibility changes only whether the dashed field is drawn.",
        role: "parameter",
        target: ISO_TARGETS.gridVisible,
      },
    ],
    groupingReason: "Preset, cell size, and visibility together define the rhombus field.",
    id: "grid",
    targets: [ISO_TARGETS.gridPreset, ISO_TARGETS.cellSize, ISO_TARGETS.gridVisible],
    title: "Grid",
  },
  {
    entity: "Object library",
    entityId: "object-library",
    finiteSelectors: [],
    groupingReason: "Uploaded images are the source files of the placeable library.",
    id: "images",
    splitReason:
      "Uploading, reordering, and removing source PNGs is a separate task from configuring objects and resets only the uploads.",
    targets: [ISO_TARGETS.libraryFiles],
    title: "Images",
    workflowStage: "upload",
  },
  {
    entity: "Object library",
    entityId: "object-library",
    finiteSelectors: [],
    groupingReason: "The active object choice and its per-object settings configure the placeable library.",
    id: "library",
    splitReason:
      "Choosing the active object and editing its anchor, footprint, and scale is a distinct task whose reset keeps the uploads.",
    targets: [ISO_TARGETS.libraryObjects],
    title: "Objects",
    workflowStage: "configure",
  },
  {
    entity: "Field composition",
    entityId: "field-composition",
    finiteSelectors: [
      {
        reason: "The tool changes only what a click on the field does.",
        role: "parameter",
        target: ISO_TARGETS.tool,
      },
    ],
    groupingReason: "Tools, fill commands, and the composition summary all edit or read the placed pieces.",
    id: "field",
    targets: [ISO_TARGETS.tool, ISO_TARGETS.commands, ISO_TARGETS.placements],
    title: "Field",
  },
  {
    entity: "Piece shadows",
    entityId: "piece-shadows",
    finiteSelectors: [],
    groupingReason: "Opacity and blur together set how dark and soft the shadow layer is.",
    id: "shadow",
    splitReason:
      "Tuning shadow strength and softness is separate from positioning the shadows and resets independently.",
    targets: [ISO_TARGETS.shadowOpacity, ISO_TARGETS.shadowBlur],
    title: "Shadow",
    workflowStage: "appearance",
  },
  {
    entity: "Piece shadows",
    entityId: "piece-shadows",
    finiteSelectors: [],
    groupingReason: "The offset pad positions the shadow layer relative to every footprint.",
    id: "shadow-offset",
    splitReason:
      "Positioning shadows with the square pad is its own task and resets without changing shadow strength.",
    targets: [ISO_TARGETS.shadowOffset],
    title: "Shadow Offset",
    workflowStage: "offset",
  },
  {
    entity: "Export framing",
    entityId: "export-framing",
    finiteSelectors: [
      {
        affectedTargets: [],
        reason: "Crop mode decides whether the artboard is fitted and whether padding applies.",
        role: "branch",
        target: ISO_TARGETS.crop,
      },
      {
        reason: "Grid in export changes only whether dashed lines are drawn into the PNG.",
        role: "parameter",
        target: ISO_TARGETS.includeGrid,
      },
    ],
    groupingReason: "Crop, padding, and grid inclusion together decide the exported frame.",
    id: "framing",
    targets: [ISO_TARGETS.crop, ISO_TARGETS.padding, ISO_TARGETS.includeGrid],
    title: "Framing",
  },
  {
    entity: "Image delivery",
    entityId: "image-delivery",
    finiteSelectors: [
      {
        reason: "Image format changes its own exported artifact encoding.",
        role: "parameter",
        target: "export.image.format",
      },
      {
        reason: "Image resolution changes its own exported artifact dimensions.",
        role: "parameter",
        target: "export.image.resolution",
      },
    ],
    groupingReason: "Format and resolution together configure the exported set image.",
    id: "runtime.image-export",
    targets: ["export.image.format", "export.image.resolution"],
    title: "Image Export",
  },
];
