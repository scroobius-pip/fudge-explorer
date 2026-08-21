import assert from "node:assert/strict";
import test from "node:test";

import worker from "./worker.js";

test("serves non-query routes through the asset binding", async () => {
  const response = await worker.fetch(new Request("https://proxy.test/"), {
    ASSETS: { fetch: async () => new Response("explorer", { status: 200 }) },
  });

  assert.equal(response.status, 200);
  assert.equal(await response.text(), "explorer");
});

test("proxies capture media through the Explorer origin", async (t) => {
  let upstreamUrl;
  t.mock.method(globalThis, "fetch", async (request) => {
    upstreamUrl = String(request);
    return new Response("image-bytes", {
      status: 200,
      headers: { "content-type": "image/jpeg" },
    });
  });

  const response = await worker.fetch(
    new Request("https://proxy.test/v1/media/11116"),
    {},
  );

  assert.equal(upstreamUrl, "https://pin.fontofweb.com/11116");
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("content-type"), "image/jpeg");
  assert.match(response.headers.get("cache-control"), /max-age=86400/);
  assert.equal(await response.text(), "image-bytes");
});

test("forwards a bounded query through the private Fudge service", async () => {
  let forwarded;
  const env = {
    FUDGE_SERVICE: {
      async fetch(request) {
        forwarded = {
          url: request.url,
          method: request.method,
          body: await request.json(),
        };
        return Response.json({
          id: 1,
          observedGeneration: 77,
          result: { headers: ["id"], rows: [[42]] },
          returnedRows: 1,
          truncated: false,
          contractVersion: "mnestic-query-v1",
        });
      },
    },
  };
  const response = await worker.fetch(
    queryRequest({
      contractVersion: "mnestic-query-v1",
      script: "?[id] := *capture{id}",
      parameters: { capture_id: 42 },
      expectedGeneration: 77,
      limits: { maxRows: 12, maxBytes: 16_384 },
    }),
    env,
  );

  assert.equal(response.status, 200);
  assert.deepEqual(forwarded, {
    url: "https://fudge.internal/v1/internal/corpus/query",
    method: "POST",
    body: {
      script: "?[id] := *capture{id}",
      parameters: { capture_id: 42 },
      expectedGeneration: 77,
      maxRows: 12,
      maxBytes: 16_384,
    },
  });
  assert.deepEqual(await response.json(), {
    id: 1,
    observedGeneration: 77,
    result: { headers: ["id"], rows: [[42]] },
    returnedRows: 1,
    truncated: false,
    contractVersion: "mnestic-query-v1",
  });
});

test("applies safe defaults without changing the script", async () => {
  let forwardedBody;
  const env = {
    FUDGE_SERVICE: {
      async fetch(request) {
        forwardedBody = await request.json();
        return Response.json({ ok: true });
      },
    },
  };
  const script = "?[origin] := *domain{origin}";
  const response = await worker.fetch(queryRequest({ script }), env);

  assert.equal(response.status, 200);
  assert.deepEqual(forwardedBody, {
    script,
    parameters: {},
    maxRows: 2_000,
    maxBytes: 512 * 1024,
  });
});

test("rejects malformed and over-bounded requests before the service binding", async () => {
  let calls = 0;
  const env = {
    FUDGE_SERVICE: {
      fetch: async () => {
        calls += 1;
      },
    },
  };
  const cases = [
    [{}, 400, "invalid_query"],
    [{ script: "?[id] := *capture{id}", parameters: [] }, 400, "invalid_query"],
    [
      { script: "?[id] := *capture{id}", limits: { maxRows: 2_001 } },
      400,
      "invalid_limits",
    ],
    [{ script: "?[id] := *capture{id}", extra: true }, 400, "invalid_query"],
    [
      { contractVersion: "mnestic-query-v2", script: "?[id] := *capture{id}" },
      400,
      "unsupported_contract",
    ],
  ];

  for (const [body, status, error] of cases) {
    const response = await worker.fetch(queryRequest(body), env);
    assert.equal(response.status, status);
    assert.deepEqual(await response.json(), { error });
  }
  assert.equal(calls, 0);
});

test("fails closed when the private service binding is absent", async () => {
  const response = await worker.fetch(
    queryRequest({
      script: "?[id] := *capture{id}",
    }),
    {},
  );

  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), {
    error: "corpus_service_unavailable",
  });
});

test("only enables CORS for the configured Explorer origin", async () => {
  const env = {};
  const response = await worker.fetch(
    new Request("https://proxy.test/v1/query", {
      method: "OPTIONS",
      headers: { origin: "https://proxy.test" },
    }),
    env,
  );
  const rejected = await worker.fetch(
    new Request("https://proxy.test/v1/query", {
      method: "OPTIONS",
      headers: { origin: "https://attacker.example" },
    }),
    env,
  );

  assert.equal(response.status, 204);
  assert.equal(
    response.headers.get("access-control-allow-origin"),
    "https://proxy.test",
  );
  assert.equal(rejected.status, 403);
  assert.equal(rejected.headers.get("access-control-allow-origin"), null);
});

test("serves a materialized Explorer bundle from GET /v1/query", async () => {
  const { EXPLORER_QUERIES } = await import("./explorer-bundle.js");
  const serviceCalls = [];
  const env = {
    FUDGE_SERVICE: {
      async fetch(request) {
        const body = await request.json();
        if (body.script.includes("count(capture_id)")) {
          serviceCalls.push(body);
          return Response.json({
            observedGeneration: 77,
            returnedRows: 1,
            truncated: false,
            result: { headers: ["count(capture_id)"], rows: [[0]] },
          });
        }
        const spec = Object.values(EXPLORER_QUERIES).find(
          (candidate) => candidate.script === body.script,
        );
        assert.ok(spec);
        serviceCalls.push(body);
        return Response.json({
          observedGeneration: 77,
          returnedRows: 0,
          truncated: false,
          result: { headers: spec.headers, rows: [] },
        });
      },
    },
  };
  const response = await worker.fetch(
    new Request("https://proxy.test/v1/query", {
      method: "GET",
      headers: {
        origin: "https://proxy.test",
      },
    }),
    env,
  );
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(
    response.headers.get("access-control-allow-origin"),
    "https://proxy.test",
  );
  assert.equal(response.headers.get("x-fudge-corpus-generation"), "77");
  assert.equal(serviceCalls[0].expectedGeneration, undefined);
  assert.ok(
    serviceCalls.every((call) => call.expectedGeneration === undefined),
  );
  assert.deepEqual(body.data.captures, []);
  assert.deepEqual(body.data.terms, {});
  assert.deepEqual(body.relations, []);
});

test("serves unfenced bootstrap and detail phases", async () => {
  const {
    EXPLORER_BOOTSTRAP_QUERY_NAMES,
    EXPLORER_DEFERRED_QUERY_NAMES,
    EXPLORER_QUERIES,
  } = await import("./explorer-bundle.js");
  const calls = [];
  const env = serviceEnv(async (request) => {
    const body = await request.json();
    if (body.script.includes("count(capture_id)")) {
      calls.push({
        name: "captureCount",
        expectedGeneration: body.expectedGeneration,
      });
      return queryResponse(["count(capture_id)"], [[0]]);
    }
    const name = Object.entries(EXPLORER_QUERIES).find(
      ([, spec]) => spec.script === body.script,
    )?.[0];
    assert.ok(name);
    calls.push({ name, expectedGeneration: body.expectedGeneration });
    return queryResponse(EXPLORER_QUERIES[name].headers, []);
  });

  const bootstrapResponse = await worker.fetch(
    new Request("https://phase-proxy.test/v1/query?phase=bootstrap"),
    env,
  );
  const bootstrap = await bootstrapResponse.json();
  assert.equal(bootstrapResponse.status, 200);
  assert.ok(
    Number(bootstrapResponse.headers.get("x-uncompressed-content-length")) > 0,
  );
  assert.deepEqual(
    calls.map((call) => call.name).sort(),
    ["captureCount", ...EXPLORER_BOOTSTRAP_QUERY_NAMES].sort(),
  );
  assert.equal(
    calls.find((call) => call.name === "captureCount").expectedGeneration,
    undefined,
  );
  assert.deepEqual(bootstrap.data.text_styles, []);

  calls.length = 0;
  const detailsResponse = await worker.fetch(
    new Request(
      "https://phase-proxy.test/v1/query?phase=details&generation=77",
    ),
    env,
  );
  const details = await detailsResponse.json();
  assert.equal(detailsResponse.status, 200);
  assert.deepEqual(
    calls.map((call) => call.name).sort(),
    [...EXPLORER_DEFERRED_QUERY_NAMES].sort(),
  );
  assert.ok(calls.every((call) => call.expectedGeneration === undefined));
  assert.equal(details.data.observed_generation, 77);
});

test("streams real bootstrap work before the exact bundle bytes", async () => {
  const { EXPLORER_QUERIES } = await import("./explorer-bundle.js");
  const env = serviceEnv(async (request) => {
    const body = await request.json();
    if (body.script.includes("count(capture_id)")) {
      return queryResponse(["count(capture_id)"], [[0]]);
    }
    const spec = Object.values(EXPLORER_QUERIES).find(
      (candidate) => candidate.script === body.script,
    );
    assert.ok(spec);
    return queryResponse(spec.headers, []);
  });
  const response = await worker.fetch(
    new Request("https://phase-stream.test/v1/query?phase=bootstrap", {
      headers: { accept: "application/x-fudge-explorer-stream" },
    }),
    env,
  );
  const bytes = new Uint8Array(await response.arrayBuffer());
  const newline = bytes.indexOf(10);
  assert.equal(response.status, 200);
  assert.match(
    response.headers.get("content-type"),
    /application\/x-fudge-explorer-stream/,
  );
  assert.equal(
    response.headers.get("cache-control"),
    "private, no-store, no-transform",
  );
  assert.ok(newline > 0);

  const decoder = new TextDecoder();
  let offset = 0;
  const events = [];
  let bundleEvent;
  while (!bundleEvent) {
    const end = bytes.indexOf(10, offset);
    assert.ok(end >= 0);
    const event = JSON.parse(decoder.decode(bytes.slice(offset, end)));
    events.push(event);
    offset = end + 1;
    if (event.type === "bundle") bundleEvent = event;
  }
  const payloadBytes = bytes.slice(offset);
  assert.ok(events.some((event) => event.type === "progress"));
  assert.equal(
    events.filter((event) => event.type === "progress").at(-1).completed,
    events.filter((event) => event.type === "progress").at(-1).total,
  );
  assert.equal(bundleEvent.bytes, payloadBytes.byteLength);
  assert.deepEqual(JSON.parse(decoder.decode(payloadBytes)).data.captures, []);
});

test("serves details even when the catalogue generation is stale", async () => {
  const { EXPLORER_QUERIES } = await import("./explorer-bundle.js");
  let calls = 0;
  const env = serviceEnv(async (request) => {
    const body = await request.json();
    calls += 1;
    if (body.script.includes("count(capture_id)")) {
      return queryResponse(["count(capture_id)"], [[0]]);
    }
    const spec = Object.values(EXPLORER_QUERIES).find(
      (candidate) => candidate.script === body.script,
    );
    return queryResponse(spec.headers, []);
  });
  const stale = await worker.fetch(
    new Request(
      "https://phase-rotation.test/v1/query?phase=details&generation=999",
    ),
    env,
  );
  assert.equal(stale.status, 200);
  assert.ok(calls > 0);
});

test("rejects malformed Explorer phase requests before querying", async () => {
  let calls = 0;
  const env = serviceEnv(async () => {
    calls += 1;
  });
  const urls = [
    "https://phase-invalid.test/v1/query?phase=unknown",
    "https://phase-invalid.test/v1/query?phase=bootstrap&generation=77",
    "https://phase-invalid.test/v1/query?phase=details",
    "https://phase-invalid.test/v1/query?phase=details&generation=0",
  ];
  for (const url of urls) {
    const response = await worker.fetch(new Request(url), env);
    assert.equal(response.status, 400);
    assert.deepEqual(await response.json(), {
      error: "invalid_explorer_phase",
    });
  }
  assert.equal(calls, 0);
});

test("serves exact-ID font similarity through a bounded route", async () => {
  let forwarded;
  const env = serviceEnv(async (request) => {
    forwarded = await request.json();
    return queryResponse(
      [
        "rank",
        "target_family_id",
        "target_family_name",
        "family_id",
        "family_name",
        "content_sha256",
        "face_index",
        "variation_coordinates",
        "visual_distance",
        "metric_distance",
        "common_glyphs",
        "monospace_mismatch",
        "italic_mismatch",
      ],
      [
        [
          1,
          109,
          "Inter",
          1692,
          "Open Runde",
          bytes(32),
          0,
          bytes(0),
          0.003,
          0.0013,
          88,
          false,
          false,
        ],
      ],
    );
  });

  const response = await worker.fetch(
    new Request(
      "https://proxy.test/v1/similar-fonts?familyId=109&generation=77&limit=6",
    ),
    env,
  );
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.match(forwarded.script, /selected = \$family_id/);
  assert.equal(forwarded.parameters.family_id, 109);
  assert.equal(forwarded.parameters.result_limit, 6);
  assert.equal(forwarded.expectedGeneration, undefined);
  assert.equal(forwarded.maxRows, 6);
  assert.deepEqual(body.target, {
    familyId: 109,
    familyName: "Inter",
    previewUrl:
      "https://api.withfudge.com/v1/font-previews/109?sample=Hamburgefontsiv+0123456789&width=768",
  });
  assert.deepEqual(body.results[0], {
    rank: 1,
    familyId: 1692,
    familyName: "Open Runde",
    candidateIdentity: {
      contentSha256: "AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8",
      faceIndex: 0,
      variationCoordinates: "",
    },
    previewUrl:
      "https://api.withfudge.com/v1/font-previews/1692?contentSha256=AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8&faceIndex=0&variationCoordinates=&sample=Hamburgefontsiv+0123456789&width=768",
    visualDistance: 0.003,
    metricDistance: 0.0013,
    commonGlyphs: 88,
    monospaceMismatch: false,
    italicMismatch: false,
  });
});

test("fails closed when font similarity omits an exact preview identity", async () => {
  const env = serviceEnv(async () =>
    queryResponse(
      [
        "rank",
        "target_family_id",
        "target_family_name",
        "family_id",
        "family_name",
        "content_sha256",
        "face_index",
        "variation_coordinates",
        "visual_distance",
        "metric_distance",
        "common_glyphs",
        "monospace_mismatch",
        "italic_mismatch",
      ],
      [
        [
          1,
          109,
          "Inter",
          1692,
          "Open Runde",
          bytes(31),
          0,
          bytes(0),
          0.003,
          0.0013,
          88,
          false,
          false,
        ],
      ],
    ),
  );
  const response = await worker.fetch(
    new Request(
      "https://proxy.test/v1/similar-fonts?familyId=109&generation=77",
    ),
    env,
  );

  assert.equal(response.status, 502);
  assert.equal((await response.json()).error, "similarity_query_failed");
});

test("serves a retained unresolved captured font as a searchable entity", async () => {
  const requests = [];
  const env = serviceEnv(async (request) => {
    const body = await request.json();
    requests.push(body);
    if (requests.length === 1) {
      return queryResponse(
        [
          "capture_id",
          "observation_index",
          "declared_family",
          "computed_css_stack",
          "acquisition_index",
          "state",
          "failure_code",
        ],
        [
          [
            11201,
            0,
            "GeistSans",
            "GeistSans, GeistSans Fallback, Sans-serif",
            0,
            "searchable",
            "",
          ],
        ],
      );
    }
    return queryResponse(
      [
        "acquisition_index",
        "content_sha256",
        "face_index",
        "variation_coordinates",
        "descriptor_schema_id",
        "metadata_family",
        "metadata_subfamily",
        "typographic_family",
        "full_name",
        "postscript_name",
        "vendor_name",
        "version_string",
        "axis_count",
        "resolution_state",
        "logical_face_id",
        "canonical_family_id",
        "canonical_family_name",
      ],
      [
        [
          0,
          bytes(32),
          0,
          bytes(0),
          "swash-coverage-aware-glyph-hog-rank-blend-v2-experimental",
          "Geist",
          "Regular",
          null,
          "Geist Regular",
          "Geist-Regular",
          "Vercel",
          "Version 1.800",
          1,
          "unresolved",
          null,
          null,
          null,
        ],
      ],
    );
  });

  const response = await worker.fetch(
    new Request(
      "https://proxy.test/v1/captured-font?captureId=11201&observationIndex=0&generation=77",
    ),
    env,
  );
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(requests.length, 2);
  assert.deepEqual(requests[0].parameters, {
    capture_id: 11201,
    observation_index: 0,
  });
  assert.equal(requests[0].expectedGeneration, undefined);
  assert.equal(requests[1].expectedGeneration, undefined);
  assert.match(requests[1].script, /primary_font_face_metadata_observation/);
  assert.match(requests[1].script, /acquired_face\[max\(acquisition_index\)/);
  assert.equal(body.pipeline.state, "searchable");
  assert.equal(body.observation.declaredFamily, "GeistSans");
  assert.equal(
    body.previewUrl,
    "https://api.withfudge.com/v1/font-previews/captures/11201/observations/0?sample=Hamburgefontsiv+0123456789&width=768",
  );
  assert.equal(body.faces[0].metadata.family, "Geist");
  assert.equal(body.faces[0].metadata.version, "Version 1.800");
  assert.deepEqual(body.faces[0].resolution, {
    state: "unresolved",
    logicalFaceId: null,
    familyId: null,
    familyName: null,
  });
});

test("serves visual candidates for an unresolved captured font", async () => {
  let forwarded;
  const env = serviceEnv(async (request) => {
    forwarded = await request.json();
    return queryResponse(
      [
        "rank",
        "target_family",
        "family_id",
        "family_name",
        "content_sha256",
        "face_index",
        "variation_coordinates",
        "visual_distance",
        "metric_distance",
        "common_glyphs",
        "monospace_mismatch",
        "italic_mismatch",
      ],
      [
        [
          1,
          "GeistSans",
          135,
          "Geist",
          bytes(32),
          0,
          bytes(0),
          0.00039,
          0.00011,
          88,
          false,
          false,
        ],
      ],
    );
  });
  const response = await worker.fetch(
    new Request(
      "https://proxy.test/v1/similar-captured-fonts?captureId=11201&observationIndex=0&generation=77&limit=8",
    ),
    env,
  );
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(forwarded.parameters.capture_id, 11201);
  assert.equal(forwarded.parameters.observation_index, 0);
  assert.equal(forwarded.parameters.result_limit, 8);
  assert.equal(forwarded.expectedGeneration, undefined);
  assert.equal(body.target.familyName, "GeistSans");
  assert.equal(body.results[0].familyId, 135);
  assert.equal(body.results[0].familyName, "Geist");
  assert.deepEqual(body.results[0].candidateIdentity, {
    contentSha256: "AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8",
    faceIndex: 0,
    variationCoordinates: "",
  });
});

test("returns retained face metadata before a visual descriptor is ready", async () => {
  let calls = 0;
  const env = serviceEnv(async () => {
    calls += 1;
    if (calls === 1) {
      return queryResponse(
        [
          "capture_id",
          "observation_index",
          "declared_family",
          "computed_css_stack",
          "acquisition_index",
          "state",
          "failure_code",
        ],
        [
          [
            11187,
            1,
            "Albert Sans Variable",
            "Albert Sans Variable, sans-serif",
            1,
            "acquired_without_active_descriptor",
            "",
          ],
        ],
      );
    }
    return queryResponse(
      [
        "acquisition_index",
        "content_sha256",
        "face_index",
        "variation_coordinates",
        "descriptor_schema_id",
        "metadata_family",
        "metadata_subfamily",
        "typographic_family",
        "full_name",
        "postscript_name",
        "vendor_name",
        "version_string",
        "axis_count",
        "resolution_state",
        "logical_face_id",
        "canonical_family_id",
        "canonical_family_name",
      ],
      [
        [
          1,
          bytes(32),
          0,
          bytes(0),
          null,
          "Albert Sans",
          "Regular",
          null,
          "Albert Sans Regular",
          "AlbertSans-Regular",
          null,
          "Version 1",
          1,
          "unresolved",
          null,
          null,
          null,
        ],
      ],
    );
  });
  const response = await worker.fetch(
    new Request(
      "https://proxy.test/v1/captured-font?captureId=11187&observationIndex=1&generation=77",
    ),
    env,
  );
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(calls, 2);
  assert.equal(body.pipeline.state, "acquired_without_active_descriptor");
  assert.equal(body.faces[0].descriptorSchemaId, null);
  assert.equal(body.faces[0].metadata.family, "Albert Sans");
  assert.match(body.previewUrl, /\/captures\/11187\/observations\/1/);
});

test("serves explicit face-linked usage evidence for a catalogue family", async () => {
  let forwarded;
  const env = serviceEnv(async (request) => {
    forwarded = await request.json();
    return queryResponse(
      ["capture_id", "observation_index", "declared_family", "usage_evidence"],
      [[11116, 0, "GeistSans", "confirmed_captured_face"]],
    );
  });
  const response = await worker.fetch(
    new Request(
      "https://proxy.test/v1/family-font-usage?familyId=135&generation=77&limit=200",
    ),
    env,
  );

  assert.equal(response.status, 200);
  assert.match(forwarded.script, /state: 'confirmed'/);
  assert.match(forwarded.script, /primary_font_similarity_attempt/);
  assert.match(forwarded.script, /capture_historical_font_attribution/);
  assert.deepEqual((await response.json()).results, [
    {
      captureId: 11116,
      observationIndex: 0,
      declaredFamily: "GeistSans",
      usageEvidence: "confirmed_captured_face",
    },
  ]);
});

test("rejects malformed captured font requests before querying", async () => {
  let calls = 0;
  const env = serviceEnv(async () => {
    calls += 1;
  });
  const urls = [
    "https://proxy.test/v1/captured-font?captureId=11201&observationIndex=-1&generation=77",
    "https://proxy.test/v1/captured-font?captureId=0&observationIndex=0&generation=77",
    "https://proxy.test/v1/similar-captured-fonts?captureId=11201&observationIndex=0&generation=0",
    "https://proxy.test/v1/family-font-usage?familyId=Geist&generation=77",
  ];
  for (const url of urls) {
    const response = await worker.fetch(new Request(url), env);
    assert.equal(response.status, 400);
  }
  assert.equal(calls, 0);
});

test("does not require the private observation-locator relation for captured font status", async () => {
  const env = serviceEnv(async (request) => {
    const body = await request.json();
    assert.doesNotMatch(body.script, /primary_pin_font_observation_locator/);
    assert.match(
      body.script,
      /not has_source\[declared_family, computed_css_stack\]/,
    );
    return queryResponse(
      [
        "capture_id",
        "observation_index",
        "declared_family",
        "computed_css_stack",
        "acquisition_index",
        "state",
        "failure_code",
      ],
      [
        [
          11202,
          0,
          "Page Sans",
          "Page Sans, sans-serif",
          null,
          "source_not_acquired",
          "",
        ],
      ],
    );
  });
  const response = await worker.fetch(
    new Request(
      "https://proxy.test/v1/captured-font?captureId=11202&observationIndex=0&generation=77",
    ),
    env,
  );

  assert.equal(response.status, 200);
  assert.equal((await response.json()).pipeline.state, "source_not_acquired");
});

test("serves Almendra's verified pinned regular face through a bounded route", async () => {
  let forwarded;
  const env = serviceEnv(async (request) => {
    forwarded = await request.json();
    return queryResponse(
      [
        "source_adapter_id",
        "upstream_release_id",
        "upstream_revision",
        "authoritative_url",
        "release_recorded_at",
        "upstream_path",
        "content_sha256",
        "byte_length",
        "face_index",
        "variation_coordinates",
        "weight_class",
        "width_class",
        "slant",
        "trait_observed_at",
      ],
      [
        [
          "google-fonts-v1",
          "ofl/almendra",
          "00e726a90e0b9698971c37b88c35ef958965448b",
          "https://github.com/google/fonts/tree/00e726a90e0b9698971c37b88c35ef958965448b/ofl/almendra",
          1_784_774_066,
          "ofl/almendra/Almendra-Regular.ttf",
          {
            $type: "bytes",
            base64: "sSemEhIJNTtT2pznO/nTUPdBkNg4TCjt4Xnk+5RA+UY=",
          },
          68_684,
          0,
          bytes(0),
          400,
          5,
          "upright",
          1_785_155_155,
        ],
      ],
    );
  });
  const response = await worker.fetch(
    new Request(
      "https://proxy.test/v1/family-font-source?familyId=2780&generation=77",
    ),
    env,
  );
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(forwarded.parameters.family_id, 2780);
  assert.deepEqual(forwarded.parameters.default_coordinates, bytes(0));
  assert.equal(forwarded.expectedGeneration, undefined);
  assert.equal(forwarded.maxRows, 1);
  assert.match(forwarded.script, /source_adapter_id: 'google-fonts-v1'/);
  assert.match(forwarded.script, /weight - 400/);
  assert.deepEqual(body.source, {
    sourceAdapterId: "google-fonts-v1",
    upstreamReleaseId: "ofl/almendra",
    upstreamRevision: "00e726a90e0b9698971c37b88c35ef958965448b",
    authoritativeUrl:
      "https://github.com/google/fonts/tree/00e726a90e0b9698971c37b88c35ef958965448b/ofl/almendra",
    upstreamPath: "ofl/almendra/Almendra-Regular.ttf",
    contentSha256: "sSemEhIJNTtT2pznO_nTUPdBkNg4TCjt4Xnk-5RA-UY",
    byteLength: 68_684,
    faceIndex: 0,
    variationCoordinates: "",
    weightClass: 400,
    widthClass: 5,
    slant: "upright",
    fontUrl:
      "https://raw.githubusercontent.com/google/fonts/00e726a90e0b9698971c37b88c35ef958965448b/ofl/almendra/Almendra-Regular.ttf",
    format: "truetype",
  });
});

test("returns no fallback when a family has no verified Google Fonts release", async () => {
  const env = serviceEnv(async () =>
    queryResponse(
      [
        "source_adapter_id",
        "upstream_release_id",
        "upstream_revision",
        "authoritative_url",
        "release_recorded_at",
        "upstream_path",
        "content_sha256",
        "byte_length",
        "face_index",
        "variation_coordinates",
        "weight_class",
        "width_class",
        "slant",
        "trait_observed_at",
      ],
      [],
    ),
  );
  const response = await worker.fetch(
    new Request(
      "https://proxy.test/v1/family-font-source?familyId=1&generation=77",
    ),
    env,
  );

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    observedGeneration: 77,
    familyId: 1,
    source: null,
  });
});

test("fails closed on malformed family font source provenance", async () => {
  const env = serviceEnv(async () =>
    queryResponse(
      [
        "source_adapter_id",
        "upstream_release_id",
        "upstream_revision",
        "authoritative_url",
        "release_recorded_at",
        "upstream_path",
        "content_sha256",
        "byte_length",
        "face_index",
        "variation_coordinates",
        "weight_class",
        "width_class",
        "slant",
        "trait_observed_at",
      ],
      [
        [
          "google-fonts-v1",
          "ofl/almendra",
          "00e726a90e0b9698971c37b88c35ef958965448b",
          "https://attacker.example/google/fonts",
          1,
          "ofl/almendra/Almendra-Regular.ttf",
          bytes(32),
          68_684,
          0,
          bytes(0),
          400,
          5,
          "upright",
          2,
        ],
      ],
    ),
  );
  const response = await worker.fetch(
    new Request(
      "https://proxy.test/v1/family-font-source?familyId=2780&generation=77",
    ),
    env,
  );

  assert.equal(response.status, 502);
  assert.equal(
    (await response.json()).error,
    "family_font_source_query_failed",
  );
});

test("serves capture neighbors from the current active index", async () => {
  const requests = [];
  const query = { $type: "vector", scalarType: "f32", values: [0.25, -0.5] };
  const env = serviceEnv(async (request) => {
    const body = await request.json();
    requests.push(body);
    if (requests.length === 1) {
      return queryResponse(
        [
          "retrieval_generation",
          "index_name",
          "model_id",
          "dimensions",
          "distance",
          "normalization",
          "media_asset_index",
          "embedding",
        ],
        [
          [
            "capture-v1",
            "semantic_generation_index",
            "model",
            2,
            "cosine",
            "l2",
            0,
            query,
          ],
        ],
      );
    }
    return queryResponse(
      ["capture_id", "distance", "title", "origin", "path", "captured_at"],
      [[42, 0.125, "Example", "https://example.com", "/", 1_700_000_000_000]],
    );
  });

  const response = await worker.fetch(
    new Request(
      "https://proxy.test/v1/similar-captures?captureId=9367&generation=77&limit=12",
    ),
    env,
  );
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(requests.length, 2);
  assert.equal(requests[0].parameters.capture_id, 9367);
  assert.equal(requests[0].expectedGeneration, undefined);
  assert.match(
    requests[1].script,
    /~capture_embedding:semantic_generation_index/,
  );
  assert.equal(requests[1].expectedGeneration, undefined);
  assert.deepEqual(requests[1].parameters, { capture_id: 9367, query });
  assert.deepEqual(body.results[0], {
    rank: 1,
    captureId: 42,
    distance: 0.125,
    title: "Example",
    origin: "https://example.com",
    path: "/",
    capturedAt: 1_700_000_000_000,
    screenshotUrl: "https://pin.fontofweb.com/42",
  });
});

test("rejects malformed similarity requests before querying", async () => {
  let calls = 0;
  const env = serviceEnv(async () => {
    calls += 1;
  });
  const requests = [
    "https://proxy.test/v1/similar-fonts?familyId=Inter&generation=77",
    "https://proxy.test/v1/similar-captures?captureId=1&generation=0",
    "https://proxy.test/v1/similar-captures?captureId=1&generation=77&limit=25",
    "https://proxy.test/v1/similar-fonts?familyId=109&generation=77&extra=true",
  ];
  for (const url of requests) {
    const response = await worker.fetch(new Request(url), env);
    assert.equal(response.status, 400);
    assert.deepEqual(await response.json(), {
      error: "invalid_similarity_request",
    });
  }
  assert.equal(calls, 0);
});

test("rejects malformed family font source requests before querying", async () => {
  let calls = 0;
  const env = serviceEnv(async () => {
    calls += 1;
  });
  const urls = [
    "https://proxy.test/v1/family-font-source?familyId=Almendra&generation=77",
    "https://proxy.test/v1/family-font-source?familyId=2780&generation=0",
    "https://proxy.test/v1/family-font-source?familyId=2780&generation=77&url=https://attacker.example",
  ];
  for (const url of urls) {
    const response = await worker.fetch(new Request(url), env);
    assert.equal(response.status, 400);
    assert.deepEqual(await response.json(), {
      error: "invalid_font_source_request",
    });
  }
  assert.equal(calls, 0);
});

test("returns an empty result when a capture has no active embedding", async () => {
  const env = serviceEnv(async () =>
    queryResponse(
      [
        "retrieval_generation",
        "index_name",
        "model_id",
        "dimensions",
        "distance",
        "normalization",
        "media_asset_index",
        "embedding",
      ],
      [],
    ),
  );
  const response = await worker.fetch(
    new Request(
      "https://proxy.test/v1/similar-captures?captureId=1&generation=77",
    ),
    env,
  );

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    observedGeneration: 77,
    target: { captureId: 1, available: false },
    results: [],
  });
});

test("serves bounded capture effects from the current corpus", async () => {
  let forwarded;
  const env = serviceEnv(async (request) => {
    forwarded = await request.json();
    return queryResponse(
      ["kind", "identity", "values"],
      [
        ["radius", 0, [8_000, 12, "dom_computed_style"]],
        ["completeness", "radius_observation", ["complete", 1, 1, 0, null]],
      ],
    );
  });
  const response = await worker.fetch(
    new Request(
      "https://proxy.test/v1/capture-evidence?captureId=42&generation=77",
    ),
    env,
  );
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(forwarded.parameters.capture_id, 42);
  assert.equal(forwarded.expectedGeneration, undefined);
  assert.equal(body.evidence.radius[0].values[0], 8_000);
  assert.equal(body.evidence.completeness[0].identity, "radius_observation");
});

test("serves exact term support values from the current corpus", async () => {
  let forwarded;
  const headers = [
    "capture_id",
    "assignment_scope",
    "confidence",
    "resolution_kind",
    "evidence_index",
    "evidence_kind",
    "support_kind",
    "support_index",
    "values",
  ];
  const env = serviceEnv(async (request) => {
    forwarded = await request.json();
    return queryResponse(headers, [
      [
        42,
        "capture",
        0.9,
        "automatic",
        0,
        "measured_observation",
        "text_style",
        0,
        [
          null,
          "unknown",
          400,
          null,
          16_000,
          24_000,
          null,
          17,
          17,
          17,
          null,
          10,
        ],
      ],
    ]);
  });
  const response = await worker.fetch(
    new Request(
      "https://proxy.test/v1/term-values?termId=typography.role.body&generation=77",
    ),
    env,
  );
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(forwarded.parameters.term_id, "typography.role.body");
  assert.equal(forwarded.expectedGeneration, undefined);
  assert.deepEqual(body.rows[0].slice(0, 4), [42, "capture", 0.9, "automatic"]);
});

test("serves columns only for a validated relation name", async () => {
  let forwarded;
  const env = serviceEnv(async (request) => {
    forwarded = await request.json();
    return queryResponse(
      ["column", "is_key", "index", "type", "has_default", "default_expr"],
      [["id", true, 0, "Int", false, null]],
    );
  });
  const response = await worker.fetch(
    new Request(
      "https://proxy.test/v1/relation-columns?relation=capture&generation=77",
    ),
    env,
  );
  const rejected = await worker.fetch(
    new Request(
      "https://proxy.test/v1/relation-columns?relation=capture%20%3Alimit%201&generation=77",
    ),
    env,
  );

  assert.equal(response.status, 200);
  assert.equal(forwarded.script, "::columns capture");
  assert.equal(forwarded.expectedGeneration, undefined);
  assert.equal(rejected.status, 400);
});

test("restarts a current-corpus lookup after a typed generation conflict", async () => {
  let calls = 0;
  const env = serviceEnv(async () => {
    calls += 1;
    if (calls === 1) {
      return Response.json(
        { code: "corpus_generation_changed", recoverable: true },
        { status: 409 },
      );
    }
    return queryResponse(
      ["kind", "identity", "values"],
      [["radius", 0, [8_000, 12, "dom_computed_style"]]],
      { observedGeneration: 78 },
    );
  });

  const response = await worker.fetch(
    new Request(
      "https://proxy.test/v1/capture-evidence?captureId=42&generation=77",
    ),
    env,
  );

  assert.equal(response.status, 200);
  assert.equal(calls, 2);
  assert.equal((await response.json()).observedGeneration, 78);
});

test("rejects malformed evidence requests before querying", async () => {
  let calls = 0;
  const env = serviceEnv(async () => {
    calls += 1;
  });
  const urls = [
    "https://proxy.test/v1/capture-evidence?captureId=0&generation=77",
    "https://proxy.test/v1/term-values?termId=bad%20term&generation=77",
    "https://proxy.test/v1/relation-columns?relation=capture&generation=77&extra=1",
  ];
  for (const url of urls) {
    const response = await worker.fetch(new Request(url), env);
    assert.equal(response.status, 400);
  }
  assert.equal(calls, 0);
});

function queryRequest(body) {
  return new Request("https://proxy.test/v1/query", {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });
}

function serviceEnv(fetch) {
  return { FUDGE_SERVICE: { fetch } };
}

function queryResponse(headers, rows, overrides = {}) {
  return Response.json({
    observedGeneration: 77,
    returnedRows: rows.length,
    truncated: false,
    result: { headers, rows },
    ...overrides,
  });
}

function bytes(length) {
  return {
    $type: "bytes",
    base64: Buffer.from(Array.from({ length }, (_, index) => index)).toString(
      "base64",
    ),
  };
}
