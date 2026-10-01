/**
 * Turns a saved preset into the state the scene is built from, without a
 * Toolcraft runtime behind it. This is what lets the mobile player draw the same
 * picture as the generator: it does not reimplement the scene, it assembles the
 * same `IsoStateSource` the editor holds and then calls the very same builders.
 *
 * The rules here mirror how the editor restores a preset — objects are matched
 * by name, the first entry of a repeated name wins, and pieces whose object is
 * missing are dropped — so the two paths cannot quietly disagree.
 */
import { createPlacementId, type IsoPlacement } from "./iso-geometry";
import type { IsoSavedPreset } from "./iso-saved-presets";
import { ISO_TARGETS, readIsoLoopSeconds, type IsoStateSource } from "./iso-state";

/** One roll picture the host hands over, with the pixels it actually has. */
export type IsoPresetImage = Readonly<{
  height: number;
  name: string;
  url: string;
  width: number;
}>;

export type IsoPresetScene = Readonly<{
  /** Seconds one wave cycle takes; the player paces its own clock by this. */
  loopSeconds: number;
  /** Object names the preset places that the host did not supply. */
  missing: readonly string[];
  state: IsoStateSource;
  /** Object id to picture URL, the shape the scene layers want. */
  urls: ReadonlyMap<string, string>;
}>;

/** An image's own name is its object id: preset objects are already named uniquely. */
function indexImages(images: readonly IsoPresetImage[]): Map<string, IsoPresetImage> {
  const byName = new Map<string, IsoPresetImage>();
  for (const image of images) {
    if (!byName.has(image.name)) byName.set(image.name, image);
  }
  return byName;
}

function toLibraryItems(
  preset: IsoSavedPreset,
  byName: ReadonlyMap<string, IsoPresetImage>,
): Record<string, unknown> {
  return preset.objects.reduce<Record<string, unknown>>((items, object) => {
    const image = byName.get(object.name);
    if (!image || Object.hasOwn(items, object.name)) return items;
    return {
      ...items,
      [object.name]: {
        anchor: object.anchor,
        footprint: object.footprint,
        name: object.name,
        scale: object.scale,
        // A record without a size renders at nothing, so the host's pixels are
        // the one piece of information a preset cannot carry on its own.
        size: image.width > 0 && image.height > 0 ? { height: image.height, width: image.width } : null,
      },
    };
  }, {});
}

function toPlacements(
  preset: IsoSavedPreset,
  byName: ReadonlyMap<string, IsoPresetImage>,
): IsoPlacement[] {
  return preset.placements.flatMap((placement): IsoPlacement[] =>
    byName.has(placement.objectName)
      ? [
          {
            col: placement.col,
            floor: placement.floor,
            footprint: placement.footprint,
            id: createPlacementId(
              placement.objectName,
              placement.col,
              placement.row,
              placement.floor,
            ),
            objectId: placement.objectName,
            row: placement.row,
          },
        ]
      : [],
  );
}

/** The scene state a preset describes, once the host's pictures are known. */
export function createIsoPresetScene(
  preset: IsoSavedPreset,
  images: readonly IsoPresetImage[],
): IsoPresetScene {
  const byName = indexImages(images);
  const items = toLibraryItems(preset, byName);
  const placed = new Set(preset.placements.map((placement) => placement.objectName));
  return {
    loopSeconds: readIsoLoopSeconds(preset.values),
    missing: [...placed].filter((name) => !byName.has(name)),
    state: {
      mediaAssets: Object.keys(items).map((name) => ({
        assetKind: "file",
        fileName: `${name}.png`,
        id: name,
        sourceTarget: ISO_TARGETS.libraryFiles,
      })),
      values: {
        ...preset.values,
        [ISO_TARGETS.libraryObjects]: { activeId: null, items },
        [ISO_TARGETS.placements]: { items: toPlacements(preset, byName) },
      },
    },
    urls: new Map(
      Object.keys(items).map((name) => [name, byName.get(name)!.url] as const),
    ),
  };
}
