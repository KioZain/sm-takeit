import type { IsoPoint, IsoSegment } from "./iso-geometry";

/** Points closer than this to an occluder's outline count as outside, so shared edges stay visible. */
const EDGE_TOLERANCE = 1e-3;
const MIN_PIECE_AREA = 1e-3;

type HalfPlane = Readonly<{ a: IsoPoint; b: IsoPoint; sign: number }>;

function cross(a: IsoPoint, b: IsoPoint, point: IsoPoint): number {
  return (b.x - a.x) * (point.y - a.y) - (b.y - a.y) * (point.x - a.x);
}

function edgeLength(a: IsoPoint, b: IsoPoint): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

function signedArea(polygon: readonly IsoPoint[]): number {
  return (
    polygon.reduce((sum, point, index) => {
      const next = polygon[(index + 1) % polygon.length]!;
      return sum + point.x * next.y - next.x * point.y;
    }, 0) / 2
  );
}

/** Half-planes of a convex polygon; `inside` values are positive for interior points. */
function toHalfPlanes(polygon: readonly IsoPoint[]): HalfPlane[] {
  const sign = signedArea(polygon) >= 0 ? 1 : -1;
  return polygon
    .map((a, index) => ({ a, b: polygon[(index + 1) % polygon.length]!, sign }))
    .filter((plane) => edgeLength(plane.a, plane.b) > 1e-9);
}

/** Distance-like measure of how far inside the half-plane a point is. */
function inside(plane: HalfPlane, point: IsoPoint): number {
  return (plane.sign * cross(plane.a, plane.b, point)) / edgeLength(plane.a, plane.b);
}

/** Parameter range of the segment strictly inside the convex occluder, or null. */
function insideInterval(
  segment: IsoSegment,
  planes: readonly HalfPlane[],
): readonly [number, number] | null {
  const range = planes.reduce<readonly [number, number] | null>((current, plane) => {
    if (!current) return null;
    const start = inside(plane, segment.from) - EDGE_TOLERANCE;
    const end = inside(plane, segment.to) - EDGE_TOLERANCE;
    if (start <= 0 && end <= 0) return null;
    if (start > 0 && end > 0) return current;
    const t = start / (start - end);
    return start > 0 ? [current[0], Math.min(current[1], t)] : [Math.max(current[0], t), current[1]];
  }, [0, 1]);
  return range && range[1] - range[0] > 1e-9 ? range : null;
}

function mergeIntervals(intervals: readonly (readonly [number, number])[]): Array<readonly [number, number]> {
  return [...intervals]
    .sort((left, right) => left[0] - right[0])
    .reduce<Array<readonly [number, number]>>((merged, interval) => {
      const last = merged.at(-1);
      return last && interval[0] <= last[1]
        ? [...merged.slice(0, -1), [last[0], Math.max(last[1], interval[1])] as const]
        : [...merged, interval];
    }, []);
}

function pointAt(segment: IsoSegment, t: number): IsoPoint {
  return {
    x: segment.from.x + (segment.to.x - segment.from.x) * t,
    y: segment.from.y + (segment.to.y - segment.from.y) * t,
  };
}

/** Visible pieces of a segment once every convex occluder is removed. */
export function clipSegment(segment: IsoSegment, occluders: readonly (readonly IsoPoint[])[]): IsoSegment[] {
  const hidden = mergeIntervals(
    occluders
      .map((occluder) => insideInterval(segment, toHalfPlanes(occluder)))
      .filter((interval): interval is readonly [number, number] => interval !== null),
  );
  const bounds = [0, ...hidden.flat(), 1];
  return Array.from({ length: hidden.length + 1 }, (_, index) => [bounds[index * 2]!, bounds[index * 2 + 1]!] as const)
    .filter(([start, end]) => end - start > 1e-6)
    .map(([start, end]) => ({ from: pointAt(segment, start), to: pointAt(segment, end) }));
}

/** Sutherland–Hodgman clip keeping points where `sign·(inside − tolerance) ≥ 0`. */
function clipByPlane(polygon: readonly IsoPoint[], plane: HalfPlane, keepInside: boolean): IsoPoint[] {
  const value = (point: IsoPoint) => (inside(plane, point) - EDGE_TOLERANCE) * (keepInside ? 1 : -1);
  return polygon.flatMap((point, index) => {
    const next = polygon[(index + 1) % polygon.length]!;
    const current = value(point);
    const following = value(next);
    const kept = current >= 0 ? [point] : [];
    if (current >= 0 === following >= 0) return kept;
    const t = current / (current - following);
    return [...kept, { x: point.x + (next.x - point.x) * t, y: point.y + (next.y - point.y) * t }];
  });
}

/** Convex pieces of `polygon` outside one convex occluder. */
function subtractConvex(polygon: readonly IsoPoint[], occluder: readonly IsoPoint[]): IsoPoint[][] {
  const planes = toHalfPlanes(occluder);
  // Untouched polygons stay whole, so translucent fills get no seams.
  const separated = planes.some((plane) =>
    polygon.every((point) => inside(plane, point) - EDGE_TOLERANCE <= 0),
  );
  if (separated) return [[...polygon]];
  return planes
    .map((plane, index) =>
      planes
        .slice(0, index)
        .reduce((piece, previous) => clipByPlane(piece, previous, true), clipByPlane(polygon, plane, false)),
    )
    .filter((piece) => piece.length >= 3 && Math.abs(signedArea(piece)) > MIN_PIECE_AREA);
}

/** Visible convex pieces of a polygon once every convex occluder is removed. */
export function clipPolygon(
  polygon: readonly IsoPoint[],
  occluders: readonly (readonly IsoPoint[])[],
): IsoPoint[][] {
  return occluders.reduce<IsoPoint[][]>(
    (pieces, occluder) => pieces.flatMap((piece) => subtractConvex(piece, occluder)),
    [[...polygon]],
  );
}
