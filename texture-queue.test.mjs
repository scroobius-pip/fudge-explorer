import assert from "node:assert/strict";
import test from "node:test";

import {
  acquireSlot,
  loadCaptureTexture,
  releaseSlot,
} from "./src/lib/fudge/texture-queue.ts";
import {
  readPreparedImage,
  savePreparedImage,
} from "./src/lib/fudge/prepared-image-cache.ts";

function installStorage(t) {
  const entries = new Map();
  const cache = {
    async match(key) { return entries.get(String(key))?.clone(); },
    async put(key, value) { entries.set(String(key), value.clone()); },
    async delete(key) { return entries.delete(String(key)); },
    async keys() { return [...entries.keys()]; },
  };
  function setGlobal(name, value) {
    const previous = Object.getOwnPropertyDescriptor(globalThis, name);
    Object.defineProperty(globalThis, name, { configurable: true, value });
    t.after(() => {
      if (previous) Object.defineProperty(globalThis, name, previous);
      else delete globalThis[name];
    });
  }
  setGlobal("location", { origin: "https://explorer.test" });
  setGlobal("caches", { open: async () => cache });
  setGlobal("OffscreenCanvas", class {
    getContext() { return { drawImage() {} }; }
    async convertToBlob() { return new Blob(["prepared-pixels"], { type: "image/png" }); }
  });
  return { cache, entries, setGlobal };
}

test("reuses prepared pixels without fetching or resizing the original", async (t) => {
  const { setGlobal } = installStorage(t);
  await savePreparedImage("/v1/media/42", 768, { width: 768, height: 400 });
  const bitmap = { width: 768, height: 400, close() {} };
  const decodes = [];
  setGlobal("createImageBitmap", async (blob, options) => {
    decodes.push({ body: await blob.text(), options });
    return bitmap;
  });
  const fetchMock = t.mock.method(globalThis, "fetch", async () => {
    throw new Error("A prepared image should not fetch the original");
  });
  const texture = await loadCaptureTexture("/v1/media/42", 768).promise;
  assert.equal(texture.image, bitmap);
  assert.equal(fetchMock.mock.callCount(), 0);
  assert.deepEqual(decodes, [{
    body: "prepared-pixels", options: { imageOrientation: "none" },
  }]);
  assert.equal(await readPreparedImage("/v1/media/42", 2048), null);
});

test("expires prepared pixels after a day and bounds disk entries", async (t) => {
  const { entries } = installStorage(t);
  for (let id = 0; id < 302; id++) {
    await savePreparedImage(`/v1/media/${id}`, 768, { width: 768, height: 400 });
  }
  assert.equal(entries.size, 300);
  assert.equal(await readPreparedImage("/v1/media/0", 768), null);
  assert.equal(await (await readPreparedImage("/v1/media/301", 768)).text(), "prepared-pixels");
  const now = Date.now();
  t.mock.method(Date, "now", () => now + 24 * 60 * 60 * 1000);
  assert.equal(await readPreparedImage("/v1/media/301", 768), null);
  assert.equal(entries.size, 299);
});

test("falls back to original decoding when storage is unavailable", async (t) => {
  const { setGlobal } = installStorage(t);
  setGlobal("caches", { open: async () => { throw new Error("Storage denied"); } });
  assert.equal(await readPreparedImage("/v1/media/43", 768), null);
  const decoded = [];
  setGlobal("createImageBitmap", async (_source, options) => {
    decoded.push(options);
    return { width: 768, height: 400, close() {} };
  });
  const fetchMock = t.mock.method(globalThis, "fetch", async () => new Response("original"));
  const texture = await loadCaptureTexture("/v1/media/43", 768).promise;
  assert.equal(texture.image.width, 768);
  assert.equal(fetchMock.mock.callCount(), 1);
  assert.deepEqual(decoded, [{ imageOrientation: "flipY" }]);
});

test("does not persist oversized prepared images", async (t) => {
  const { entries, setGlobal } = installStorage(t);
  setGlobal("OffscreenCanvas", class {
    getContext() { return { drawImage() {} }; }
    async convertToBlob() { return new Blob([new Uint8Array(512 * 1024 + 1)]); }
  });
  await savePreparedImage("/v1/media/45", 2048, { width: 2048, height: 1200 });
  assert.equal(entries.size, 0);
});

test("replaces an unreadable prepared image with the original", async (t) => {
  const { setGlobal } = installStorage(t);
  await savePreparedImage("/v1/media/44", 768, { width: 768, height: 400 });
  setGlobal("createImageBitmap", async (_source, options) => {
    if (options.imageOrientation === "none") throw new Error("Bad cached image");
    return { width: 768, height: 400, close() {} };
  });
  const fetchMock = t.mock.method(globalThis, "fetch", async () => new Response("original"));
  await loadCaptureTexture("/v1/media/44", 768).promise;
  assert.equal(fetchMock.mock.callCount(), 1);
});

test("starts nearer queued texture work first and drops cancelled work", async () => {
  await Promise.all([acquireSlot(0), acquireSlot(1)]);

  const farController = new AbortController();
  let farStarted = false;
  const far = acquireSlot(20, farController.signal).then(() => {
    farStarted = true;
  });
  let nearStarted = false;
  const near = acquireSlot(2).then(() => {
    nearStarted = true;
  });

  releaseSlot();
  await near;
  assert.equal(nearStarted, true);
  assert.equal(farStarted, false);

  farController.abort();
  await assert.rejects(far, { name: "AbortError" });

  releaseSlot();
  releaseSlot();
});
