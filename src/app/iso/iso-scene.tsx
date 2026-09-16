import * as React from "react";

import type { IsoColumnFace, IsoPoint, IsoSceneModel, IsoSegment } from "./iso-geometry";

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
  appearance: IsoSceneAppearance;
  /** Uploaded object id → presentation URL. */
  imageUrls: ReadonlyMap<string, string>;
  model: IsoSceneModel;
}>;

/** Dashed grid and column guide, then objects back to front. */
export function IsoSceneLayers({
  appearance,
  imageUrls,
  model,
}: IsoSceneLayersProps): React.JSX.Element {
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
        {(model.piecesVisible ? model.items : []).map((item) => {
          const url = imageUrls.get(item.placement.objectId);
          return item.imageRect && url ? (
            <image
              data-iso-placement={item.placement.id}
              height={item.imageRect.height}
              href={url}
              key={item.placement.id}
              preserveAspectRatio="none"
              width={item.imageRect.width}
              x={item.imageRect.x}
              y={item.imageRect.y}
            />
          ) : null;
        })}
      </g>
    </>
  );
}
