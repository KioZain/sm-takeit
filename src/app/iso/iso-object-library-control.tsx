import * as React from "react";

import type { ToolcraftMediaAsset } from "@/toolcraft/runtime";
import {
  useToolcraftMediaPresentationUrls,
  type ToolcraftCustomControlRendererProps,
} from "@/toolcraft/runtime/react";
import { Button, Input, Label, ToggleGroup, ToggleGroupItem } from "@/toolcraft/ui";

import {
  getFootprintDiamond,
  getPlacementCells,
  ISO_FOOTPRINTS,
  type IsoFootprint,
  type IsoObjectRecord,
  type IsoPoint,
} from "./iso-geometry";
import { toSvgPath } from "./iso-scene";
import {
  getIsoActiveObjectId,
  getIsoLibraryAssets,
  getIsoLibraryObjects,
  ISO_SCALE_RANGE,
  isIsoFootprint,
  readIsoLibraryValue,
  type IsoLibraryValue,
} from "./iso-state";
import styles from "./iso-controls.module.css";

const FOOTPRINT_LABELS: Record<IsoFootprint, string> = {
  "1x1": "1×1",
  "1x2": "1×2",
  "2x1": "2×1",
  "2x2": "2×2",
};

/** Small isometric outline of a footprint's cells, shown beside its label. */
function FootprintGlyph({ footprint }: Readonly<{ footprint: IsoFootprint }>): React.JSX.Element {
  const cellSize = 10;
  const cells = getPlacementCells({ col: 0, footprint, row: 0 }).map((cell) =>
    getFootprintDiamond(cell.col, cell.row, "1x1", cellSize),
  );
  return (
    <svg
      aria-hidden="true"
      data-icon="inline-start"
      fill="none"
      height={16}
      stroke="currentColor"
      strokeLinejoin="round"
      viewBox="-10.5 -0.5 21 11"
      width={16}
    >
      <path d={toSvgPath(cells)} strokeWidth={1} vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function roundAnchor(value: number): number {
  return Math.round(value * 1000) / 1000;
}

type ImageBox = Readonly<{ height: number; left: number; top: number; width: number }>;

/** Rectangle occupied by an `object-fit: contain` image inside its surface. */
function getContainBox(surface: DOMRect, size: IsoObjectRecord["size"]): ImageBox | null {
  if (!size) return null;
  const scale = Math.min(surface.width / size.width, surface.height / size.height);
  const width = size.width * scale;
  const height = size.height * scale;
  return {
    height,
    left: (surface.width - width) / 2,
    top: (surface.height - height) / 2,
    width,
  };
}

function AnchorPicker({
  anchor,
  name,
  onChange,
  size,
  url,
}: Readonly<{
  anchor: IsoPoint;
  name: string;
  onChange: (anchor: IsoPoint) => void;
  size: IsoObjectRecord["size"];
  url: string | undefined;
}>): React.JSX.Element {
  const surfaceRef = React.useRef<HTMLButtonElement | null>(null);
  const [surfaceSize, setSurfaceSize] = React.useState<DOMRect | null>(null);

  React.useLayoutEffect(() => {
    const surface = surfaceRef.current;
    if (!surface) return;
    const update = () => setSurfaceSize(surface.getBoundingClientRect());
    update();
    const observer = new ResizeObserver(update);
    observer.observe(surface);
    return () => observer.disconnect();
  }, []);

  const box = surfaceSize ? getContainBox(surfaceSize, size) : null;

  const setFromPointer = (event: React.PointerEvent<HTMLButtonElement>) => {
    const surface = surfaceRef.current;
    if (!surface || event.button !== 0) return;
    const rect = surface.getBoundingClientRect();
    const contain = getContainBox(rect, size);
    if (!contain) return;
    onChange({
      x: roundAnchor(clamp01((event.clientX - rect.left - contain.left) / contain.width)),
      y: roundAnchor(clamp01((event.clientY - rect.top - contain.top) / contain.height)),
    });
  };

  const nudge = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    const step = event.shiftKey ? 0.05 : 0.01;
    const delta =
      event.key === "ArrowLeft"
        ? { x: -step, y: 0 }
        : event.key === "ArrowRight"
          ? { x: step, y: 0 }
          : event.key === "ArrowUp"
            ? { x: 0, y: -step }
            : event.key === "ArrowDown"
              ? { x: 0, y: step }
              : null;
    if (!delta) return;
    event.preventDefault();
    onChange({
      x: roundAnchor(clamp01(anchor.x + delta.x)),
      y: roundAnchor(clamp01(anchor.y + delta.y)),
    });
  };

  return (
    <Button
      aria-label={`Точка опоры «${name}»: ${Math.round(anchor.x * 100)}% по ширине, ${Math.round(anchor.y * 100)}% по высоте`}
      className={styles.anchorButton}
      data-iso-anchor-picker=""
      onKeyDown={nudge}
      onPointerDown={setFromPointer}
      ref={surfaceRef}
      type="button"
      variant="outline"
    >
      <span className={styles.anchorCanvas}>
        {url ? <img alt="" className={styles.anchorImage} src={url} /> : null}
        {box ? (
          <span
            className={styles.anchorMarker}
            data-iso-anchor-marker=""
            style={{
              left: box.left + anchor.x * box.width,
              top: box.top + anchor.y * box.height,
            }}
          />
        ) : null}
      </span>
    </Button>
  );
}

function CommitInput({
  "aria-label": ariaLabel,
  id,
  inputMode,
  onCommit,
  onStep,
  value,
}: Readonly<{
  "aria-label"?: string;
  id: string;
  inputMode?: "decimal" | "text";
  onCommit: (value: string) => void;
  onStep?: (direction: 1 | -1, large: boolean) => void;
  value: string;
}>): React.JSX.Element {
  const [draft, setDraft] = React.useState(value);
  React.useEffect(() => setDraft(value), [value]);
  return (
    <Input
      aria-label={ariaLabel}
      id={id}
      inputMode={inputMode}
      onBlur={() => onCommit(draft)}
      onChange={(event) => setDraft(event.currentTarget.value)}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          onCommit(draft);
        } else if (event.key === "Escape") {
          setDraft(value);
        } else if (onStep && (event.key === "ArrowUp" || event.key === "ArrowDown")) {
          event.preventDefault();
          onStep(event.key === "ArrowUp" ? 1 : -1, event.shiftKey);
        }
      }}
      value={draft}
    />
  );
}

export function IsoObjectLibraryControl({
  controlId,
  setValue,
  state,
}: ToolcraftCustomControlRendererProps): React.JSX.Element | null {
  const baseId = React.useId();
  const libraryAssets = React.useMemo(
    () => getIsoLibraryAssets<ToolcraftMediaAsset>(state.mediaAssets),
    [state.mediaAssets],
  );
  const urls = useToolcraftMediaPresentationUrls(libraryAssets);
  const objects = getIsoLibraryObjects(state);
  const activeId = getIsoActiveObjectId(state);
  const active = objects.find((object) => object.id === activeId) ?? null;

  if (objects.length === 0) return null;

  const commit = (next: IsoLibraryValue) => setValue(next);
  const updateActive = (patch: Partial<IsoObjectRecord>) => {
    if (!active) return;
    const library = readIsoLibraryValue(state.values);
    commit({
      activeId: library.activeId,
      items: { ...library.items, [active.id]: { ...active.record, ...patch } },
    });
  };

  return (
    <div className={styles.library} data-iso-control={controlId}>
      <ToggleGroup
        aria-label="Активный объект"
        className={styles.objectGrid}
        onValueChange={(groupValue: unknown[]) => {
          const nextId = groupValue.find((item): item is string => typeof item === "string");
          if (!nextId || nextId === activeId) return;
          commit({ ...readIsoLibraryValue(state.values), activeId: nextId });
        }}
        spacing={1}
        value={activeId ? [activeId] : []}
        variant="outline"
      >
        {objects.map((object) => (
          <ToggleGroupItem
            aria-label={object.record.name}
            className={styles.objectTile}
            data-iso-object={object.id}
            key={object.id}
            value={object.id}
          >
            {urls.get(object.id) ? (
              <img alt="" className={styles.objectThumb} src={urls.get(object.id)} />
            ) : null}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>

      {active ? (
        <>
          <AnchorPicker
            anchor={active.record.anchor}
            name={active.record.name}
            onChange={(anchor) => updateActive({ anchor })}
            size={active.record.size}
            url={urls.get(active.id)}
          />
          <div className={styles.field}>
            <Label htmlFor={`${baseId}-name`}>Имя</Label>
            <CommitInput
              id={`${baseId}-name`}
              onCommit={(name) => {
                const trimmed = name.trim();
                if (trimmed && trimmed !== active.record.name) updateActive({ name: trimmed });
              }}
              value={active.record.name}
            />
          </div>
          <div className={styles.field}>
            <Label id={`${baseId}-footprint`}>Площадь</Label>
            <ToggleGroup
              aria-labelledby={`${baseId}-footprint`}
              className={styles.footprints}
              onValueChange={(groupValue: unknown[]) => {
                const footprint = groupValue.find(isIsoFootprint);
                if (footprint && footprint !== active.record.footprint) updateActive({ footprint });
              }}
              value={[active.record.footprint]}
              variant="outline"
            >
              {ISO_FOOTPRINTS.map((footprint) => (
                <ToggleGroupItem key={footprint} value={footprint}>
                  <FootprintGlyph footprint={footprint} />
                  {FOOTPRINT_LABELS[footprint]}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
          </div>
          <div className={styles.field}>
            <Label htmlFor={`${baseId}-scale`}>Масштаб</Label>
            <CommitInput
              id={`${baseId}-scale`}
              inputMode="decimal"
              onCommit={(raw) => {
                const parsed = Number(raw.replace(",", "."));
                if (!Number.isFinite(parsed)) return;
                const scale =
                  Math.round(Math.min(ISO_SCALE_RANGE.max, Math.max(ISO_SCALE_RANGE.min, parsed)) * 100) / 100;
                if (scale !== active.record.scale) updateActive({ scale });
              }}
              onStep={(direction, large) => {
                const scale =
                  Math.round(
                    Math.min(
                      ISO_SCALE_RANGE.max,
                      Math.max(ISO_SCALE_RANGE.min, active.record.scale + direction * (large ? 0.1 : 0.01)),
                    ) * 100,
                  ) / 100;
                if (scale !== active.record.scale) updateActive({ scale });
              }}
              value={active.record.scale.toFixed(2)}
            />
          </div>
        </>
      ) : null}
    </div>
  );
}
