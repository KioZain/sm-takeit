export type IsoDecodedImage = Readonly<{
  bitmap: ImageBitmap;
  height: number;
  width: number;
}>;

export type IsoImageStore = Readonly<{
  dispose: () => void;
  /** Resolves once the presentation URL for `resourceRef` is registered and decoded. */
  load: (resourceRef: string, signal?: AbortSignal) => Promise<IsoDecodedImage>;
  register: (resourceRef: string, url: string) => void;
  unregister: (resourceRef: string) => void;
}>;

const URL_WAIT_TIMEOUT_MS = 15_000;

type Entry = {
  decoded?: Promise<IsoDecodedImage>;
  url: string;
};

async function decodeImage(url: string): Promise<IsoDecodedImage> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Object image could not be read (${response.status}).`);
  }
  const bitmap = await createImageBitmap(await response.blob());
  return { bitmap, height: bitmap.height, width: bitmap.width };
}

export function createIsoImageStore(): IsoImageStore {
  const entries = new Map<string, Entry>();
  const waiters = new Map<string, Set<() => void>>();
  let disposed = false;

  function notify(resourceRef: string): void {
    const pending = waiters.get(resourceRef);
    if (!pending) return;
    waiters.delete(resourceRef);
    for (const wake of pending) wake();
  }

  function releaseEntry(entry: Entry): void {
    void entry.decoded?.then(
      (image) => image.bitmap.close(),
      () => undefined,
    );
  }

  function waitForEntry(resourceRef: string): Promise<Entry> {
    const existing = entries.get(resourceRef);
    if (existing) return Promise.resolve(existing);
    return new Promise<Entry>((resolve, reject) => {
      const pending = waiters.get(resourceRef) ?? new Set<() => void>();
      waiters.set(resourceRef, pending);
      const wake = () => {
        clearTimeout(timeout);
        pending.delete(wake);
        const entry = entries.get(resourceRef);
        if (entry) resolve(entry);
        else reject(new Error("Object image is no longer available."));
      };
      const timeout = setTimeout(() => {
        pending.delete(wake);
        reject(new Error("Object image did not become available for rendering."));
      }, URL_WAIT_TIMEOUT_MS);
      pending.add(wake);
    });
  }

  return Object.freeze({
    dispose() {
      disposed = true;
      for (const entry of entries.values()) releaseEntry(entry);
      entries.clear();
      for (const resourceRef of [...waiters.keys()]) notify(resourceRef);
    },
    async load(resourceRef, signal) {
      if (disposed) throw new Error("Object image store is disposed.");
      signal?.throwIfAborted();
      const entry = await waitForEntry(resourceRef);
      signal?.throwIfAborted();
      entry.decoded ??= decodeImage(entry.url);
      return entry.decoded;
    },
    register(resourceRef, url) {
      if (disposed) return;
      const existing = entries.get(resourceRef);
      if (existing?.url === url) return;
      if (existing) releaseEntry(existing);
      entries.set(resourceRef, { url });
      notify(resourceRef);
    },
    unregister(resourceRef) {
      const existing = entries.get(resourceRef);
      if (!existing) return;
      entries.delete(resourceRef);
      releaseEntry(existing);
    },
  });
}
