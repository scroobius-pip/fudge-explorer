// These are already resized and flipped for WebGL. Keep this version separate
// from the HTTP cache, which holds the original screenshots. Bump the version
// if texture decoding changes its orientation or color handling.
const CACHE_NAME = "explorer-prepared-images-v1";
const MAX_ENTRIES = 300;
const MAX_BYTES = 512 * 1024;
const MAX_AGE_MS = 24 * 60 * 60 * 1000;

function cacheKey(src: string, maxEdge: number): string {
  const url = new URL(src, globalThis.location.origin);
  url.searchParams.set("prepared-edge", String(maxEdge));
  return url.href;
}

export async function readPreparedImage(
  src: string,
  maxEdge: number,
): Promise<Blob | null> {
  try {
    const cache = await caches.open(CACHE_NAME);
    const key = cacheKey(src, maxEdge);
    const response = await cache.match(key);
    if (!response) return null;
    const savedAt = Number(response.headers.get("x-prepared-at"));
    if (!savedAt || Date.now() - savedAt >= MAX_AGE_MS) {
      await cache.delete(key);
      return null;
    }
    return await response.blob();
  } catch {
    // Storage may be unavailable, full, or cleared while the page is open.
    return null;
  }
}

export async function savePreparedImage(
  src: string,
  maxEdge: number,
  source: ImageBitmap,
): Promise<void> {
  try {
    if (
      typeof OffscreenCanvas === "undefined" ||
      typeof caches === "undefined"
    ) return;
    const canvas = new OffscreenCanvas(source.width, source.height);
    const context = canvas.getContext("2d");
    if (!context) return;
    context.drawImage(source, 0, 0);
    // Lossless storage preserves small text and avoids recompressing screenshots.
    const blob = await canvas.convertToBlob({ type: "image/png" });
    if (blob.size > MAX_BYTES) return;
    const cache = await caches.open(CACHE_NAME);
    await cache.put(
      cacheKey(src, maxEdge),
      new Response(blob, {
        headers: {
          "content-type": blob.type,
          "x-prepared-at": String(Date.now()),
        },
      }),
    );
    const keys = await cache.keys();
    await Promise.all(
      keys.slice(0, Math.max(0, keys.length - MAX_ENTRIES))
        .map((key) => cache.delete(key)),
    );
  } catch {
    // Saving a shortcut must never prevent the original image from displaying.
  }
}
