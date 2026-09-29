/**
 * Putting a piece where another one already stands. Plain placement treats an
 * occupied cell as a refusal; here it is the point of the edit, so this lives
 * beside the geometry rather than inside it.
 */
import {
  checkPlacement,
  createPlacementId,
  getPlacementCellKeys,
  type IsoFootprint,
  type IsoGridSize,
  type IsoHeightMap,
  type IsoPlacement,
} from "./iso-geometry";

/** Pieces a footprint dropped on this cell would land on top of. */
export function getBlockingPlacements(
  placements: readonly IsoPlacement[],
  col: number,
  row: number,
  footprint: IsoFootprint,
  floor = 0,
): IsoPlacement[] {
  const wanted = new Set(getPlacementCellKeys({ col, floor, footprint, row }));
  return placements.filter((placement) =>
    getPlacementCellKeys(placement).some((key) => wanted.has(key)),
  );
}

/**
 * A re-placed piece needs an id of its own. Ids are built from the object and
 * the cell, so putting the same roll back where it stood would reproduce the id
 * it already had, the scene would reuse that node, and the landing would not
 * replay — which is the whole point of placing it again.
 */
function nextSpawn(replaced: readonly IsoPlacement[], baseId: string): number {
  return replaced.reduce((spawn, placement) => {
    if (placement.id === baseId) return Math.max(spawn, 1);
    if (!placement.id.startsWith(`${baseId}~`)) return spawn;
    const previous = Number.parseInt(placement.id.slice(baseId.length + 1), 10);
    return Number.isFinite(previous) ? Math.max(spawn, previous + 1) : spawn;
  }, 0);
}

export type IsoReplaceResult = Readonly<{
  placements: IsoPlacement[];
  /** Pieces that gave up their cells, so callers can name the edit. */
  replaced: readonly IsoPlacement[];
}>;

/**
 * Places the object over whatever already stands on those cells. Unlike
 * `placeObject` an occupied cell is not a refusal but the point of the edit;
 * a footprint that leaves the floor or straddles uneven columns still is.
 */
export function replaceObject(
  placements: readonly IsoPlacement[],
  objectId: string,
  col: number,
  row: number,
  footprint: IsoFootprint,
  gridSize: IsoGridSize,
  heights?: IsoHeightMap,
  floor = 0,
): IsoReplaceResult | null {
  const replaced = getBlockingPlacements(placements, col, row, footprint, floor);
  const gone = new Set(replaced.map((placement) => placement.id));
  const kept = replaced.length === 0 ? placements : placements.filter((p) => !gone.has(p.id));
  if (!checkPlacement(kept, col, row, footprint, gridSize, heights, floor).ok) return null;
  const baseId = createPlacementId(objectId, col, row, floor);
  const spawn = nextSpawn(replaced, baseId);
  return {
    placements: [
      ...kept,
      { col, floor, footprint, id: spawn === 0 ? baseId : `${baseId}~${spawn}`, objectId, row },
    ],
    replaced,
  };
}
