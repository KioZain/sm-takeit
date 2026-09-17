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
  getIsoCellAt,
  getIsoCellCommand,
  getIsoHeightStepCommand,
  isSameIsoCell,
  moveIsoHeightDrag,
  moveIsoSelectDrag,
  startIsoHeightDrag,
  toIsoFramePoint,
  type IsoFieldContext,
  type IsoHeightGesture,
  type IsoSelectDrag,
} from "./iso-field";
import {
  normalizeCellRect,
  type IsoCell,
  type IsoCropMode,
  type IsoPoint,
  type IsoSceneModel,
} from "./iso-geometry";
import { createIsoImageStore } from "./iso-image-store";
import { getIsoOverlayPaths } from "./iso-overlay";
import {
  ISO_OBJECT_IMAGES_KEY,
  isoEditorOverlayPass,
  isoObjectImagesPass,
  isoPreviewSvgPass,
  isoSceneLayoutPass,
} from "./iso-pipeline";
import { getIsoViewBox, IsoSceneLayers } from "./iso-scene";
import { getIsoColumnSpace } from "./iso-scene-model";
import {
  buildIsoSceneModelFromState,
  createIsoLibraryCommand,
  createIsoObjectRecord,
  createIsoSelectionCommand,
  getIsoActiveObjectId,
  getIsoActivePlacements,
  getIsoOffGridPlacements,
  getIsoLibraryAssets,
  getIsoLoopProgress,
  getIsoReliefLayers,
  isIsoWaveActive,
  withIsoLoopProgress,
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
const selectTimeSeconds = (state: ToolcraftState) => state.timeline.currentTimeSeconds;
const selectDurationSeconds = (state: ToolcraftState) => state.timeline.durationSeconds;

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
  const waveActive = isIsoWaveActive(values);
  const timeSeconds = useToolcraftSelector(selectTimeSeconds);
  const durationSeconds = useToolcraftSelector(selectDurationSeconds);
  // Only a running wave depends on the clock, so a static relief is not rebuilt every frame.
  const loopProgress = waveActive
    ? getIsoLoopProgress({ mediaAssets, timeline: { currentTimeSeconds: timeSeconds, durationSeconds }, values })
    : 0;
  const source = React.useMemo(
    () => withIsoLoopProgress({ mediaAssets, values }, loopProgress),
    [loopProgress, mediaAssets, values],
  );
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
      "grid.hideHiddenLines": values[ISO_TARGETS.hideHiddenLines],
      "grid.levelHeight": values[ISO_TARGETS.levelHeight],
      "grid.size": values[ISO_TARGETS.gridSize],
      "library.files": libraryKey,
      "library.objects": values[ISO_TARGETS.libraryObjects],
      "output.crop": values[ISO_TARGETS.crop],
      "output.includeGrid": values[ISO_TARGETS.includeGrid],
      "output.padding": values[ISO_TARGETS.padding],
      "output.showPieces": values[ISO_TARGETS.showPieces],
      "relief.corner": values[ISO_TARGETS.reliefCorner],
      "relief.edge": values[ISO_TARGETS.reliefEdge],
      "relief.edits": values[ISO_TARGETS.reliefEdits],
      "relief.max": values[ISO_TARGETS.reliefMax],
      "relief.pattern": values[ISO_TARGETS.reliefPattern],
      "relief.step": values[ISO_TARGETS.reliefStep],
      "relief.wave": values[ISO_TARGETS.reliefWave],
      "relief.waveDirection": values[ISO_TARGETS.reliefWaveDirection],
      "relief.waveEasing": values[ISO_TARGETS.reliefWaveEasing],
      "relief.waveLength": values[ISO_TARGETS.reliefWaveLength],
      "timeline.time": loopProgress,
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
  const [heightGesture, setHeightGesture] = React.useState<IsoHeightGesture | null>(null);
  const [snapGuides, setSnapGuides] = React.useState<readonly IsoCell[]>([]);
  const shownSelection = drag ? normalizeCellRect(drag.from, drag.to) : selection;
  const overlayKey = `${tool}|${JSON.stringify(shownSelection)}|${cursor?.col},${cursor?.row}|${erasePoint?.x},${erasePoint?.y}|${JSON.stringify(snapGuides)}|${heightGesture ? "drag" : ""}`;

  React.useLayoutEffect(() => {
    if (!pipeline || !model) return;
    pipeline.runPass(isoPreviewSvgPass, undefined, () => undefined).catch(() => undefined);
  }, [gridVisible, model, pipeline, urls]);

  React.useLayoutEffect(() => {
    if (!pipeline) return;
    pipeline.runPass(isoEditorOverlayPass, undefined, () => undefined).catch(() => undefined);
  }, [overlayKey, pipeline]);

  if (frame.kind !== "ready" || !model) return null;

  const space = getIsoColumnSpace(input);
  const relief = getIsoReliefLayers(source);
  const field: IsoFieldContext = {
    active,
    cellSize: input.cellSize,
    gridSize: input.gridSize,
    model,
    offGrid: getIsoOffGridPlacements(source),
    placements,
    relief,
    selection,
    space,
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

  const endHeightGesture = () => {
    setHeightGesture(null);
    setSnapGuides([]);
  };

  const handlePointerDown = (event: React.PointerEvent<HTMLButtonElement>) => {
    if (event.button !== 0) return;
    event.preventDefault();
    const point = pointFromEvent(event);
    const cell = getIsoCellAt(field, point);
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
    if (tool === "height") {
      if (!cell) return;
      const boxHeight = event.currentTarget.getBoundingClientRect().height;
      event.currentTarget.setPointerCapture(event.pointerId);
      setHeightGesture({
        drag: startIsoHeightDrag(field, cell),
        group: `iso-height-${event.pointerId}-${Math.round(event.timeStamp)}`,
        pointerId: event.pointerId,
        startY: event.clientY,
        unitsPerPixel: model.frame.height / Math.max(1, boxHeight),
      });
      return;
    }
    const command = getIsoCellCommand(field, cell, point);
    if (command) dispatch(command);
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLButtonElement>) => {
    const pointerId = event.pointerId;
    if (heightGesture && heightGesture.pointerId === pointerId) {
      const result = moveIsoHeightDrag(field, heightGesture, event.clientY, {
        altKey: event.altKey,
        shiftKey: event.shiftKey,
      });
      dispatch(result.command);
      setSnapGuides(result.guides);
      return;
    }
    const point = pointFromEvent(event);
    const cell = getIsoCellAt(field, point);
    const clamped = clampIsoCell(field, point);
    setCursor((previous) => (isSameIsoCell(previous, cell) ? previous : cell));
    setErasePoint(tool === "erase" ? point : null);
    setDrag((current) => moveIsoSelectDrag(current, pointerId, clamped));
  };

  const handlePointerUp = (event: React.PointerEvent<HTMLButtonElement>) => {
    const pointerId = event.pointerId;
    if (heightGesture && heightGesture.pointerId === pointerId) {
      endHeightGesture();
      return;
    }
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
    if (tool === "height" && (event.key === "PageUp" || event.key === "PageDown")) {
      event.preventDefault();
      if (!cursor) return;
      const command = getIsoHeightStepCommand(field, cursor, event.key === "PageUp" ? 1 : -1);
      if (command) dispatch(command);
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

  const overlayPaths = getIsoOverlayPaths({
    cursor,
    dragging: drag !== null,
    erasePoint,
    field,
    heightGesture,
    selection: shownSelection,
    snapGuides,
  });

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
        <IsoSceneLayers appearance={{ showGrid: gridVisible }} imageUrls={urls} model={model} />
      </svg>
      <Button
        aria-label={`Sushi set field, ${tool} tool`}
        className={styles.fieldHandle}
        data-iso-tool={tool}
        data-slot="iso-field-handle"
        data-testid={ISO_FIELD_HANDLE_TEST_ID}
        data-toolcraft-canvas-handle=""
        onKeyDown={handleKeyDown}
        onLostPointerCapture={() => {
          setDrag(null);
          endHeightGesture();
        }}
        onPointerCancel={() => {
          setDrag(null);
          endHeightGesture();
        }}
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
          {overlayPaths.map((path) => (
            <path
              className={styles[path.tone]}
              d={path.d}
              data-iso-hover={path.hover}
              data-iso-selection={path.selection}
              data-iso-snap-guides={path.snapGuides}
              key={path.key}
              strokeWidth={path.strokeWidth}
              vectorEffect="non-scaling-stroke"
            />
          ))}
        </svg>
      </Button>
    </div>
  );
}
