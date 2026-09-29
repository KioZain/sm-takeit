import * as React from "react";

import type {
  IsoColumnFace,
  IsoPoint,
  IsoSceneItem,
  IsoSceneModel,
  IsoSegment,
} from "./iso-geometry";
import styles from "./iso-scene.module.css";

export const ISO_GRID_STROKE = "rgba(120, 120, 120, 0.8)";
export const ISO_GRID_DASH = [4, 3] as const;
/** Barely visible column side tints; the right side is a touch darker for depth. */
export const ISO_FACE_FILLS = {
  left: "rgba(128, 128, 128, 0.07)",
  right: "rgba(128, 128, 128, 0.13)",
} as const;

export type IsoSceneAppearance = Readonly<{ showGrid: boolean }>;

export function toSegmentPath(segments: readonly IsoSegment[]): string {
  return segments
    .map(
      (segment) =>
        `M${round(segment.from.x)} ${round(segment.from.y)}L${round(segment.to.x)} ${round(segment.to.y)}`,
    )
    .join("");
}

export function getFacePath(faces: readonly IsoColumnFace[], side: IsoColumnFace["side"]): string {
  return toSvgPath(faces.filter((face) => face.side === side).map((face) => face.points));
}

export function toSvgPath(polygons: readonly (readonly IsoPoint[])[]): string {
  return polygons
    .map(
      (polygon) =>
        `M${polygon.map((point) => `${round(point.x)} ${round(point.y)}`).join("L")}Z`,
    )
    .join("");
}

function round(value: number): number {
  return Math.round(value * 1000) / 1000;
}

export function getIsoViewBox(model: IsoSceneModel): string {
  const { frame } = model;
  return `${frame.x} ${frame.y} ${frame.width} ${frame.height}`;
}

type IsoSceneLayersProps = Readonly<{
  /** Pop pieces in as they land and out as they are erased; still previews opt out. */
  animate?: boolean;
  appearance: IsoSceneAppearance;
  /** Uploaded object id → presentation URL. */
  imageUrls: ReadonlyMap<string, string>;
  model: IsoSceneModel;
}>;

/** Pieces that were on the field a moment ago and are not any more. */
export function getLeavingItems(
  previous: readonly IsoSceneItem[],
  current: readonly IsoSceneItem[],
): IsoSceneItem[] {
  const live = new Set(current.map((item) => item.placement.id));
  return previous.filter((item) => !live.has(item.placement.id));
}

/**
 * How long an erased piece stays on the board: the exit transition in
 * `iso-scene.module.css` plus a little slack, so it is never cut short.
 */
const ISO_EXIT_MS = 360;

/** Erased pieces stay on the board until they have played their way out. */
function useLeavingPieces(
  items: readonly IsoSceneItem[],
  animate: boolean,
): readonly IsoSceneItem[] {
  const previous = React.useRef<readonly IsoSceneItem[]>(items);
  const [leaving, setLeaving] = React.useState<readonly IsoSceneItem[]>([]);

  React.useEffect(() => {
    const gone = animate ? getLeavingItems(previous.current, items) : [];
    previous.current = items;
    if (gone.length === 0) return;
    setLeaving((current) => [...current, ...gone]);
    const settled = new Set(gone.map((item) => item.placement.id));
    const timer = window.setTimeout(
      () => setLeaving((current) => current.filter((item) => !settled.has(item.placement.id))),
      ISO_EXIT_MS,
    );
    return () => window.clearTimeout(timer);
  }, [animate, items]);

  return leaving;
}

type IsoPieceProps = Readonly<{
  item: IsoSceneItem;
  /** Playing its way off the board; still previews pass neither flag. */
  leaving?: boolean;
  still?: boolean;
  url: string;
}>;

function IsoPiece({ item, leaving, still, url }: IsoPieceProps): React.JSX.Element {
  const rect = item.imageRect!;
  const { anchor } = item.record;
  return (
    <image
      className={still ? undefined : leaving ? styles.leaving : styles.piece}
      data-iso-placement={item.placement.id}
      height={rect.height}
      href={url}
      preserveAspectRatio="none"
      style={{ transformOrigin: `${anchor.x * 100}% ${anchor.y * 100}%` }}
      width={rect.width}
      x={rect.x}
      y={rect.y}
    />
  );
}

/** Dashed grid and column guide, then objects back to front. */
export function IsoSceneLayers({
  animate = false,
  appearance,
  imageUrls,
  model,
}: IsoSceneLayersProps): React.JSX.Element {
  const items = model.piecesVisible ? model.items : [];
  const leaving = useLeavingPieces(items, animate);
  const drawable = (item: IsoSceneItem) =>
    item.imageRect !== null && imageUrls.has(item.placement.objectId);
  return (
    <>
      {appearance.showGrid ? (
        <g data-iso-layer="grid" fill="none" stroke={ISO_GRID_STROKE}>
          <g data-iso-column-faces={model.guideFaces.length} stroke="none">
            <path d={getFacePath(model.guideFaces, "left")} fill={ISO_FACE_FILLS.left} />
            <path d={getFacePath(model.guideFaces, "right")} fill={ISO_FACE_FILLS.right} />
          </g>
          <path
            d={toSegmentPath(model.guide)}
            data-iso-grid-segments={model.guide.length}
            strokeDasharray={ISO_GRID_DASH.join(" ")}
            strokeWidth={1}
            vectorEffect="non-scaling-stroke"
          />
        </g>
      ) : null}
      <g data-iso-layer="objects">
        {items.filter(drawable).map((item) => (
          <IsoPiece
            item={item}
            key={item.placement.id}
            still={!animate}
            url={imageUrls.get(item.placement.objectId)!}
          />
        ))}
      </g>
      {leaving.length > 0 ? (
        <g data-iso-layer="objects-leaving">
          {leaving.filter(drawable).map((item) => (
            <IsoPiece
              item={item}
              key={item.placement.id}
              leaving
              url={imageUrls.get(item.placement.objectId)!}
            />
          ))}
        </g>
      ) : null}
    </>
  );
}
