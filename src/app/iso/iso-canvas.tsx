import * as React from "react";

import type { ToolcraftMediaAsset, ToolcraftState } from "@/toolcraft/runtime";
import {
  useToolcraftDispatch,
  useToolcraftMediaPresentationUrls,
  useToolcraftPipeline,
  useToolcraftPipelinePass,
  useToolcraftProductSceneFrame,
  useToolcraftSelector,
} from "@/toolcraft/runtime/react";
import { Button } from "@/toolcraft/ui";

import {
  clampIsoCell,
  getIsoCellCommand,
  getIsoCellRectPolygon,
  getIsoEraseTarget,
  isSameIsoCell,
  moveIsoSelectDrag,
  toIsoFramePoint,
  type IsoFieldContext,
  type IsoSelectDrag,
} from "./iso-field";
import {
  checkPlacement,
  getCellAtPoint,
  getFootprintDiamond,
  normalizeCellRect,
  type IsoCell,
  type IsoCropMode,
  type IsoPoint,
  type IsoSceneModel,
} from "./iso-geometry";
import { createIsoImageStore } from "./iso-image-store";
import {
  ISO_OBJECT_IMAGES_KEY,
  isoEditorOverlayPass,
  isoObjectImagesPass,
  isoPreviewSvgPass,
  isoSceneLayoutPass,
} from "./iso-pipeline";
import { getIsoViewBox, IsoSceneLayers, toSvgPath } from "./iso-scene";
import {
  buildIsoSceneModelFromState,
  createIsoLibraryCommand,
  createIsoObjectRecord,
  createIsoSelectionCommand,
  getIsoActiveObjectId,
  getIsoActivePlacements,
  getIsoLibraryAssets,
  getIsoLibraryObjects,
  normalizeIsoObjectRecord,
  readIsoGridVisible,
  readIsoLibraryValue,
  readIsoSceneInput,
  readIsoSelection,
  readIsoTool,
  ISO_FIELD_HANDLE_TEST_ID,
  ISO_TARGETS,
  type IsoStateSource,
} from "./iso-state";
import styles from "./iso-canvas.module.css";

const selectValues = (state: ToolcraftState) => state.values;
const selectMediaAssets = (state: ToolcraftState) => state.mediaAssets;
const selectCanvas = (state: ToolcraftState) => state.canvas;

/** Keeps decoded object images registered and object records complete. */
function useIsoLibrarySync(source: IsoStateSource & { mediaAssets: readonly ToolcraftMediaAsset[] }) {
  const dispatch = useToolcraftDispatch();
  const libraryAssets = React.useMemo(
    () => getIsoLibraryAssets<ToolcraftMediaAsset>(source.mediaAssets),
    [source.mediaAssets],
  );
  const urls = useToolcraftMediaPresentationUrls(libraryAssets);
  const storeState = useToolcraftPipelinePass(
    isoObjectImagesPass,
    { "library.images": ISO_OBJECT_IMAGES_KEY },
    (pass) =>
      pass.getOrCreateResource(
        [ISO_OBJECT_IMAGES_KEY],
        createIsoImageStore,
        (store) => store.dispose(),
      ),
  );
  const store = storeState.status === "success" ? storeState.result : null;
  const registeredRef = React.useRef(new Map<string, string>());
  const valuesRef = React.useRef(source.values);
  valuesRef.current = source.values;
  const libraryValue = source.values[ISO_TARGETS.libraryObjects];

  React.useEffect(() => {
    if (!store) return;
    const next = new Map<string, string>(
      libraryAssets.flatMap((asset) => {
        const url = urls.get(asset.id);
        return url && "resourceRef" in asset ? [[asset.resourceRef, url] as const] : [];
      }),
    );
    [...registeredRef.current.keys()]
      .filter((resourceRef) => !next.has(resourceRef))
      .forEach((resourceRef) => store.unregister(resourceRef));
    next.forEach((url, resourceRef) => store.register(resourceRef, url));
    registeredRef.current = next;
  }, [libraryAssets, store, urls]);

  React.useEffect(() => {
    const library = readIsoLibraryValue(valuesRef.current);
    const missing = libraryAssets.filter((asset) => !Object.hasOwn(library.items, asset.id));
    if (missing.length > 0) {
      dispatch(
        createIsoLibraryCommand(
          {
            activeId: library.activeId,
            items: {
              ...library.items,
              ...Object.fromEntries(
                missing.map((asset) => [asset.id, createIsoObjectRecord(asset.fileName)]),
              ),
            },
          },
          "Add objects",
          "skip",
        ),
      );
      return;
    }
    if (!store) return;
    const unsized = libraryAssets.flatMap((asset) =>
      "resourceRef" in asset &&
      urls.has(asset.id) &&
      !normalizeIsoObjectRecord(library.items[asset.id], asset.fileName).size
        ? [{ fileName: asset.fileName, id: asset.id, resourceRef: asset.resourceRef }]
        : [],
    );
    if (unsized.length === 0) return;
    let cancelled = false;
    void Promise.all(
      unsized.map((asset) =>
        store.load(asset.resourceRef).then(
          (image) => ({ ...asset, size: { height: image.height, width: image.width } }),
          () => null,
        ),
      ),
    ).then((measured) => {
      if (cancelled) return;
      const latest = readIsoLibraryValue(valuesRef.current);
      const sized = measured.flatMap((entry) => {
        if (!entry || !Object.hasOwn(latest.items, entry.id)) return [];
        const record = normalizeIsoObjectRecord(latest.items[entry.id], entry.fileName);
        return record.size ? [] : [[entry.id, { ...record, size: entry.size }] as const];
      });
      if (sized.length > 0) {
        dispatch(
          createIsoLibraryCommand(
            { activeId: latest.activeId, items: { ...latest.items, ...Object.fromEntries(sized) } },
            "Measure objects",
            "skip",
          ),
        );
      }
    });
    return () => {
      cancelled = true;
    };
  }, [dispatch, libraryAssets, libraryValue, store, urls]);

  return { libraryAssets, urls };
}

/** Fits the finite artboard to the set and keeps the view steady when the set recentres. */
function useIsoArtboardFit(model: IsoSceneModel | null, crop: IsoCropMode) {
  const dispatch = useToolcraftDispatch();
  const canvas = useToolcraftSelector(selectCanvas);
  const canvasRef = React.useRef(canvas);
  canvasRef.current = canvas;
  const fitRef = React.useRef<Readonly<{
    center: IsoPoint;
    crop: IsoCropMode;
    height: number;
    width: number;
  }> | null>(null);

  React.useEffect(() => {
    if (!model) return;
    const previous = fitRef.current;
    const next = {
      center: model.center,
      crop,
      height: model.frame.height,
      width: model.frame.width,
    };
    fitRef.current = next;
    // The first model only records the baseline, so reloads keep persisted canvas state.
    if (!previous) return;
    const current = canvasRef.current;
    const dx = next.center.x - previous.center.x;
    const dy = next.center.y - previous.center.y;
    if ((dx !== 0 || dy !== 0) && (crop !== "off" || current.mode === "infinite")) {
      const zoom = current.zoom / 100;
      dispatch({
        offset: { x: current.offset.x + dx * zoom, y: current.offset.y + dy * zoom },
        type: "canvas.setOffset",
      });
    }
    const frameChanged =
      next.width !== previous.width || next.height !== previous.height || next.crop !== previous.crop;
    if (crop !== "off" && frameChanged && current.mode === "finite") {
      dispatch({
        history: "skip",
        label: "Fit artboard",
        mode: "finite",
        size: { height: next.height, unit: "px", width: next.width },
        type: "canvas.applySettings",
      });
    }
  }, [crop, dispatch, model]);
}

const KEY_STEPS: Readonly<Record<string, IsoCell>> = {
  ArrowDown: { col: 1, row: 1 },
  ArrowLeft: { col: -1, row: 1 },
  ArrowRight: { col: 1, row: -1 },
  ArrowUp: { col: -1, row: -1 },
};

export function IsoCanvas(): React.JSX.Element | null {
  const dispatch = useToolcraftDispatch();
  const pipeline = useToolcraftPipeline();
  const frame = useToolcraftProductSceneFrame();
  const values = useToolcraftSelector(selectValues);
  const mediaAssets = useToolcraftSelector(selectMediaAssets);
  const source = React.useMemo(() => ({ mediaAssets, values }), [mediaAssets, values]);
  const sourceRef = React.useRef(source);
  sourceRef.current = source;

  const { libraryAssets, urls } = useIsoLibrarySync(source);
  const libraryKey = libraryAssets
    .map((asset) => `${asset.id}:${"resourceRef" in asset ? asset.resourceRef : ""}`)
    .join("|");

  const layout = useToolcraftPipelinePass(
    isoSceneLayoutPass,
    {
      "field.placements": values[ISO_TARGETS.placements],
      "grid.cellSize": values[ISO_TARGETS.cellSize],
      "grid.preset": values[ISO_TARGETS.gridPreset],
      "library.files": libraryKey,
      "library.objects": values[ISO_TARGETS.libraryObjects],
      "output.crop": values[ISO_TARGETS.crop],
      "output.includeGrid": values[ISO_TARGETS.includeGrid],
      "output.padding": values[ISO_TARGETS.padding],
      "shadow.blur": values[ISO_TARGETS.shadowBlur],
      "shadow.offset": values[ISO_TARGETS.shadowOffset],
      "shadow.opacity": values[ISO_TARGETS.shadowOpacity],
    },
    () => buildIsoSceneModelFromState(sourceRef.current),
  );
  const lastModelRef = React.useRef<IsoSceneModel | null>(null);
  if (layout.status === "success") lastModelRef.current = layout.result;
  const model =
    layout.status === "error" ? buildIsoSceneModelFromState(source) : lastModelRef.current;

  const input = readIsoSceneInput(source);
  const tool = readIsoTool(values);
  const gridVisible = readIsoGridVisible(values);
  const selection = readIsoSelection(values);
  const placements = getIsoActivePlacements(source);
  const activeId = getIsoActiveObjectId(source);
  const active = getIsoLibraryObjects(source).find((object) => object.id === activeId) ?? null;

  useIsoArtboardFit(model, input.crop);

  const [cursor, setCursor] = React.useState<IsoCell | null>(null);
  const [erasePoint, setErasePoint] = React.useState<IsoPoint | null>(null);
  const [drag, setDrag] = React.useState<IsoSelectDrag | null>(null);
  const shownSelection = drag ? normalizeCellRect(drag.from, drag.to) : selection;
  const overlayKey = `${tool}|${JSON.stringify(shownSelection)}|${cursor?.col},${cursor?.row}|${erasePoint?.x},${erasePoint?.y}`;

  React.useLayoutEffect(() => {
    if (!pipeline || !model) return;
    pipeline.runPass(isoPreviewSvgPass, undefined, () => undefined).catch(() => undefined);
  }, [gridVisible, model, pipeline, urls]);

  React.useLayoutEffect(() => {
    if (!pipeline) return;
    pipeline.runPass(isoEditorOverlayPass, undefined, () => undefined).catch(() => undefined);
  }, [overlayKey, pipeline]);

  if (frame.kind !== "ready" || !model) return null;

  const field: IsoFieldContext = {
    active,
    cellSize: input.cellSize,
    gridSize: input.gridSize,
    model,
    placements,
    selection,
    tool,
  };

  const pointFromEvent = (event: React.PointerEvent<HTMLButtonElement>): IsoPoint => {
    const box = event.currentTarget.getBoundingClientRect();
    return toIsoFramePoint(
      model,
      box.width,
      box.height,
      event.clientX - box.left,
      event.clientY - box.top,
    );
  };

  const handlePointerDown = (event: React.PointerEvent<HTMLButtonElement>) => {
    if (event.button !== 0) return;
    event.preventDefault();
    const point = pointFromEvent(event);
    const cell = getCellAtPoint(point, input.gridSize, input.cellSize);
    setCursor(cell);
    if (tool === "select") {
      if (!cell) {
        if (selection) dispatch(createIsoSelectionCommand(null));
        return;
      }
      event.currentTarget.setPointerCapture(event.pointerId);
      setDrag({ from: cell, pointerId: event.pointerId, to: cell });
      return;
    }
    const command = getIsoCellCommand(field, cell, point);
    if (command) dispatch(command);
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLButtonElement>) => {
    const point = pointFromEvent(event);
    const cell = getCellAtPoint(point, input.gridSize, input.cellSize);
    const pointerId = event.pointerId;
    const clamped = clampIsoCell(point, input.gridSize, input.cellSize);
    setCursor((previous) => (isSameIsoCell(previous, cell) ? previous : cell));
    setErasePoint(tool === "erase" ? point : null);
    setDrag((current) => moveIsoSelectDrag(current, pointerId, clamped));
  };

  const handlePointerUp = (event: React.PointerEvent<HTMLButtonElement>) => {
    const pointerId = event.pointerId;
    if (!drag || drag.pointerId !== pointerId) return;
    dispatch(createIsoSelectionCommand(normalizeCellRect(drag.from, drag.to)));
    setDrag(null);
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    const step = KEY_STEPS[event.key];
    if (step) {
      event.preventDefault();
      const origin = cursor ?? { col: 0, row: 0 };
      setErasePoint(null);
      setCursor({
        col: Math.min(input.gridSize - 1, Math.max(0, origin.col + (cursor ? step.col : 0))),
        row: Math.min(input.gridSize - 1, Math.max(0, origin.row + (cursor ? step.row : 0))),
      });
      return;
    }
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    if (!cursor) return;
    if (tool === "select") {
      const anchor =
        event.shiftKey && selection ? { col: selection.col0, row: selection.row0 } : cursor;
      dispatch(createIsoSelectionCommand(normalizeCellRect(anchor, cursor)));
      return;
    }
    const command = getIsoCellCommand(field, cursor, null);
    if (command) dispatch(command);
  };

  let hoverOverlay: React.ReactNode = null;
  if (cursor && tool === "place" && active) {
    const valid = checkPlacement(
      placements,
      cursor.col,
      cursor.row,
      active.record.footprint,
      input.gridSize,
    ).ok;
    hoverOverlay = (
      <path
        className={valid ? styles.hoverValid : styles.hoverInvalid}
        d={toSvgPath([
          getFootprintDiamond(cursor.col, cursor.row, active.record.footprint, input.cellSize),
        ])}
        data-iso-hover={valid ? "valid" : "invalid"}
        strokeWidth={1.5}
        vectorEffect="non-scaling-stroke"
      />
    );
  } else if (tool === "erase") {
    const target = getIsoEraseTarget(field, cursor, erasePoint);
    const item =
      target.kind === "placement"
        ? model.items.find((candidate) => candidate.placement.id === target.id)
        : undefined;
    hoverOverlay = item ? (
      <path
        className={styles.hoverInvalid}
        d={toSvgPath([item.diamond])}
        data-iso-hover="erase"
        strokeWidth={1.5}
        vectorEffect="non-scaling-stroke"
      />
    ) : null;
  } else if (cursor && tool === "select" && !drag) {
    hoverOverlay = (
      <path
        className={styles.hoverCell}
        d={toSvgPath([getFootprintDiamond(cursor.col, cursor.row, "1x1", input.cellSize)])}
        strokeWidth={1}
        vectorEffect="non-scaling-stroke"
      />
    );
  }

  const viewBox = getIsoViewBox(model);

  return (
    <div className={styles.stage} style={{ height: model.frame.height, width: model.frame.width }}>
      <svg
        className={styles.scene}
        data-toolcraft-product-output="sushi-set"
        height={model.frame.height}
        viewBox={viewBox}
        width={model.frame.width}
        xmlns="http://www.w3.org/2000/svg"
      >
        <IsoSceneLayers
          appearance={{
            cellSize: input.cellSize,
            gridSize: input.gridSize,
            shadowBlur: input.shadow.blur,
            shadowOpacity: input.shadow.opacity,
            showGrid: gridVisible,
          }}
          imageUrls={urls}
          model={model}
        />
      </svg>
      <Button
        aria-label={`Sushi set field, ${tool} tool`}
        className={styles.fieldHandle}
        data-iso-tool={tool}
        data-slot="iso-field-handle"
        data-testid={ISO_FIELD_HANDLE_TEST_ID}
        data-toolcraft-canvas-handle=""
        onKeyDown={handleKeyDown}
        onLostPointerCapture={() => setDrag(null)}
        onPointerCancel={() => setDrag(null)}
        onPointerDown={handlePointerDown}
        onPointerLeave={() => {
          setCursor(null);
          setErasePoint(null);
        }}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        type="button"
        variant="ghost-static"
      >
        <svg
          aria-hidden="true"
          className={styles.overlay}
          data-iso-layer="overlay"
          preserveAspectRatio="none"
          viewBox={viewBox}
          xmlns="http://www.w3.org/2000/svg"
        >
          {shownSelection ? (
            <path
              className={styles.selection}
              d={toSvgPath([getIsoCellRectPolygon(shownSelection, input.cellSize)])}
              data-iso-selection={`${shownSelection.col0},${shownSelection.row0},${shownSelection.col1},${shownSelection.row1}`}
              strokeWidth={1.5}
              vectorEffect="non-scaling-stroke"
            />
          ) : null}
          {hoverOverlay}
        </svg>
      </Button>
    </div>
  );
}
