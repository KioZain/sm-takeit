import type { ToolcraftControlSectionInventoryEntry } from "./acceptance/types";
import { ISO_TARGETS } from "./iso/iso-state";

export const appControlSectionInventory: readonly ToolcraftControlSectionInventoryEntry[] = [
  {
    entity: "Generator presets",
    entityId: "generator-presets",
    finiteSelectors: [],
    groupingReason: "Numbered buttons apply complete grid and relief setups in one step.",
    id: "presets",
    targets: [ISO_TARGETS.presets],
    title: "Presets",
  },
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
        reason: "Size changes only the field's cell count per side.",
        role: "parameter",
        target: ISO_TARGETS.gridSize,
      },
      {
        reason: "Visibility changes only whether the dashed field is drawn.",
        role: "parameter",
        target: ISO_TARGETS.gridVisible,
      },
      {
        reason: "Solid changes only which guide lines and fills stay visible.",
        role: "parameter",
        target: ISO_TARGETS.hideHiddenLines,
      },
    ],
    groupingReason: "Size, cell size, level height, and visibility together define the rhombus field and its columns.",
    id: "grid",
    targets: [ISO_TARGETS.gridSize, ISO_TARGETS.cellSize, ISO_TARGETS.levelHeight, ISO_TARGETS.gridVisible, ISO_TARGETS.hideHiddenLines],
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
    entity: "Field relief",
    entityId: "field-relief",
    finiteSelectors: [
      {
        affectedTargets: [],
        reason: "The pattern decides the live column shape and whether a peak corner, slope side, peak height, or falloff applies.",
        role: "branch",
        target: ISO_TARGETS.reliefPattern,
      },
      {
        reason: "The peak corner changes only where the pattern starts.",
        role: "parameter",
        target: ISO_TARGETS.reliefCorner,
      },
      {
        reason: "The slope side changes only where the pattern starts.",
        role: "parameter",
        target: ISO_TARGETS.reliefEdge,
      },
      {
        reason: "Peak height changes only how many levels the pattern writes.",
        role: "parameter",
        target: ISO_TARGETS.reliefMax,
      },
      {
        reason: "Falloff changes only how many cells share each level.",
        role: "parameter",
        target: ISO_TARGETS.reliefStep,
      },
      {
        affectedTargets: [],
        reason: "Wave decides whether the pattern is static or a looping wave with its own length and direction.",
        role: "branch",
        target: ISO_TARGETS.reliefWave,
      },
      {
        reason: "Wave length changes only the spacing between crests.",
        role: "parameter",
        target: ISO_TARGETS.reliefWaveLength,
      },
      {
        reason: "Direction changes only which way the crests travel.",
        role: "parameter",
        target: ISO_TARGETS.reliefWaveDirection,
      },
      {
        reason: "Easing changes only how columns accelerate between trough and crest.",
        role: "parameter",
        target: ISO_TARGETS.reliefWaveEasing,
      },
    ],
    groupingReason: "Pattern, direction, height, and falloff together define the live column relief under the hand edits.",
    id: "relief",
    targets: [
      ISO_TARGETS.reliefPattern,
      ISO_TARGETS.reliefCorner,
      ISO_TARGETS.reliefEdge,
      ISO_TARGETS.reliefMax,
      ISO_TARGETS.reliefStep,
      ISO_TARGETS.reliefWave,
      ISO_TARGETS.reliefWaveLength,
      ISO_TARGETS.reliefWaveDirection,
      ISO_TARGETS.reliefWaveEasing,
      ISO_TARGETS.reliefCommands,
    ],
    title: "Relief",
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
        reason: "Show rolls changes only whether piece images are drawn and exported.",
        role: "parameter",
        target: ISO_TARGETS.showPieces,
      },
      {
        reason: "Grid in export changes only whether dashed lines are drawn into the PNG.",
        role: "parameter",
        target: ISO_TARGETS.includeGrid,
      },
    ],
    groupingReason: "Crop, padding, roll visibility, and grid inclusion together decide what the exported frame shows.",
    id: "framing",
    targets: [ISO_TARGETS.crop, ISO_TARGETS.padding, ISO_TARGETS.showPieces, ISO_TARGETS.includeGrid],
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
  {
    entity: "Video delivery",
    entityId: "video-delivery",
    finiteSelectors: [
      {
        reason: "Video format changes its own exported container.",
        role: "parameter",
        target: "export.video.format",
      },
      {
        reason: "Video resolution changes its own exported dimensions.",
        role: "parameter",
        target: "export.video.resolution",
      },
    ],
    groupingReason: "Format and resolution together configure the exported wave video.",
    id: "runtime.video-export",
    targets: ["export.video.format", "export.video.resolution"],
    title: "Video Export",
  },
];
