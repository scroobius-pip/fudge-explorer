import { buildIndexes, createIndexes, termLabel, famResolve, TYPE } from "./indexes.js";
import { initFontSources, disposeFontSources } from "./fonts.js";

export const MAXCOLS = 7;
export const NUMERIC_VIEWS = new Set(["capture", "family", "designer", "vendor", "motion", "rawCapture", "fontLookup"]);

export const column = (type, id, label) => ({ type, id: NUMERIC_VIEWS.has(type) ? Number(id) : id, label });
export const homeColumn = () => column("home", "", "The dataset");
export const columnKey = (c) => JSON.stringify([c.type, c.id, c.label]);
export const columnIdentity = (c) => JSON.stringify(c.type === "browse" ? [c.type, c.id, c.label] : [c.type, c.id]);

export class ExplorerStore extends EventTarget {
  constructor() {
    super();
    this.data = null;
    this.gradients = {};
    this.legacyColors = {};
    this.fontSources = {};
    this.relations = [];
    this.idx = createIndexes();
    this.generation = 0;
    this.revision = 0;
    this.columns = [homeColumn()];
    this.loading = true;
    this.detailsLoading = false;
    this.detailsError = null;
    this.progress = { scope: "bootstrap", phase: "waiting", label: "Preparing the Explorer", loaded: 0, total: null };
    this.error = null;
    this.rawCache = new Map();
    this.rawSeq = 0;
    this.suppressHash = false;
    this.similarityCache = new Map();
    this.VIEWS = {};
    this.config = Object.assign({ endpoint: "/v1/query", request: {} }, window.FUDGE_EXPLORER_CONFIG || {});
    this.loadController = null;
  }

  get D() { return this.data; }

  emit() { this.dispatchEvent(new Event("change")); }

  raw(obj) {
    const id = ++this.rawSeq;
    this.rawCache.set(id, obj);
    return id;
  }

  /* ---------- request plumbing ---------- */

  async requestServiceJson(url, signal) {
    const headers = new Headers(this.config.request.headers);
    const request = Object.assign({}, this.config.request, { signal, headers });
    const response = await fetch(url, request);
    if (!response.ok) {
      throw Object.assign(
        new Error(response.status + " " + response.statusText + " · " + url),
        { status: response.status },
      );
    }
    return response.json();
  }

  async requestBootstrapJson(url, signal) {
    const headers = new Headers(this.config.request.headers);
    headers.set("accept", "application/x-fudge-explorer-stream");
    const request = Object.assign({}, this.config.request, { signal, headers });
    const response = await fetch(url, request);
    if (!response.ok) {
      throw Object.assign(
        new Error(response.status + " " + response.statusText + " · " + url),
        { status: response.status },
      );
    }
    if (
      !response.headers.get("content-type")?.includes("application/x-fudge-explorer-stream")
      || !response.body?.getReader
    ) return response.json();

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let pending = new Uint8Array();
    let bundleBytes = null;
    let loadedBytes = 0;
    const chunks = [];
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      pending = appendBytes(pending, value);
      while (bundleBytes == null) {
        const newline = pending.indexOf(10);
        if (newline < 0) break;
        const event = JSON.parse(decoder.decode(pending.slice(0, newline)));
        pending = pending.slice(newline + 1);
        if (event.type === "progress") {
          this.setProgress("bootstrap", {
            phase: "server",
            completed: event.completed,
            total: event.total,
          });
        } else if (event.type === "bundle") {
          if (!Number.isSafeInteger(event.bytes) || event.bytes < 1) {
            throw new Error("Explorer bundle stream was invalid");
          }
          bundleBytes = event.bytes;
        } else if (event.type === "error") {
          throw Object.assign(new Error(event.detail || event.error || "Explorer load failed"), {
            status: event.status,
          });
        }
      }
      if (bundleBytes != null && pending.byteLength) {
        chunks.push(pending);
        loadedBytes += pending.byteLength;
        pending = new Uint8Array();
        this.setProgress("bootstrap", {
          phase: "downloading",
          loaded: loadedBytes,
          total: bundleBytes,
        });
      }
    }
    if (bundleBytes == null || loadedBytes !== bundleBytes) {
      throw new Error("Explorer bundle stream was incomplete");
    }
    this.setProgress("bootstrap", { phase: "parsing" });
    await nextPaint();
    return JSON.parse(decoder.decode(joinBytes(chunks, bundleBytes)));
  }

  phaseUrl(phase, generation) {
    const url = new URL(this.config.endpoint, location.href);
    url.searchParams.set("phase", phase);
    if (generation != null) url.searchParams.set("generation", generation);
    return url.href;
  }

  usesPhasedLoading() {
    if (this.config.phased != null) return Boolean(this.config.phased);
    const endpoint = new URL(this.config.endpoint, location.href);
    const method = String(this.config.request.method || "GET").toUpperCase();
    return endpoint.origin === location.origin
      && endpoint.pathname === "/v1/query"
      && endpoint.search === ""
      && method === "GET";
  }

  setProgress(scope, update, emit = true) {
    const labels = {
      waiting: scope === "details" ? "Preparing measured details" : "Preparing the Explorer",
      downloading: scope === "details" ? "Downloading measured details" : "Downloading corpus data",
      parsing: scope === "details" ? "Reading measured details" : "Reading corpus data",
      indexing: scope === "details" ? "Adding measured details" : "Building the Explorer",
      ready: "Explorer ready",
    };
    const value = progressValue(scope, update);
    this.progress = {
      scope,
      phase: update.phase,
      label: labels[update.phase] || labels.waiting,
      loaded: update.loaded || 0,
      total: update.total || null,
      value: scope === "bootstrap"
        ? Math.max(this.progress?.scope === "bootstrap" ? this.progress.value || 0 : 0, value)
        : value,
    };
    this.dispatchEvent(new Event("progress"));
    if (emit) this.emit();
  }

  similarityUrl(path, parameters) {
    const url = new URL(this.config.endpoint, location.href);
    url.pathname = path;
    url.search = "";
    for (const [key, value] of Object.entries(parameters)) url.searchParams.set(key, value);
    url.searchParams.set("generation", this.data.observed_generation);
    return url.href;
  }

  loadSimilarity(cacheKey, path, parameters) {
    const key = this.data.observed_generation + ":" + cacheKey;
    if (!this.similarityCache.has(key)) {
      const load = this.requestServiceJson(this.similarityUrl(path, parameters)).catch((error) => {
        this.similarityCache.delete(key);
        throw error;
      });
      this.similarityCache.set(key, load);
    }
    return this.similarityCache.get(key);
  }

  normalizeBundle(payload) {
    const data = payload.data || payload.snapshot || payload;
    return {
      data,
      gradients: payload.gradients ?? data.gradients ?? {},
      fontSources: payload.fontSources ?? payload.font_sources ?? data.font_sources ?? {},
      relations: payload.relations ?? data.relations ?? [],
      legacyColors: payload.legacyColors ?? payload.legacy_colors ?? data.legacy_colors ?? {},
    };
  }

  async reload(retryGenerationChange = true) {
    if (this.loadController) this.loadController.abort();
    const controller = (this.loadController = new AbortController());
    this.loading = true;
    this.detailsLoading = false;
    this.detailsError = null;
    this.error = null;
    this.setProgress("bootstrap", { phase: "waiting" }, false);
    this.emit();
    try {
      const phased = this.usesPhasedLoading();
      const bundle = phased
        ? await this.requestBootstrapJson(this.phaseUrl("bootstrap"), controller.signal)
        : await this.requestServiceJson(this.config.endpoint, controller.signal);
      if (controller !== this.loadController || controller.signal.aborted) return;
      const installed = await this.installBundle(this.normalizeBundle(bundle), controller);
      if (!installed) return;
      if (phased) await this.loadDetails(controller, retryGenerationChange);
    } catch (error) {
      if (controller !== this.loadController || controller.signal.aborted || error.name === "AbortError") return;
      if (error.status === 409 && retryGenerationChange) return this.reload(false);
      this.loading = false;
      this.detailsLoading = false;
      this.error = String(error);
      disposeFontSources();
      this.emit();
      this.dispatchEvent(new Event("bootstrap-error"));
    }
  }

  configure(options = {}) {
    Object.assign(this.config, options);
    return this.reload();
  }

  async installBundle(bundle, controller = this.loadController) {
    const { data, gradients, fontSources, relations, legacyColors } = bundle;
    this.setProgress("bootstrap", { phase: "indexing" });
    await nextPaint();
    const idx = buildIndexes(data, gradients, legacyColors);
    if (controller !== this.loadController || controller?.signal.aborted) return false;
    this.similarityCache.clear();
    this.rawCache.clear();
    this.data = Object.assign({}, data, { gradients, legacy_colors: legacyColors });
    this.gradients = gradients;
    this.legacyColors = legacyColors;
    this.fontSources = fontSources;
    this.relations = relations;
    this.generation++;
    this.revision++;
    this.loading = false;
    this.error = null;
    this.idx = idx;
    initFontSources(fontSources);
    this.setProgress("bootstrap", { phase: "ready" }, false);
    this.emit();
    if (!this.openHash(location.hash, true)) this.setColumns([homeColumn()], { historyMode: "replace" });
    this.dispatchEvent(new Event("bootstrap-ready"));
    return true;
  }

  async loadDetails(controller, retryGenerationChange) {
    const generation = this.data.observed_generation;
    this.detailsLoading = true;
    this.setProgress("details", { phase: "waiting" });
    try {
      const payload = await this.requestServiceJson(
        this.phaseUrl("details", generation),
        controller.signal,
      );
      if (controller !== this.loadController || controller.signal.aborted) return;
      if (payload.data?.observed_generation !== generation) {
        throw Object.assign(new Error("Explorer detail generation changed"), { status: 409 });
      }
      this.setProgress("details", { phase: "indexing" });
      await nextPaint();
      const legacyColors = payload.legacyColors ?? payload.legacy_colors ?? {};
      const data = Object.assign({}, this.data, payload.data, {
        gradients: this.gradients,
        legacy_colors: legacyColors,
      });
      const idx = buildIndexes(data, this.gradients, legacyColors);
      if (controller !== this.loadController || controller.signal.aborted) return;
      this.data = data;
      this.legacyColors = legacyColors;
      this.idx = idx;
      this.revision++;
      this.detailsLoading = false;
      this.detailsError = null;
      this.setProgress("details", { phase: "ready" }, false);
      this.emit();
    } catch (error) {
      if (controller !== this.loadController || controller.signal.aborted || error.name === "AbortError") return;
      if (error.status === 409 && retryGenerationChange) return this.reload(false);
      this.detailsLoading = false;
      this.detailsError = String(error);
      this.setProgress("details", { phase: "ready" }, false);
      this.emit();
    }
  }

  /* ---------- column stack ---------- */

  stackHash(stack = this.columns) {
    const payload = stack.slice(1).map((c) => [c.type, c.id, c.label]);
    return payload.length ? "#stack/" + encodeURIComponent(JSON.stringify(payload)) : "";
  }

  syncHash(replace = false) {
    const h = this.stackHash();
    if (location.hash === h) return;
    this.suppressHash = true;
    try {
      history[replace ? "replaceState" : "pushState"](null, "", h || (location.pathname + location.search));
    } catch (_) {
      if (h) location.hash = h;
    }
    queueMicrotask(() => { this.suppressHash = false; });
  }

  legacyStack(hash) {
    const m = String(hash || "").match(/^#([^/]+)\/(.+)$/);
    if (!m) return null;
    let type;
    let id;
    try {
      type = decodeURIComponent(m[1]);
      id = decodeURIComponent(m[2]);
    } catch (_) { return null; }
    if (!Object.hasOwn(this.VIEWS, type)) return null;
    if (NUMERIC_VIEWS.has(type) && !Number.isFinite(Number(id))) return null;
    let label = id;
    if (type === "capture") {
      const cp = this.idx.cById.get(Number(id));
      if (cp) label = cp[3];
    } else if (type === "domain") {
      label = String(id).replace("https://", "");
    } else if (type === "term") {
      label = String(termLabel(this.data, id) || id);
    } else if (type === "family") {
      const f = this.idx.fById.get(Number(id));
      if (f) label = f[1];
    } else if (type === "browse") {
      if (id.startsWith("~[")) {
        try {
          [id, label] = JSON.parse(id.slice(1));
        } catch (_) { return false; }
      } else {
        const sep = id.lastIndexOf("|");
        if (sep > 0) { label = id.slice(sep + 1); id = id.slice(0, sep); }
      }
    }
    return [homeColumn(), column(type, id, label)];
  }

  stackFromHash(hash) {
    if (!hash) return [homeColumn()];
    if (!String(hash).startsWith("#stack/")) return this.legacyStack(hash);
    try {
      const rows = JSON.parse(decodeURIComponent(String(hash).slice(7)));
      if (!Array.isArray(rows) || rows.length > MAXCOLS - 1) return null;
      const stack = [homeColumn()];
      for (const row of rows) {
        if (!Array.isArray(row) || row.length < 2 || !Object.hasOwn(this.VIEWS, row[0])) return null;
        if (NUMERIC_VIEWS.has(row[0]) && !Number.isFinite(Number(row[1]))) return null;
        stack.push(column(row[0], row[1], String(row[2] ?? row[1])));
      }
      return stack;
    } catch (_) { return null; }
  }

  setColumns(next, { animate = false, historyMode = "push" } = {}) {
    this.columns.splice(0, this.columns.length, ...next);
    this.animateColumns = animate;
    this.emit();
    if (historyMode) this.syncHash(historyMode === "replace");
  }

  openHash(hash, canonicalize = false) {
    const stack = this.stackFromHash(hash);
    if (!stack) return false;
    try {
      this.setColumns(stack, { historyMode: null });
    } catch (_) { return false; }
    if (canonicalize || !String(hash || "").startsWith("#stack/")) this.syncHash(true);
    return true;
  }

  retractTo(i) { this.setColumns(this.columns.slice(0, i + 1)); }
  closeCol(i) { if (i > 0) this.setColumns(this.columns.slice(0, i)); }

  hop(type, id, label) {
    const last = this.columns[this.columns.length - 1];
    const next = column(type, id, label);
    if (last && columnIdentity(last) === columnIdentity(next)) return;
    const stack = [...this.columns, next];
    if (stack.length > MAXCOLS) stack.splice(1, stack.length - MAXCOLS);
    this.setColumns(stack, { animate: true });
  }

  fresh(type, id, label) {
    this.setColumns([homeColumn(), column(type, id, label)], { animate: true });
  }

  restoreRoute() {
    if (this.suppressHash) return;
    if (!this.openHash(location.hash)) this.setColumns([homeColumn()], { historyMode: "replace" });
  }
}

export const store = new ExplorerStore();

export function registerView(type, fn) {
  store.VIEWS[type] = fn;
}

function nextPaint() {
  return new Promise((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      resolve();
    };
    requestAnimationFrame(finish);
    setTimeout(finish, 50);
  });
}

function progressValue(scope, update) {
  if (scope !== "bootstrap") return update.phase === "ready" ? 100 : 0;
  if (update.phase === "waiting") return 0;
  if (update.phase === "server") {
    const total = Number(update.total);
    const completed = Number(update.completed);
    return total > 0 && Number.isFinite(completed)
      ? 4 + Math.round(Math.min(1, completed / total) * 66)
      : 4;
  }
  if (update.phase === "downloading") {
    const total = Number(update.total);
    const loaded = Number(update.loaded);
    return total > 0 && Number.isFinite(loaded)
      ? 70 + Math.round(Math.min(1, loaded / total) * 18)
      : 70;
  }
  if (update.phase === "parsing") return 90;
  if (update.phase === "indexing") return 94;
  if (update.phase === "ready") return 98;
  return 0;
}

function appendBytes(left, right) {
  if (!left.byteLength) return right;
  const joined = new Uint8Array(left.byteLength + right.byteLength);
  joined.set(left);
  joined.set(right, left.byteLength);
  return joined;
}

function joinBytes(chunks, total) {
  const joined = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    joined.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return joined;
}

export { TYPE, famResolve };
