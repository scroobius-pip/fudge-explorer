import * as THREE from "three";

const MAX = 4;
const waiting: Array<() => void> = [];
let active = 0;

const textures = new Map<string, THREE.Texture>();
const pending = new Map<string, Promise<THREE.Texture>>();

export function acquireSlot(): Promise<void> {
  return new Promise((resolve) => {
    const start = () => {
      active += 1;
      resolve();
    };
    if (active < MAX) start();
    else waiting.push(start);
  });
}

export function releaseSlot() {
  active = Math.max(0, active - 1);
  const next = waiting.shift();
  if (next) next();
}

const DECODE_REV = 5;

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.decoding = "async";
    img.onload = () => resolve(img);
    img.onerror = () => {
      const pin = src.match(/pin\.fontofweb\.com\/(\d+)/);
      if (pin) {
        loadImage(`/api/media/${pin[1]}`).then(resolve, reject);
        return;
      }
      reject(new Error(`image ${src}`));
    };
    img.src = src;
  });
}

async function decode(src: string, maxEdge: number): Promise<THREE.Texture> {
  await acquireSlot();
  try {
    const img = await loadImage(src);
    const edge = Math.max(img.naturalWidth, img.naturalHeight);
    let source: HTMLImageElement | ImageBitmap = img;
    if (edge > maxEdge && typeof createImageBitmap === "function") {
      const scale = maxEdge / edge;
      source = await createImageBitmap(img, {
        imageOrientation: "flipY",
        resizeWidth: Math.max(1, Math.round(img.naturalWidth * scale)),
        resizeHeight: Math.max(1, Math.round(img.naturalHeight * scale)),
        resizeQuality: "high",
      });
    }
    const tex = new THREE.Texture(source);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.minFilter = THREE.LinearFilter;
    tex.magFilter = THREE.LinearFilter;
    tex.generateMipmaps = false;
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
): Promise<THREE.Texture> {
  const hit = textures.get(src);
  if (hit && hasResolution(hit, maxEdge)) return Promise.resolve(hit);
  if (hit && !isCurrent(hit)) textures.delete(src);
  const pendingKey = `${src}:${maxEdge}`;
  const open = pending.get(pendingKey);
  if (open) return open;
  const work = decode(src, maxEdge)
    .then((tex) => {
      const current = textures.get(src);
      if (
        !current ||
        !isCurrent(current) ||
        Number(current.userData.maxEdge) < maxEdge
      ) {
        textures.set(src, tex);
      }
      pending.delete(pendingKey);
      return tex;
    })
    .catch((error) => {
      pending.delete(pendingKey);
      throw error;
    });
  pending.set(pendingKey, work);
  return work;
}

export function peekTexture(src: string, minEdge = 0): THREE.Texture | null {
  const hit = textures.get(src);
  return hit && hasResolution(hit, minEdge) ? hit : null;
}
