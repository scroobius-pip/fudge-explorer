import assert from "node:assert/strict";
import { gzipSync } from "node:zlib";
import test from "node:test";
import {
  SEARCH_SUGGESTION_METRICS,
  SEARCH_SUGGESTION_MODEL,
  SEARCH_SUGGESTION_SOURCE_COUNT,
  SEARCH_SUGGESTION_WEIGHTS,
} from "./src/lib/fudge/search-suggestions.model.ts";
import {
  suggestSearchQueries,
  withSearchSuggestions,
} from "./src/lib/fudge/search-suggestions.ts";

const titles = (query) =>
  suggestSearchQueries(query).map((suggestion) => suggestion.title);

test("keeps the learned offline ranker tiny and validated", () => {
  assert.equal(SEARCH_SUGGESTION_SOURCE_COUNT, 348_416);
  assert.equal(SEARCH_SUGGESTION_MODEL.length, 16_384);
  assert.equal(SEARCH_SUGGESTION_WEIGHTS.length, 11);
  assert.ok(gzipSync(SEARCH_SUGGESTION_MODEL.join("\n")).length < 80_000);
  assert.ok(SEARCH_SUGGESTION_METRICS.recallAt5 >= 0.95);
  assert.ok(SEARCH_SUGGESTION_METRICS.mrrAt5 >= 0.9);
  assert.ok(SEARCH_SUGGESTION_METRICS.p95LatencyMs < 2);
});

test("ranks design-search prefixes from the learned vocabulary", () => {
  assert.ok(titles("land").includes("landing page ui"));
  assert.deepEqual(titles("onb").slice(0, 3), [
    "onboarding app",
    "onboarding ui",
    "onboarding web",
  ]);
  assert.equal(titles("landing sa")[0], "landing page saas");
  assert.equal(titles("dark da")[0], "dark mode dashboard");
});

test("recovers transposed and missing characters without generating phrases", () => {
  assert.equal(titles("onbaording")[0], "onboarding ui");
  assert.equal(titles("dahs card")[0], "dashboard cards");
  assert.equal(titles("prcing")[0], "pricing ui");
  assert.equal(titles("zzzz").length, 0);
  assert.equal(titles("x").length, 0);
});

test("gives corpus filters priority and limits learned suggestions", () => {
  const corpusGroups = [
    {
      label: "Captures",
      items: [{ kind: "capture", id: "1", title: "Portfolio", sub: "test.dev" }],
    },
    {
      label: "Fonts",
      items: [{ kind: "font", id: "Inter", title: "Inter", sub: "3 captures" }],
    },
  ];
  const groups = withSearchSuggestions("port", corpusGroups);
  assert.equal(groups[0], corpusGroups[1]);
  assert.equal(groups[1].label, "Suggestions");
  assert.equal(groups[1].items.length, 2);
  assert.equal(groups[1].items[0].id, "portfolio design");
  assert.equal(groups[2], corpusGroups[0]);
});

test("uses more suggestion slots only when no corpus filters compete", () => {
  const captures = [
    {
      label: "Captures",
      items: [{ kind: "capture", id: "1", title: "Dashboard", sub: "test.dev" }],
    },
  ];
  assert.equal(withSearchSuggestions("onb", captures)[0].items.length, 4);
  assert.equal(withSearchSuggestions("onb", [])[0].items.length, 6);
  assert.equal(withSearchSuggestions("on", [])[0].items.length, 2);
});
