import type { ToolcraftInteractionOwnershipEntry } from "./acceptance/types";
import { ISO_TARGETS } from "./iso/iso-state";

/** Canvas tools commit placements through the runtime value command. */
export const canvasPlacementCommand = "controls.setValue";

export const appInteractionOwnership: readonly ToolcraftInteractionOwnershipEntry[] = [
  {
    alternative: {
      reason: "A panel cell picker would detach placement from the isometric field it edits.",
      surface: "panel",
    },
    capability: "direct-spatial-edit",
    evidence: {
      detail: "The request says a click on a cell places the active object on the field.",
      source: "user-request",
    },
    id: "field-place",
    reason: "The canvas owns placement because the clicked cell is the far corner of the footprint.",
    surface: "canvas",
    target: canvasPlacementCommand,
  },
  {
    alternative: {
      reason: "A panel list of pieces could not show which piece sits where on the field.",
      surface: "panel",
    },
    capability: "collection-edit",
    evidence: {
      detail: "The request says the Eraser removes the clicked object or the selected section.",
      source: "user-request",
    },
    id: "field-erase",
    reason: "The canvas owns erasing because the user points at the object or section to remove.",
    surface: "canvas",
    target: canvasPlacementCommand,
  },
  {
    alternative: {
      reason: "Canvas buttons would put app chrome over the product output.",
      surface: "canvas",
    },
    capability: "command",
    evidence: {
      detail: "The request lists Fill section, Fill whole field, and Clear field buttons.",
      source: "user-request",
    },
    id: "field-commands",
    reason: "The panel owns whole-field commands that do not target one cell.",
    surface: "panel",
    target: ISO_TARGETS.commands,
  },
  {
    alternative: {
      reason: "Picking objects on the canvas would conflict with the Place and Erase tools.",
      surface: "canvas",
    },
    capability: "structured-selection",
    evidence: {
      detail: "The request says the active object is chosen in the library before clicking cells.",
      source: "user-request",
    },
    id: "object-select",
    reason: "The panel library owns the active object choice next to its thumbnails.",
    surface: "panel",
    target: ISO_TARGETS.libraryObjects,
  },
  {
    alternative: {
      reason: "Naming and listing saved setups has no spatial meaning on the field.",
      surface: "canvas",
    },
    capability: "precise-value-entry",
    evidence: {
      detail: "The request asks for a Save preset button with a name that can be edited later.",
      source: "user-request",
    },
    id: "saved-presets",
    reason: "The panel owns naming, applying, and removing the owner's saved setups.",
    selectionScope: { mode: "global" },
    surface: "panel",
    target: ISO_TARGETS.savedPresets,
  },
  {
    alternative: {
      reason: "Per-object anchor, footprint, and scale have no spatial handle on the field.",
      surface: "canvas",
    },
    capability: "property-edit",
    evidence: {
      detail: "The request says the anchor is set by clicking the enlarged object preview in the library.",
      source: "user-request",
    },
    id: "object-properties",
    reason: "The panel edits the selected object's name, footprint, anchor, and scale.",
    selectionScope: { mode: "selected-entity", selectionInteractionId: "object-select" },
    surface: "panel",
    target: ISO_TARGETS.libraryObjects,
  },
];
