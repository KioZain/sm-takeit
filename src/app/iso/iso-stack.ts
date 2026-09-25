import {
  getFieldBounds,
  unionRects,
  type IsoCell,
  type IsoColumnFace,
  type IsoGridSize,
  type IsoPoint,
  type IsoRect,
  type IsoSegment,
} from "./iso-geometry";

/** A stacked field is always square; the zone side is the only size it takes. */
export const ISO_ZONE_RANGE = { max: 3, min: 2 } as const;

export const ISO_FLOOR_RANGE = { max: 8, min: 1 } as const;

/**
 * How the field is laid out. `classic` spreads one field across the ground,
 * `stacked` repeats one zone upwards, so a bigger set grows in height instead
 * of width.
 */
export type IsoGridMode = "classic" | "stacked";

export const ISO_GRID_MODES: readonly IsoGridMode[] = ["classic", "stacked"];

export function isIsoGridMode(value: unknown): value is IsoGridMode {
  return value === "classic" || value === "stacked";
}

/** Floors drawn one above another, and the screen offset between them. */
export type IsoStack = Readonly<{ floors: number; offset: number }>;

/** The single ground floor of a classic field. */
export const ISO_SINGLE_FLOOR: IsoStack = Object.freeze({ floors: 1, offset: 0 });

/**
 * Floors overlap by exactly half a zone. The bottom corner of a floor then
 * lands in the middle of the floor below, and their edges cross at the
 * midpoints of its upper edges — the corners that mark where two zones meet.
 */
export function getIsoFloorOffset(gridSize: IsoGridSize, cellSize: number): number {
  return getFieldBounds(gridSize, cellSize).height / 2;
}

export function getIsoStack(
  gridSize: IsoGridSize,
  cellSize: number,
  floors: number,
): IsoStack {
  const count = Math.max(ISO_FLOOR_RANGE.min, Math.min(ISO_FLOOR_RANGE.max, Math.round(floors)));
  return count > 1
    ? { floors: count, offset: getIsoFloorOffset(gridSize, cellSize) }
    : ISO_SINGLE_FLOOR;
}

/** Floor indexes from the ground up. */
export function getIsoFloors(stack: IsoStack): number[] {
  return Array.from({ length: stack.floors }, (_, floor) => floor);
}

/** Screen shift of a floor: up is negative, so higher floors sit higher. */
export function getIsoFloorShift(floor: number, stack: IsoStack): number {
  return -floor * stack.offset;
}

export function liftPoint(point: IsoPoint, floor: number, stack: IsoStack): IsoPoint {
  return { x: point.x, y: point.y + getIsoFloorShift(floor, stack) };
}

export function liftSegment(segment: IsoSegment, floor: number, stack: IsoStack): IsoSegment {
  return {
    from: liftPoint(segment.from, floor, stack),
    to: liftPoint(segment.to, floor, stack),
  };
}

export function liftFace(face: IsoColumnFace, floor: number, stack: IsoStack): IsoColumnFace {
  return { ...face, points: face.points.map((point) => liftPoint(point, floor, stack)) };
}

export function liftRect(rect: IsoRect, floor: number, stack: IsoStack): IsoRect {
  return { ...rect, y: rect.y + getIsoFloorShift(floor, stack) };
}

/** Bounds of the whole tower on the ground plane, before any column rises. */
export function getIsoStackBounds(
  gridSize: IsoGridSize,
  cellSize: number,
  stack: IsoStack,
): IsoRect {
  const ground = getFieldBounds(gridSize, cellSize);
  return (
    unionRects(getIsoFloors(stack).map((floor) => liftRect(ground, floor, stack))) ?? ground
  );
}

/**
 * The floor a screen point belongs to, searched from the top down: floors are
 * painted upwards, so the highest one owns the overlap.
 */
export function findIsoFloorAtPoint<T>(
  point: IsoPoint,
  stack: IsoStack,
  resolve: (localPoint: IsoPoint, floor: number) => T | null,
): T | null {
  return (
    getIsoFloors(stack)
      .reverse()
      .map((floor) => resolve(liftPoint(point, -floor, stack), floor))
      .find((hit): hit is T => hit !== null) ?? null
  );
}

/** A cell together with the floor it stands on; classic fields use floor 0. */
export type IsoStackCell = IsoCell & Readonly<{ floor: number }>;
