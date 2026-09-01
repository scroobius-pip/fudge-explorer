import * as THREE from "three";

const MAX = 2;
const waiting: Array<{
  priority: number;
  sequence: number;
  start(): void;
  cancel(): void;
}> = [];
let active = 0;
let sequence = 0;

const textures = new Map<string, THREE.Texture>();
const pending = new Map<
  string,
  {
    controller: AbortController;
    consumers: number;
    promise: Promise<THREE.Texture>;
  }
>();

export type TextureLoad = {
  promise: Promise<THREE.Texture>;
  cancel(): void;
};

export function textureQueueBusy(): boolean {
  return active > 0 || waiting.length > 0 || pending.size > 0;
}
export function acquireSlot(
  priority = Number.MAX_SAFE_INTEGER,
  signal?: AbortSignal,
): Promise<void> {
  const { promise, resolve, reject } = Promise.withResolvers<void>();
  let settled = false;
  const request = {
    priority,
    sequence: sequence++,
    start: () => {
      if (settled) return;
      settled = true;
      signal?.removeEventListener("abort", onAbort);
      active += 1;
      resolve();
    },
    cancel: () => {
      if (settled) return;
      settled = true;
      signal?.removeEventListener("abort", onAbort);
      reject(new DOMException("Texture load cancelled", "AbortError"));
    },
  };
  const onAbort = () => {
    const index = waiting.indexOf(request);
    if (index >= 0) waiting.splice(index, 1);
    request.cancel();
  };
  if (signal?.aborted) request.cancel();
  else if (active < MAX) request.start();
  else {
    signal?.addEventListener("abort", onAbort, { once: true });
    waiting.push(request);
    waiting.sort(
      (a, b) => a.priority - b.priority || a.sequence - b.sequence,
    );
  }
  return promise;
}

export function releaseSlot() {
  active = Math.max(0, active - 1);
  const next = waiting.shift();
  next?.start();
}

export function cancelTextureLoads() {
  for (const request of pending.values()) request.controller.abort();
}

const DECODE_REV = 6;

function loadImage(blob: Blob, signal: AbortSignal): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const objectUrl = URL.createObjectURL(blob);
    img.decoding = "async";
    const cleanup = () => {
      signal.removeEventListener("abort", onAbort);
      img.onload = null;
      img.onerror = null;
      URL.revokeObjectURL(objectUrl);
    };
    const onAbort = () => {
      cleanup();
      img.removeAttribute("src");
      reject(new DOMException("Texture load cancelled", "AbortError"));
    };
    img.onload = () => {
      cleanup();
      resolve(img);
    };
    img.onerror = () => {
      cleanup();
      reject(new Error("Unable to decode capture image"));
    };
    if (signal.aborted) {
      onAbort();
      return;
    }
    signal.addEventListener("abort", onAbort, { once: true });
    img.src = objectUrl;
  });
}

async function decode(
  src: string,
  maxEdge: number,
  priority: number,
  signal: AbortSignal,
): Promise<THREE.Texture> {
  await acquireSlot(priority, signal);
  try {
    const response = await fetch(src, { signal });
    if (!response.ok) throw new Error(`image ${response.status}`);
    const blob = await response.blob();
    if (signal.aborted) {
      throw new DOMException("Texture load cancelled", "AbortError");
    }

    let source: HTMLImageElement | ImageBitmap;
    if (typeof createImageBitmap === "function") {
      const original = await createImageBitmap(blob, {
        imageOrientation: "flipY",
      });
      if (signal.aborted) {
        original.close();
        throw new DOMException("Texture load cancelled", "AbortError");
      }
      const edge = Math.max(original.width, original.height);
      source = original;
      if (edge > maxEdge) {
        const scale = maxEdge / edge;
        try {
          source = await createImageBitmap(original, {
            resizeWidth: Math.max(1, Math.round(original.width * scale)),
            resizeHeight: Math.max(1, Math.round(original.height * scale)),
            resizeQuality: "high",
          });
        } finally {
          original.close();
        }
      }
    } else {
      source = await loadImage(blob, signal);
    }
    if (signal.aborted) {
      if (
        typeof ImageBitmap !== "undefined" &&
        source instanceof ImageBitmap
      ) {
        source.close();
      }
      throw new DOMException("Texture load cancelled", "AbortError");
    }
    const tex = new THREE.Texture(source);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.minFilter = THREE.LinearMipmapLinearFilter;
    tex.magFilter = THREE.LinearFilter;
    tex.generateMipmaps = true;
    tex.anisotropy = 1;
    tex.flipY = true;
    tex.userData.rev = DECODE_REV;
    tex.userData.maxEdge = maxEdge;
    tex.needsUpdate = true;
    return tex;
  } finally {
    releaseSlot();
  }
}

function isCurrent(tex: THREE.Texture) {
  return tex.userData.rev === DECODE_REV;
}

function hasResolution(tex: THREE.Texture, minEdge: number) {
  return isCurrent(tex) && (Number(tex.userData.maxEdge) || 0) >= minEdge;
}

export function loadCaptureTexture(
  src: string,
  maxEdge: number,
  priority = Number.MAX_SAFE_INTEGER,
): TextureLoad {
  const hit = textures.get(src);
  if (hit && hasResolution(hit, maxEdge)) {
    return { promise: Promise.resolve(hit), cancel() {} };
  }
  if (hit && !isCurrent(hit)) textures.delete(src);
  const pendingKey = `${src}:${maxEdge}`;
  let request = pending.get(pendingKey);
  if (request?.controller.signal.aborted) {
    pending.delete(pendingKey);
    request = undefined;
  }
  if (!request) {
    const controller = new AbortController();
    request = {
      controller,
      consumers: 0,
      promise: Promise.resolve(null as unknown as THREE.Texture),
    };
    const currentRequest = request;
    currentRequest.promise = decode(
      src,
      maxEdge,
      priority,
      controller.signal,
    )
      .then((tex) => {
        const current = textures.get(src);
        if (
          !current ||
          !isCurrent(current) ||
          Number(current.userData.maxEdge) < maxEdge
        ) {
          textures.set(src, tex);
        }
        return tex;
      })
      .finally(() => {
        if (pending.get(pendingKey) === currentRequest) {
          pending.delete(pendingKey);
        }
      });
    pending.set(pendingKey, currentRequest);
  }
  request.consumers += 1;
  const subscribedRequest = request;
  let cancelled = false;
  return {
    promise: subscribedRequest.promise,
    cancel() {
      if (cancelled) return;
      cancelled = true;
      subscribedRequest.consumers = Math.max(
        0,
        subscribedRequest.consumers - 1,
      );
      if (
        subscribedRequest.consumers === 0 &&
        pending.get(pendingKey) === subscribedRequest
      ) {
        subscribedRequest.controller.abort();
      }
    },
  };
}

export function peekTexture(src: string, minEdge = 0): THREE.Texture | null {
  const hit = textures.get(src);
  return hit && hasResolution(hit, minEdge) ? hit : null;
}
