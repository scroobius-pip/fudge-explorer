import { norm, esc } from "./util.js";

const state = {
  byFam: new Map(),
  byObservation: new Map(),
  entries: new Map(),
  releaseEntries: new Map(),
  faces: 0,
  epoch: 0,
};

export const fontSrcState = state;
export const fontFaceCount = () => state.faces;

let facesEl = null;
function facesElement() {
  if (!facesEl) {
    facesEl = document.createElement("style");
    facesEl.id = "font-faces";
    document.head.appendChild(facesEl);
  }
  return facesEl;
}

export function normalizeFontSourceUrl(value) {
  try {
    const url = new URL(value);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return url.hostname === "crawl.fontofweb.com" ? url.href : "https://crawl.fontofweb.com?url=" + encodeURIComponent(url.href);
  } catch (_) {
    return null;
  }
}

export function disposeFontSources() {
  state.epoch++;
  for (const entry of state.entries.values()) {
    entry.disposed = true;
    if (entry.added && entry.fontFace && document.fonts?.delete) document.fonts.delete(entry.fontFace);
  }
  for (const entry of state.releaseEntries.values()) {
    entry.disposed = true;
    if (entry.added && entry.fontFace && document.fonts?.delete) document.fonts.delete(entry.fontFace);
  }
  state.byFam.clear();
  state.byObservation.clear();
  state.entries.clear();
  state.releaseEntries.clear();
  state.faces = 0;
  const el = facesElement();
  if (el) el.textContent = "";
}

export function initFontSources(g) {
  disposeFontSources();
  const byFam = new Map();
  const makeFace = (rows, key) => {
    const seen = new Set();
    const urls = rows.slice()
      .sort((a, b) => (a.source_index || 0) - (b.source_index || 0) || (a.format || "").localeCompare(b.format || ""))
      .map((r) => ({ ...r, loadUrl: normalizeFontSourceUrl(r.url) }))
      .filter((r) => r.loadUrl && !seen.has(r.loadUrl) && seen.add(r.loadUrl));
    if (!urls.length) return null;
    const sourceKey = norm(rows[0].family) + "|" + urls.map((r) => r.loadUrl + "|" + (r.format || "")).join(",");
    if (state.entries.has(sourceKey)) return state.entries.get(sourceKey);
    const face = "fudge-src-" + (++state.faces);
    const first = urls.find((r) => r.format === "woff2") || urls[0];
    const src = urls.map((r) => 'url("' + r.loadUrl.replace(/["\\]/g, "") + '") format("' + (r.format || "woff2") + '")').join(",");
    const entry = {
      face, url: first.url, format: first.format, count: urls.length, key, src,
      state: "idle", epoch: state.epoch, disposed: false, loadPromise: null,
      fontFace: null, added: false, listeners: new Set(),
    };
    state.entries.set(sourceKey, entry);
    return entry;
  };
  for (const [captureId, rows] of Object.entries(g || {})) {
    const byObservation = new Map();
    for (const r of rows) {
      if (!r || !r.url || !r.family) continue;
      const key = norm(r.family);
      if (!byFam.has(key)) byFam.set(key, []);
      byFam.get(key).push(r);
      const observationKey = captureId + ":" + r.observation_index;
      if (!byObservation.has(observationKey)) byObservation.set(observationKey, []);
      byObservation.get(observationKey).push(r);
    }
    for (const [key, sourceRows] of byObservation) {
      const face = makeFace(sourceRows, key);
      if (face) state.byObservation.set(key, face);
    }
  }
  for (const [key, rows] of byFam) {
    const face = makeFace(rows, key);
    if (face) state.byFam.set(key, face);
  }
}

export function notifyFontSource(entry) {
  for (const listener of [...entry.listeners]) listener(entry);
}

export function specimenSrc(fam, captureId, observationIndex) {
  return captureId != null && observationIndex != null
    ? state.byObservation.get(captureId + ":" + observationIndex) || null
    : state.byFam.get(norm(fam || "")) || null;
}

export function ensureFontFaceLoaded(entry) {
  if (!entry || entry.loadPromise) return entry?.loadPromise;
  if (typeof FontFace !== "function" || !document.fonts?.add) {
    entry.state = "error";
    notifyFontSource(entry);
    return null;
  }
  entry.state = "loading";
  notifyFontSource(entry);
  const epoch = entry.epoch;
  try {
    entry.fontFace = new FontFace(entry.face, entry.src, { weight: "100 900", display: "swap" });
    entry.loadPromise = entry.fontFace.load().then((loaded) => {
      if (entry.disposed || epoch !== state.epoch) return null;
      document.fonts.add(loaded);
      entry.fontFace = loaded;
      entry.added = true;
      entry.state = "loaded";
      notifyFontSource(entry);
      return loaded;
    }, () => {
      if (!entry.disposed && epoch === state.epoch) {
        entry.state = "error";
        notifyFontSource(entry);
      }
      return null;
    });
  } catch (_) {
    entry.state = "error";
    notifyFontSource(entry);
    entry.loadPromise = Promise.resolve(null);
  }
  return entry.loadPromise;
}

export function loadVerifiedReleaseFont(source, familyId) {
  const key = source?.contentSha256;
  if (
    typeof key !== "string" || !/^[A-Za-z0-9_-]{43}$/.test(key)
    || !Number.isSafeInteger(source?.byteLength) || source.byteLength < 1
    || source.byteLength > 20 * 1024 * 1024
    || typeof source?.fontUrl !== "string"
  ) return Promise.resolve(null);
  if (state.releaseEntries.has(key)) return state.releaseEntries.get(key).loadPromise;
  const entry = {
    face: `fudge-release-${Number(familyId)}-${key.slice(0, 10)}`,
    source,
    state: "loading",
    epoch: state.epoch,
    disposed: false,
    fontFace: null,
    added: false,
    error: null,
    loadPromise: null,
  };
  state.releaseEntries.set(key, entry);
  entry.loadPromise = loadVerifiedReleaseEntry(entry);
  return entry.loadPromise;
}

async function loadVerifiedReleaseEntry(entry) {
  try {
    const url = new URL(entry.source.fontUrl);
    if (
      url.protocol !== "https:"
      || url.hostname !== "raw.githubusercontent.com"
      || url.username || url.password || url.search || url.hash
    ) throw new Error("untrusted release source");
    if (typeof FontFace !== "function" || !document.fonts?.add || !globalThis.crypto?.subtle) {
      throw new Error("verified font loading unsupported");
    }
    const response = await fetch(url.href, { mode: "cors", credentials: "omit" });
    if (!response.ok) throw new Error("release artifact unavailable");
    const buffer = await response.arrayBuffer();
    if (buffer.byteLength !== entry.source.byteLength) throw new Error("release artifact length mismatch");
    const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", buffer));
    const contentSha256 = btoa(String.fromCharCode(...digest))
      .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
    if (contentSha256 !== entry.source.contentSha256) throw new Error("release artifact hash mismatch");
    const style = entry.source.slant === "italic" || entry.source.slant === "oblique"
      ? entry.source.slant : "normal";
    const fontFace = new FontFace(entry.face, buffer, {
      display: "swap",
      style,
      weight: String(entry.source.weightClass || 400),
    });
    const loaded = await fontFace.load();
    if (entry.disposed || entry.epoch !== state.epoch) return null;
    document.fonts.add(loaded);
    entry.fontFace = loaded;
    entry.added = true;
    entry.state = "loaded";
    return entry;
  } catch (error) {
    entry.state = "error";
    entry.error = error instanceof Error ? error.message : "release font load failed";
    return entry;
  }
}

export function safeFontStack(stack, fam) {
  const value = String(stack || fam || "sans-serif").replace(/[<>;{}]/g, "").trim();
  return value || "sans-serif";
}

export function specimenCss(fam, fallbackStack, captureId, observationIndex) {
  const entry = specimenSrc(fam, captureId, observationIndex);
  if (entry) ensureFontFaceLoaded(entry);
  const face = entry?.face;
  return "font-family:" + (face ? "'" + face + "', " : "") + safeFontStack(fallbackStack, fam);
}

export function sourceEntry(fam, captureId, observationIndex) {
  const e = specimenSrc(fam, captureId, observationIndex);
  if (e) ensureFontFaceLoaded(e);
  return e || null;
}

export function sourceUrlDisplay(url) {
  try {
    const parsed = new URL(url);
    return parsed.host + "/…";
  } catch (_) {
    return "source unavailable";
  }
}

export function sourceStateLabel(entry) {
  if (!entry) return "";
  const label = entry.state === "loading" ? "loading source"
    : entry.state === "loaded" ? "src loaded"
    : entry.state === "error" ? "load failed"
    : "source";
  const suffix = entry.state === "loaded" ? "" : " · showing fallback";
  return label + " " + esc(sourceUrlDisplay(entry.url)) + " · " + esc(entry.format || "") + suffix;
}
