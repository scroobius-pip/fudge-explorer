import assert from "node:assert/strict";
import test from "node:test";
import { searchCatalogSnapshot } from "./src/lib/fudge/corpus-search.ts";

const catalog = {
  generation: 1,
  ontologyId: "test",
  captures: [
    {
      id: 1,
      title: "Authentication dashboard",
      capturedAt: 1,
      origin: "https://example.com",
      path: "/login",
      device: "desktop",
      theme: "light",
      state: null,
      viewportWidth: 1440,
      viewportHeight: 900,
      imageWidth: 1440,
      imageHeight: 900,
      image: "https://pin.fontofweb.com/1",
      pageUrl: "https://example.com/login",
      kind: "primary",
    },
  ],
  mainCaptureIds: [1],
  pivotIds: [1],
  facets: [
    {
      id: "page_role",
      label: "Page Role",
      cardinality: "many",
      definition: "",
      group: "purpose",
      terms: [
        {
          id: "page.account.authentication",
          label: "Authentication",
          parent: null,
          status: "active",
        },
      ],
    },
  ],
  assignments: {
    1: [{ term: "page.account.authentication", confidence: 0.95 }],
  },
  termCaptureIds: { "page.account.authentication": [1] },
  fontCaptureIndex: {
    inter: { name: "Inter", ids: [1], catalogIds: [109] },
  },
  domainCaptureIds: { "https://example.com": [1] },
  searchTextByCapture: {
    1: "authentication dashboard example.com login inter",
  },
  palettes: {},
  colorRoles: {},
  fonts: {},
  historicalFonts: {},
  fontCatalogIds: { inter: [109] },
  fontMetadata: {},
  typeRoles: {},
  textStyles: {},
  motion: {},
  pageVideo: {},
  embeddingNeighbors: {},
  fontSimilarity: {},
};

test("searches captures and filter indexes inside the corpus worker snapshot", () => {
  const groups = searchCatalogSnapshot(catalog, "authentication");
  assert.equal(groups[0].label, "Terms");
  assert.equal(groups[0].items[0].id, "page.account.authentication");
  assert.equal(
    groups.find((group) => group.label === "Captures")?.items[0].id,
    "1",
  );
});

test("searches prebuilt font and domain indexes", () => {
  assert.equal(
    searchCatalogSnapshot(catalog, "inter")[0].items[0].kind,
    "font",
  );
  assert.equal(
    searchCatalogSnapshot(catalog, "example").find(
      (group) => group.label === "Domains",
    )?.items[0].kind,
    "domain",
  );
});
