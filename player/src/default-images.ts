import appDefaults from "@/app/app-defaults.json" with { type: "json" };

import type { IsoPresetImage } from "@/app/iso/iso-preset-scene";

/**
 * The rolls the generator ships, resolved to URLs for the demo page. A real host
 * supplies its own list instead; this exists so the player can be opened and
 * looked at without a mobile app around it.
 */
function defaultImageUrls(base: string): Readonly<Record<string, string>> {
  const paths = new Map(appDefaults.resources.map((resource) => [resource.ref, resource.path]));
  return Object.fromEntries(
    appDefaults.state.mediaAssets.flatMap((asset) => {
      const path = paths.get(asset.resourceRef);
      return path === undefined
        ? []
        : [[asset.fileName.replace(/\.[^.]+$/u, ""), `${base}${path}`] as const];
    }),
  );
}

/**
 * A preset carries no pixel sizes, and a record without one renders at nothing,
 * so the pictures are measured before the first frame is drawn. A host that
 * already knows its sizes can skip this and build the list directly.
 */
export async function loadDefaultImages(base = "/"): Promise<IsoPresetImage[]> {
  const urls = defaultImageUrls(base);
  return Promise.all(
    Object.entries(urls).map(
      (entry) =>
        new Promise<IsoPresetImage>((resolve, reject) => {
          const [name, url] = entry;
          const image = new Image();
          image.onload = () =>
            resolve({ height: image.naturalHeight, name, url, width: image.naturalWidth });
          image.onerror = () => reject(new Error(`Roll picture failed to load: ${name}`));
          image.src = url;
        }),
    ),
  );
}
