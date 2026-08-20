import assert from "node:assert/strict";
import test from "node:test";
import { Window } from "happy-dom";

const window = new Window({ url: "https://proxy.test/" });
let resolveDetails;
let detailsRequested = false;
let holdDetails = true;

const bundle = {
  data: {
    built: "2026-08-13T00:00:00.000Z",
    observed_generation: 77,
    domains: [],
    captures: [
      [1, "https://example.com", "/", "Example", 1_750_000_000_000, "https://pin.fontofweb.com/1", "desktop", "light", "unknown", "home", "desktop", 1440, 900, 1, 1440, 900, "key", "image/png", 1440, 900, "contract", 1],
      [2, "https://example.org", "/pricing", "Pricing", 1_751_000_000_000, "https://pin.fontofweb.com/2", "desktop", "dark", "unknown", "home", "desktop", 1440, 900, 1, 1440, 900, "key2", "image/png", 1440, 900, "contract", 1],
    ],
    families: [[135, "Geist", null, null]],
    designers: [],
    vendors: [],
    releases: [],
    terms: {},
    assignments: [],
    color_roles: [],
    backgrounds: [],
    font_obs: [[2, 0, "GeistSans", "GeistSans, sans-serif", 400, 600, 1_000_000, 21]],
    type_roles: [],
    text_styles: [],
    hist_fonts: [],
    structures: [],
    motion_assets: [],
    video_observations: [],
    embedded_video_captures: [],
    ann: {},
    font_similarity_results: {},
    font_similarity: {},
    catalog_matches: {},
    embedding_runtime: {},
    classification_runtime: {},
    runtime_counts: {},
  },
  gradients: {},
  legacyColors: {},
  fontSources: {},
  relations: [
    { name: "capture", group: "captures", keys: 1, nonkeys: 27, description: "One row per captured page.", access: "read" },
  ],
};

test.before(() => {
  globalThis.window = window;
  globalThis.document = window.document;
  globalThis.customElements = window.customElements;
  globalThis.HTMLElement = window.HTMLElement;
  globalThis.Element = window.Element;
  globalThis.Node = window.Node;
  globalThis.SVGElement = window.SVGElement;
  globalThis.CustomEvent = window.CustomEvent;
  globalThis.MouseEvent = window.MouseEvent;
  globalThis.PointerEvent = window.PointerEvent;
  Object.defineProperty(globalThis, "navigator", { value: window.navigator, configurable: true });
  globalThis.location = window.location;
  globalThis.history = window.history;
  globalThis.localStorage = window.localStorage;
  globalThis.innerWidth = window.innerWidth;
  globalThis.innerHeight = window.innerHeight;
  globalThis.getComputedStyle = window.getComputedStyle.bind(window);
  globalThis.requestAnimationFrame = (fn) => setTimeout(() => fn(Date.now()), 0);
  document.body.innerHTML = `
    <div id="app-splash" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0">
      <span id="app-splash-wordmark">Fudge<span id="app-splash-dot">.</span></span>
      <span id="app-splash-progress"><i id="app-splash-progress-fill"></i></span>
      <span id="app-splash-progress-value">0%</span>
    </div>
    <explorer-app></explorer-app>`;
  globalThis.fetch = async (url) => {
    const target = String(url);
    if (target.includes("/v1/query?phase=bootstrap")) {
      return bootstrapResponse(bundle);
    }
    if (target.includes("/v1/query?phase=details")) {
      detailsRequested = true;
      if (holdDetails) await new Promise((resolve) => { resolveDetails = resolve; });
      return jsonResponse({
        data: {
          observed_generation: 77,
          backgrounds: [],
          text_styles: [],
          hist_fonts: [],
        },
        legacyColors: {},
      });
    }
    if (target.includes("/v1/captured-font?")) {
      return jsonResponse({
        observedGeneration: 77,
        captureId: 2,
        observationIndex: 0,
        observation: { declaredFamily: "GeistSans", computedCssStack: "GeistSans, sans-serif" },
        pipeline: { state: "searchable", acquisitionIndex: 0, failureCode: null },
        previewUrl: "https://api.withfudge.com/v1/font-previews/captures/2/observations/0",
        faces: [{
          acquisitionIndex: 0,
          identity: { contentSha256: "abc", faceIndex: 0, variationCoordinates: "" },
          descriptorSchemaId: "descriptor-v1",
          metadata: { family: "Geist", subfamily: "Regular", fullName: "Geist Regular", postscriptName: "Geist-Regular", version: "Version 1.800", axisCount: 1 },
          resolution: { state: "unresolved", logicalFaceId: null, familyId: null, familyName: null },
        }],
      });
    }
    if (target.includes("/v1/similar-captured-fonts?")) {
      return jsonResponse({
        observedGeneration: 77,
        target: { captureId: 2, observationIndex: 0, familyName: "GeistSans", previewUrl: "https://api.withfudge.com/v1/font-previews/captures/2/observations/0" },
        results: [{ rank: 1, familyId: 135, familyName: "Geist", previewUrl: "https://api.withfudge.com/v1/font-previews/135", visualDistance: 0.00039, metricDistance: 0.00011, commonGlyphs: 88 }],
      });
    }
    return new window.Response("not found", { status: 404 });
  };
});

test.before(() => {
  window.FUDGE_EXPLORER_CONFIG = { endpoint: "/v1/query", request: {} };
});

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function until(predicate, timeout = 2000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    if (predicate()) return;
    await sleep(10);
  }
  throw new Error("condition not met within timeout");
}

function jsonResponse(payload) {
  const body = JSON.stringify(payload);
  return new window.Response(body, {
    status: 200,
    headers: { "x-uncompressed-content-length": String(new TextEncoder().encode(body).byteLength) },
  });
}

function bootstrapResponse(payload) {
  const encoder = new TextEncoder();
  const body = encoder.encode(JSON.stringify(payload));
  const prefix = encoder.encode([
    JSON.stringify({ type: "progress", completed: 1, total: 4 }),
    JSON.stringify({ type: "progress", completed: 2, total: 4 }),
    JSON.stringify({ type: "progress", completed: 4, total: 4 }),
    JSON.stringify({ type: "bundle", bytes: body.byteLength }),
  ].join("\n") + "\n");
  const bytes = new Uint8Array(prefix.byteLength + body.byteLength);
  bytes.set(prefix);
  bytes.set(body, prefix.byteLength);
  const cuts = [7, Math.floor(prefix.byteLength / 2), prefix.byteLength + Math.floor(body.byteLength / 2), bytes.byteLength];
  let start = 0;
  const stream = new ReadableStream({
    async start(controller) {
      for (const end of cuts) {
        await sleep(4);
        controller.enqueue(bytes.slice(start, end));
        start = end;
      }
      controller.close();
    },
  });
  return new window.Response(stream, {
    status: 200,
    headers: { "content-type": "application/x-fudge-explorer-stream" },
  });
}

test("boots the explorer app and renders the home column from the bundle", async () => {
  assert.equal(document.querySelector("#app-splash-wordmark").textContent, "Fudge.");
  await import("./src/main.js");
  const { store } = await import("./src/data/store.js");
  assert.equal(document.querySelectorAll("explorer-app").length, 1, "exactly one app element");
  assert.equal(document.querySelectorAll("header").length, 1, "exactly one header");
  assert.ok(document.querySelector("explorer-app"), "app element mounted");
  assert.ok(window.FudgeExplorer, "FudgeExplorer global API exposed");
  await until(() => Number(document.querySelector("#app-splash")?.getAttribute("aria-valuenow")) >= 20);
  await until(() => !store.loading && store.data != null);
  await until(() => detailsRequested && store.detailsLoading);
  await until(() => document.querySelector("#app-splash")?.getAttribute("aria-valuenow") === "100");
  assert.equal(document.querySelector("#app-splash-progress-fill").style.width, "100%");
  await until(() => document.querySelector("#app-splash").classList.contains("app-splash--dismissing"));
  document.querySelector("#app-splash").dispatchEvent(new window.Event("transitionend"));
  assert.equal(document.querySelector("#app-splash"), null, "splash clears before details finish");
  assert.equal(document.querySelector("#cols").getAttribute("aria-busy"), "true");
  await until(() => document.querySelectorAll("explorer-column").length === 1);
  const home = document.querySelector("explorer-column");
  assert.equal(home.querySelector(".chead .t").textContent, "The dataset");
  assert.match(home.textContent, /Most used terms/);
  assert.match(home.textContent, /Newest captures/);
  assert.equal(document.querySelector("#meta").textContent, "2 captures · 0 domains · loading details");
  assert.match(document.querySelector("explorer-app").innerHTML, /explorer-search/);
  assert.ok(document.querySelector("explorer-search #q"), "search input rendered");
  assert.ok(document.querySelector("explorer-lightbox"), "lightbox rendered");
  assert.ok(document.querySelector("explorer-hover"), "capture hover rendered");
  resolveDetails();
  await until(() => !store.detailsLoading);
  assert.equal(document.querySelector("#cols").getAttribute("aria-busy"), "false");
  assert.equal(document.querySelector("#meta").textContent, "2 captures · 0 domains");
});

test("hops open capture columns and record a stack hash", async () => {
  const { store } = await import("./src/data/store.js");
  await until(() => store.data != null && !store.loading);
  const row = document.querySelector(".capture-row[data-hop-type='capture']");
  assert.ok(row, "capture row rendered");
  row.dispatchEvent(new window.MouseEvent("click", { bubbles: true, composed: true }));
  await until(() => store.columns.length === 2);
  assert.equal(store.columns[1].type, "capture");
  assert.equal(store.columns[1].id, 2);
  assert.ok(String(window.location.hash).startsWith("#stack/"), "stack hash recorded");
  await until(() => document.querySelectorAll("explorer-column").length === 2);
  const captureCol = document.querySelectorAll("explorer-column")[1];
  await until(() => /captured/.test(captureCol.textContent));
  assert.match(captureCol.textContent, /captured/);
  assert.match(captureCol.textContent, /No palette is present/);
});

test("closing a column retracts the stack and restores the hash", async () => {
  const { store } = await import("./src/data/store.js");
  await until(() => store.columns.length === 2);
  const cols = document.querySelectorAll("explorer-column");
  const close = cols[1].querySelector(".x");
  assert.ok(close);
  close.dispatchEvent(new window.MouseEvent("click", { bubbles: true, composed: true }));
  await until(() => store.columns.length === 1);
  assert.equal(window.location.hash, "");
});

test("FudgeExplorer.reload rebuilds the columns from the same bundle", async () => {
  const { store } = await import("./src/data/store.js");
  await until(() => store.data != null && !store.loading);
  holdDetails = false;
  await window.FudgeExplorer.reload();
  await until(() => store.generation === 2);
  assert.equal(document.querySelectorAll("explorer-column").length, 1);
  assert.match(document.querySelector("explorer-column").textContent, /Most used terms/);
});

test("opens a searchable captured font without inventing a catalogue match", async () => {
  const { store } = await import("./src/data/store.js");
  await until(() => store.data != null && !store.loading);
  store.fresh("capturedFont", "2:0", "GeistSans");
  await until(() => store.columns.length === 2);
  await until(() => document.querySelectorAll("explorer-column")[1]?.textContent.includes("ready for visual search"));
  const column = document.querySelectorAll("explorer-column")[1];
  assert.match(column.textContent, /GeistSans/);
  assert.match(column.textContent, /Geist Regular/);
  assert.match(column.textContent, /No catalogue identity has been confirmed yet/);
  const similarity = column.querySelector('[data-hop-type="capturedFontLookup"]');
  assert.ok(similarity);
  similarity.dispatchEvent(new window.MouseEvent("click", { bubbles: true, composed: true }));
  await until(() => store.columns.length === 3);
  await until(() => document.querySelectorAll("explorer-column")[2]?.textContent.includes("Geist"));
  assert.match(document.querySelectorAll("explorer-column")[2].textContent, /visual 0\.0004/);
});
