import * as React from "react";

import {
  expandRect,
  projectIso,
  unionRects,
  type IsoPoint,
  type IsoSceneModel,
} from "./iso-geometry";

export const ISO_GRID_STROKE = "rgba(120, 120, 120, 0.8)";
export const ISO_GRID_DASH = [4, 3] as const;
export const ISO_SHADOW_COLOR = "#000000";

export type IsoSceneAppearance = Readonly<{
  cellSize: number;
  gridSize: number;
  shadowBlur: number;
  shadowOpacity: number;
  showGrid: boolean;
}>;

export type IsoGridLine = Readonly<{ from: IsoPoint; to: IsoPoint }>;

export function getIsoGridLines(gridSize: number, cellSize: number): IsoGridLine[] {
  const lines: IsoGridLine[] = [];
  for (let index = 0; index <= gridSize; index += 1) {
    lines.push({ from: projectIso(index, 0, cellSize), to: projectIso(index, gridSize, cellSize) });
    lines.push({ from: projectIso(0, index, cellSize), to: projectIso(gridSize, index, cellSize) });
  }
  return lines;
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

/** Dashed field grid, one blurred shadow layer, then objects back to front. */
export function IsoSceneLayers({
  appearance,
  imageUrls,
  model,
}: IsoSceneLayersProps): React.JSX.Element {
  const filterId = `iso-shadow-${React.useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  const shadowRegion = expandRect(
    unionRects([model.frame, model.field]) ?? model.frame,
    Math.max(appearance.shadowBlur * 4, appearance.cellSize),
  );
  const showShadows = model.shadowPolygons.length > 0 && appearance.shadowOpacity > 0;
  const gridLines = appearance.showGrid
    ? getIsoGridLines(appearance.gridSize, appearance.cellSize)
    : [];

  return (
    <>
      {appearance.showGrid ? (
        <g data-iso-layer="grid" fill="none" stroke={ISO_GRID_STROKE}>
          {gridLines.map((line, index) => (
            <line
              key={index}
              strokeDasharray={ISO_GRID_DASH.join(" ")}
              strokeWidth={1}
              vectorEffect="non-scaling-stroke"
              x1={line.from.x}
              x2={line.to.x}
              y1={line.from.y}
              y2={line.to.y}
            />
          ))}
        </g>
      ) : null}
      {showShadows && appearance.shadowBlur > 0 ? (
        <defs>
          <filter
            filterUnits="userSpaceOnUse"
            height={shadowRegion.height}
            id={filterId}
            width={shadowRegion.width}
            x={shadowRegion.x}
            y={shadowRegion.y}
          >
            <feGaussianBlur stdDeviation={appearance.shadowBlur} />
          </filter>
        </defs>
      ) : null}
      {showShadows ? (
        <g
          data-iso-layer="shadows"
          filter={appearance.shadowBlur > 0 ? `url(#${filterId})` : undefined}
          opacity={appearance.shadowOpacity}
        >
          <path d={toSvgPath(model.shadowPolygons)} fill={ISO_SHADOW_COLOR} />
        </g>
      ) : null}
      <g data-iso-layer="objects">
        {model.items.map((item) => {
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
