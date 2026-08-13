import assert from "node:assert/strict";
import test from "node:test";

import { buildExplorerBundle, EXPLORER_QUERIES } from "./explorer-bundle.js";

test("materializes the live projections into the Explorer bundle contract", async () => {
  const rows = Object.fromEntries(Object.keys(EXPLORER_QUERIES).map((name) => [name, []]));
  rows.captures = [[
    42, "https://example.com", "/", "Example", 1_700_000_000_000,
    "desktop", "light", "default", "viewport", "browser", 1440, 900, 2,
    1440, 900, "captures/42.png", "image/png", 1440, 900, "capture-v1", 3,
  ]];
  rows.families = [[7, "Example Sans", 8, 9]];
  rows.designers = [[8, "Example Designer", "https://designer.example"]];
  rows.vendors = [[9, "Example Foundry", "https://foundry.example"]];
  rows.releases = [[7, "release", "1", 1_700_000_000_000, "https://font.example"]];
  rows.terms = [["page.home", "Home", "A home page", "page_role"]];
  rows.assignments = [[42, "page.home", 0.95, "capture", "automatic"]];
  rows.colorRoles = [[42, "text_primary", 17, 17, 17, 1_000_000, 2, 1]];
  rows.backgrounds = [[42, 255, 255, 255, 1_000_000, 1, "computed", 0]];
  rows.fontObservations = [[42, 0, "Example Sans", "Example Sans, sans-serif", 400, 700, 900_000, 3]];
  rows.typeRoles = [[42, "body", "Example Sans", 400, 16_000, 24_000, 900_000, 1]];
  rows.textStyles = [[42, "Example Sans", 400, 16_000, 3, 0]];
  rows.historicalFonts = [[42, 7, "Example Sans", "Regular", 1, 11]];
  rows.structures = [[42, 1, null, "section.hero", 0, 0, 10_000, 5_000, 1, 1, 2, 1, 24_000, 900_000, "model"]];
  rows.motionAssets = [[42, "captures/42.webm", "video/webm", 123, 1_000, 100, 50]];
  rows.videoObservations = [[42, 0, "video", 0, 0, 10_000, 5_000, 500_000, 1, "dom_geometry"]];
  rows.gradients = [[42, 1, null, 0, "linear", 90_000, 0, 0, 10_000, 5_000, 1, "computed"]];
  rows.legacyColors = [[42, [0xffffff, 0x111111, 0xffffff]]];
  rows.fontSources = [[42, 0, 0, "Example Sans", "woff2", "https://font.example/example.woff2"]];
  rows.embeddingRuntime = [["current", null, 1_700_000_000_000, null, "capture_index", "contract", "provider", "model", "v1", 768, "f32", "cosine", "l2", "screenshot", 77, 1, 16, 100, 1_699_999_000_000, 1, "benchmark", 1_700_000_000_000]];
  rows.classificationRuntime = [["class-contract", 1_700_000_000_000, null, "ontology", "provider", "model", "v1", "validator", "resolver"]];
  rows.runtimeCounts = [[8, 7, 6, 5, 4, 3, 2, 1, 1, 0, 0, 0]];
  rows.relations = [["capture", 28, "normal", 1, 27, 0, 0, 0, "public: capture identity"]];

  const calls = [];
  const bundle = await buildExplorerBundle(async (input) => {
    const name = Object.entries(EXPLORER_QUERIES).find(([, spec]) => spec.script === input.script)?.[0];
    assert.ok(name);
    calls.push({ name, expectedGeneration: input.expectedGeneration });
    return response(EXPLORER_QUERIES[name].headers, rows[name]);
  });

  assert.equal(calls[0].name, "captures");
  assert.equal(calls[0].expectedGeneration, undefined);
  assert.ok(calls.slice(1).every((call) => call.expectedGeneration === 77));
  assert.deepEqual(bundle.data.domains, [["https://example.com", 1]]);
  assert.deepEqual(bundle.data.captures[0], [
    42, "https://example.com", "/", "Example", 1_700_000_000_000,
    "https://pin.fontofweb.com/42", "desktop", "light", "default",
    "viewport", "browser", 1440, 900, 2, 1440, 900, "captures/42.png",
    "image/png", 1440, 900, "capture-v1", 3,
  ]);
  assert.deepEqual(bundle.data.terms, {
    "page.home": ["Home", "A home page", "page_role"],
  });
  assert.deepEqual(bundle.data.color_roles[0], [42, "text_primary", 17, 17, 17, 1_000_000, 2, 1]);
  assert.deepEqual(bundle.data.assignments[0], [42, "page.home", 0.95, "capture", "automatic"]);
  assert.equal(bundle.data.runtime_counts.borders, 8);
  assert.equal(bundle.data.motion_assets[0][1], "https://pin.fontofweb.com/42.webm");
  assert.equal(bundle.data.embedded_video_captures[0].id, 42);
  assert.deepEqual(bundle.legacyColors[42], [0x111111, 0xffffff]);
  assert.equal(bundle.fontSources[42][0].family, "Example Sans");
  assert.equal(bundle.gradients[42][0].kind, "linear");
  assert.equal(bundle.relations[0].scope, "public");
});

test("refuses a truncated or generation-mismatched projection", async () => {
  let calls = 0;
  await assert.rejects(
    buildExplorerBundle(async (input) => {
      calls += 1;
      if (calls === 1) return response(EXPLORER_QUERIES.captures.headers, []);
      return {
        ...response(
          Object.values(EXPLORER_QUERIES).find((spec) => spec.script === input.script).headers,
          [],
        ),
        observedGeneration: 78,
      };
    }),
    /incomplete or invalid/,
  );
});

test("continues keyset pagination when a page exactly fills the script limit", async () => {
  const captureRows = Array.from({ length: 2_000 }, (_, index) => [
    index + 1, "https://example.com", "/", `Capture ${index + 1}`, index + 1,
    "desktop", "light", "default",
  ]);
  let captureCalls = 0;
  const bundle = await buildExplorerBundle(async (input) => {
    const name = Object.entries(EXPLORER_QUERIES).find(([, spec]) => spec.script === input.script)?.[0];
    assert.ok(name);
    if (name === "captures") {
      captureCalls += 1;
      assert.equal(input.parameters.after_capture_id, captureCalls === 1 ? -1 : 2_000);
      return response(EXPLORER_QUERIES.captures.headers, captureCalls === 1 ? captureRows : []);
    }
    return response(EXPLORER_QUERIES[name].headers, []);
  });

  assert.equal(captureCalls, 2);
  assert.equal(bundle.data.captures.length, 2_000);
});

function response(headers, rows) {
  return {
    observedGeneration: 77,
    returnedRows: rows.length,
    truncated: false,
    result: { headers, rows },
  };
}
