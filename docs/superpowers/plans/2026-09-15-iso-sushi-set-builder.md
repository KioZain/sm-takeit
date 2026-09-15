# Iso Sushi Set Builder — first delivery plan

Substantial work: a new multi-capability product (SVG preview renderer, canvas
editing interactions, three custom controls, runtime export integration,
acceptance and browser proof). Implementation proceeds without an approval gate.

## Confirmed user decisions

- Export uses the runtime Image Export (PNG/JPG, 2K/4K/8K long edge). @1x/@2x/@3x
  is deferred: runtime has no scale presets and product-owned downloads are
  rejected by the export boundary.
- Transparent cropped PNG is achieved by fitting the finite artboard (Background
  off) instead of Infinity crop (opaque).

## Design decisions

- Library upload: `fileDrop` `assetKind: "file"`, `multiple`, PNG accept,
  `hardMaxItems: 24`. File kind avoids runtime rotate/flip actions (the request
  forbids mirroring/rotation) and keeps per-row removal and multi-file drops.
- Per-object settings live in custom control `library.objects`
  (`{ activeId, items: { [mediaId]: { name, footprint, anchor, scale, size } } }`).
  The FileDrop collection variant cannot do multi-file import, arbitrary removal,
  anchor click on an enlarged preview, or active selection. Missing records are
  created by the always-mounted canvas component; `size` is captured on decode
  so scene bounds stay a pure function of state.
- Placements live in custom control `field.placements`
  (`{ items: [{ id, objectId, col, row, footprint }] }`); col/row is the far
  corner. The same control shows the per-object counter, the total and the card
  previews (170 px inline, 340 px in a popover because the panel is 300 px).
  Placements whose object was deleted or that fall outside the grid are ignored on
  read and pruned on the next write, so one Undo restores a deleted object with
  its cells.
- Section selection is canvas interaction state `field.selection`
  (`controls.setValue`, history skip).
- Crop is `output.crop` = Off | Field | Content (default Field). Runtime clips the
  finite artboard, so Content (exact content crop) hides cells outside the set;
  Field keeps the whole field editable. Fitting reacts only to composition
  geometry changes (never mount/hydration), preserving manual Canvas size and
  reload semantics, and compensates `canvas.offset` when the composition center
  moves so the grid does not jump.
- Rendering: SVG preview (dashed non-scaling grid, one blurred shadow path layer,
  sorted `<image>` objects), Canvas 2D export through `scene.rasterFrameRenderer`
  drawing the same scene model. Order: primary key far-corner (col+row, col),
  corrected by a stable topological pass for multi-cell footprints.
- Anchor maps to the floor center of the footprint; scale is image width relative
  to the footprint's projected width.

## Owners

- `src/app/iso/iso-geometry.ts` — projection, footprints, order, bounds, crop,
  placement operations (pure, unit tested).
- `src/app/iso/iso-state.ts` — targets, defaults, normalized readers.
- `src/app/iso/iso-scene.tsx` — shared SVG scene (canvas + card previews).
- `src/app/iso/iso-canvas.tsx` — canvasContent: scene, overlay, tools, fit,
  record/size sync, image URL registration.
- `src/app/iso/iso-export.ts` — raster frame renderer.
- `src/app/iso/iso-object-library-control.tsx`, `iso-composition-control.tsx` —
  custom controls from public primitives only.
- `src/app/iso/iso-pipeline.ts` — renderer pipeline registration.
- `app-schema.ts`, `app-composition.tsx`, `app-acceptance-data.ts`,
  `app-performance.ts`, worklog, product e2e specs.

## Verification

Verification tier: Tier 4
Reason: first product delivery of a fresh generated app (renderer, canvas
interactions, custom controls, export, persistence).
Run: focused `vitest` for `src/app/iso`, `npm run typecheck`, `npm run test`
while developing, focused product Playwright specs, then one bare
`npm run verify:delivery` and `npm run dev`.
Skip: measured performance and `verify:perf` (no request authority).
