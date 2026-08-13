import { buildExplorerBundle } from "./explorer-bundle.js";
import { CAPTURE_EVIDENCE_QUERY, TERM_VALUES_QUERY } from "./evidence-queries.js";
import {
  CAPTURE_SIMILARITY_TARGET_QUERY,
  FONT_SIMILARITY_QUERY,
  captureSimilarityQuery,
} from "./similarity-queries.js";

const QUERY_CONTRACT_VERSION = "mnestic-query-v1";
const QUERY_PATH = "/v1/query";
const FONT_SIMILARITY_PATH = "/v1/similar-fonts";
const CAPTURE_SIMILARITY_PATH = "/v1/similar-captures";
const CAPTURE_EVIDENCE_PATH = "/v1/capture-evidence";
const TERM_VALUES_PATH = "/v1/term-values";
const RELATION_COLUMNS_PATH = "/v1/relation-columns";
const INTERNAL_QUERY_URL = "https://fudge.internal/v1/internal/corpus/query";
const MAX_REQUEST_BYTES = 96 * 1024;
const MAX_SCRIPT_BYTES = 32 * 1024;
const MAX_ROWS = 2_000;
const MAX_BYTES = 2 * 1024 * 1024;
const encoder = new TextEncoder();
const BUNDLE_TTL_MS = 5 * 60 * 1000;
let bundleCache;
let bundleExpiresAt = 0;
let bundleLoad;

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const isApi = [
      QUERY_PATH, FONT_SIMILARITY_PATH, CAPTURE_SIMILARITY_PATH,
      CAPTURE_EVIDENCE_PATH, TERM_VALUES_PATH, RELATION_COLUMNS_PATH,
    ]
      .includes(url.pathname);

    if (url.pathname === "/health") {
      return json({ status: "ok", contractVersion: QUERY_CONTRACT_VERSION });
    }
    if (!isApi) {
      return env.ASSETS.fetch(request);
    }
    if (request.method === "OPTIONS") return preflight(request, env);
    const allowedMethods = url.pathname === QUERY_PATH ? "GET, POST, OPTIONS" : "GET, OPTIONS";
    if (
      (url.pathname === QUERY_PATH && request.method !== "GET" && request.method !== "POST")
      || (url.pathname !== QUERY_PATH && request.method !== "GET")
    ) {
      return json({ error: "method_not_allowed" }, 405, { Allow: allowedMethods }, request, env);
    }
    if (!env.FUDGE_SERVICE || typeof env.FUDGE_SERVICE.fetch !== "function") {
      return json({ error: "corpus_service_unavailable" }, 503, {}, request, env);
    }
    if (url.pathname === FONT_SIMILARITY_PATH) {
      return fontSimilarity(url, request, env);
    }
    if (url.pathname === CAPTURE_SIMILARITY_PATH) {
      return captureSimilarity(url, request, env);
    }
    if (url.pathname === CAPTURE_EVIDENCE_PATH) {
      return captureEvidence(url, request, env);
    }
    if (url.pathname === TERM_VALUES_PATH) {
      return termValues(url, request, env);
    }
    if (url.pathname === RELATION_COLUMNS_PATH) {
      return relationColumns(url, request, env);
    }
    if (request.method === "GET") {
      try {
        const bundle = await loadBundle(env);
        return json(bundle, 200, {
          "cache-control": "private, max-age=300",
          "x-fudge-corpus-generation": String(bundle.data.observed_generation),
        }, request, env);
      } catch (error) {
        return json({
          error: "explorer_bundle_failed",
          detail: error instanceof Error ? error.message : "Bundle construction failed",
        }, 502, {}, request, env);
      }
    }

    const contentLength = Number(request.headers.get("content-length"));
    if (Number.isFinite(contentLength) && contentLength > MAX_REQUEST_BYTES) {
      return json({ error: "request_too_large" }, 413, {}, request, env);
    }

    const text = await request.text();
    if (encoder.encode(text).byteLength > MAX_REQUEST_BYTES) {
      return json({ error: "request_too_large" }, 413, {}, request, env);
    }

    let body;
    try {
      body = JSON.parse(text);
    } catch {
      return json({ error: "invalid_json" }, 400, {}, request, env);
    }

    const query = validateQuery(body);
    if (query.error) return json({ error: query.error }, 400, {}, request, env);

    try {
      const response = await env.FUDGE_SERVICE.fetch(
        new Request(INTERNAL_QUERY_URL, {
          method: "POST",
          headers: {
            accept: "application/json",
            "content-type": "application/json",
          },
          body: JSON.stringify(query.value),
        }),
      );
      const headers = new Headers(response.headers);
      applyCors(headers, request, env);
      return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers,
      });
    } catch {
      return json({ error: "corpus_service_unavailable" }, 503, {}, request, env);
    }
  },
};

async function captureEvidence(url, request, env) {
  if (hasUnknownParameters(url, ["captureId", "generation"])) {
    return json({ error: "invalid_evidence_request" }, 400, {}, request, env);
  }
  const captureId = positiveQueryInteger(url.searchParams.get("captureId"));
  const generation = positiveQueryInteger(url.searchParams.get("generation"));
  if (!captureId || !generation) {
    return json({ error: "invalid_evidence_request" }, 400, {}, request, env);
  }
  try {
    const response = await queryCorpus(env, {
      script: CAPTURE_EVIDENCE_QUERY,
      parameters: { capture_id: captureId },
      expectedGeneration: generation,
      maxRows: 2_000,
      maxBytes: 1024 * 1024,
    });
    const rows = checkedRows(response, ["kind", "identity", "values"], generation);
    const evidence = {};
    for (const [kind, identity, values] of rows) {
      if (typeof kind !== "string" || !Array.isArray(values)) {
        throw new Error("Corpus capture evidence response was invalid");
      }
      (evidence[kind] ||= []).push({ identity, values });
    }
    return json({ observedGeneration: generation, captureId, evidence }, 200, {
      "cache-control": "private, max-age=300",
    }, request, env);
  } catch (error) {
    return evidenceError(error, request, env);
  }
}

async function termValues(url, request, env) {
  if (hasUnknownParameters(url, ["termId", "generation"])) {
    return json({ error: "invalid_evidence_request" }, 400, {}, request, env);
  }
  const termId = url.searchParams.get("termId");
  const generation = positiveQueryInteger(url.searchParams.get("generation"));
  if (
    typeof termId !== "string"
    || !/^[A-Za-z0-9._:-]{1,200}$/.test(termId)
    || !generation
  ) {
    return json({ error: "invalid_evidence_request" }, 400, {}, request, env);
  }
  try {
    const response = await queryCorpus(env, {
      script: TERM_VALUES_QUERY,
      parameters: { term_id: termId },
      expectedGeneration: generation,
      maxRows: 2_000,
      maxBytes: 1024 * 1024,
    });
    const headers = [
      "capture_id", "assignment_scope", "confidence", "resolution_kind",
      "evidence_index", "evidence_kind", "support_kind", "support_index",
      "values",
    ];
    const rows = checkedRows(response, headers, generation);
    if (!rows.every((row) => Number.isSafeInteger(row[0]) && Array.isArray(row[8]))) {
      throw new Error("Corpus term evidence response was invalid");
    }
    return json({ observedGeneration: generation, termId, headers, rows }, 200, {
      "cache-control": "private, max-age=300",
    }, request, env);
  } catch (error) {
    return evidenceError(error, request, env);
  }
}

async function relationColumns(url, request, env) {
  if (hasUnknownParameters(url, ["relation", "generation"])) {
    return json({ error: "invalid_evidence_request" }, 400, {}, request, env);
  }
  const relation = url.searchParams.get("relation");
  const generation = positiveQueryInteger(url.searchParams.get("generation"));
  if (
    typeof relation !== "string"
    || !/^[A-Za-z_][A-Za-z0-9_]{0,127}$/.test(relation)
    || !generation
  ) {
    return json({ error: "invalid_evidence_request" }, 400, {}, request, env);
  }
  try {
    const response = await queryCorpus(env, {
      script: `::columns ${relation}`,
      parameters: {},
      expectedGeneration: generation,
      maxRows: 200,
      maxBytes: 128 * 1024,
    });
    const headers = [
      "column", "is_key", "index", "type", "has_default", "default_expr",
    ];
    const rows = checkedRows(response, headers, generation);
    if (!rows.every((row) => typeof row[0] === "string" && typeof row[1] === "boolean")) {
      throw new Error("Corpus relation schema response was invalid");
    }
    return json({ observedGeneration: generation, relation, headers, rows }, 200, {
      "cache-control": "private, max-age=300",
    }, request, env);
  } catch (error) {
    return evidenceError(error, request, env);
  }
}

async function fontSimilarity(url, request, env) {
  if (hasUnknownParameters(url, ["familyId", "generation", "limit"])) {
    return json({ error: "invalid_similarity_request" }, 400, {}, request, env);
  }
  const familyId = positiveQueryInteger(url.searchParams.get("familyId"));
  const generation = positiveQueryInteger(url.searchParams.get("generation"));
  const limit = boundedQueryInteger(url.searchParams.get("limit"), 8, 1, 20);
  if (!familyId || !generation || !limit) {
    return json({ error: "invalid_similarity_request" }, 400, {}, request, env);
  }

  try {
    const response = await queryCorpus(env, {
      script: FONT_SIMILARITY_QUERY,
      parameters: {
        family_id: familyId,
        result_limit: limit,
        default_coordinates: { $type: "bytes", base64: "" },
        default_axis_evidence: { $type: "bytes", base64: "" },
      },
      expectedGeneration: generation,
      maxRows: limit,
      maxBytes: 512 * 1024,
    });
    const headers = [
      "rank", "target_family_id", "target_family_name", "family_id",
      "family_name", "content_sha256", "face_index", "variation_coordinates",
      "visual_distance", "metric_distance", "common_glyphs",
      "monospace_mismatch", "italic_mismatch",
    ];
    const rows = checkedRows(response, headers, generation);
    if (!rows.every(validFontSimilarityRow)) {
      throw new Error("Corpus font similarity response was invalid");
    }
    return json({
      observedGeneration: response.observedGeneration,
      target: rows[0]
        ? {
            familyId: rows[0][1],
            familyName: rows[0][2],
            previewUrl: representativeFontPreviewUrl(rows[0][1], rows[0][2]),
          }
        : { familyId },
      results: rows.map(fontSimilarityResult),
    }, 200, { "cache-control": "private, max-age=300" }, request, env);
  } catch (error) {
    return similarityError(error, request, env);
  }
}

async function captureSimilarity(url, request, env) {
  if (hasUnknownParameters(url, ["captureId", "generation", "limit"])) {
    return json({ error: "invalid_similarity_request" }, 400, {}, request, env);
  }
  const captureId = positiveQueryInteger(url.searchParams.get("captureId"));
  const generation = positiveQueryInteger(url.searchParams.get("generation"));
  const limit = boundedQueryInteger(url.searchParams.get("limit"), 12, 1, 24);
  if (!captureId || !generation || !limit) {
    return json({ error: "invalid_similarity_request" }, 400, {}, request, env);
  }

  try {
    const target = await queryCorpus(env, {
      script: CAPTURE_SIMILARITY_TARGET_QUERY,
      parameters: { capture_id: captureId },
      expectedGeneration: generation,
      maxRows: 1,
      maxBytes: 128 * 1024,
    });
    const targetRows = checkedRows(target, [
      "retrieval_generation", "index_name", "model_id", "dimensions",
      "distance", "normalization", "media_asset_index", "embedding",
    ], generation);
    if (!targetRows.length) {
      return json({
        observedGeneration: generation,
        target: { captureId, available: false },
        results: [],
      }, 200, { "cache-control": "private, max-age=300" }, request, env);
    }
    const [retrievalGeneration, indexName, modelId, dimensions, distance,
      normalization, mediaAssetIndex, query] = targetRows[0];
    if (
      typeof indexName !== "string"
      || !/^[A-Za-z_][A-Za-z0-9_]{0,127}$/.test(indexName)
      || !isVector(query, dimensions)
    ) {
      throw new Error("Invalid active capture similarity target");
    }

    const response = await queryCorpus(env, {
      script: captureSimilarityQuery(indexName, limit),
      parameters: { capture_id: captureId, query },
      expectedGeneration: target.observedGeneration,
      maxRows: limit,
      maxBytes: 256 * 1024,
    });
    const rows = checkedRows(response, [
      "capture_id", "distance", "title", "origin", "path", "captured_at",
    ], generation);
    if (!rows.every(validCaptureSimilarityRow)) {
      throw new Error("Corpus capture similarity response was invalid");
    }
    return json({
      observedGeneration: response.observedGeneration,
      target: { captureId, mediaAssetIndex, available: true },
      index: { retrievalGeneration, modelId, dimensions, distance, normalization },
      results: rows.map((row, index) => ({
        rank: index + 1,
        captureId: row[0],
        distance: row[1],
        title: row[2],
        origin: row[3],
        path: row[4],
        capturedAt: row[5],
        screenshotUrl: `https://pin.fontofweb.com/${row[0]}`,
      })),
    }, 200, { "cache-control": "private, max-age=300" }, request, env);
  } catch (error) {
    return similarityError(error, request, env);
  }
}

async function loadBundle(env) {
  if (bundleCache && Date.now() < bundleExpiresAt) return bundleCache;
  if (!bundleLoad) {
    bundleLoad = buildExplorerBundle((query) => queryCorpus(env, query))
      .then((bundle) => {
        bundleCache = bundle;
        bundleExpiresAt = Date.now() + BUNDLE_TTL_MS;
        return bundle;
      })
      .finally(() => { bundleLoad = null; });
  }
  return bundleLoad;
}

async function queryCorpus(env, query) {
  const response = await env.FUDGE_SERVICE.fetch(new Request(INTERNAL_QUERY_URL, {
    method: "POST",
    headers: { accept: "application/json", "content-type": "application/json" },
    body: JSON.stringify(query),
  }));
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    throw Object.assign(new Error(`Corpus query failed: ${body?.code || body?.error || response.status}`), {
      status: response.status,
      code: body?.code || body?.error,
    });
  }
  return body;
}

function checkedRows(response, headers, generation) {
  if (
    !response
    || response.observedGeneration !== generation
    || response.truncated !== false
    || response.returnedRows !== response.result?.rows?.length
    || response.result?.headers?.join("\u0000") !== headers.join("\u0000")
  ) {
    throw new Error("Corpus similarity response was incomplete or invalid");
  }
  return response.result.rows;
}

function isVector(value, dimensions) {
  return Boolean(
    Number.isSafeInteger(dimensions)
    && dimensions > 0
    && value?.$type === "vector"
    && value.scalarType === "f32"
    && Array.isArray(value.values)
    && value.values.length === dimensions
    && value.values.every(Number.isFinite)
  );
}

function positiveQueryInteger(value) {
  if (typeof value !== "string" || !/^[1-9][0-9]*$/.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : null;
}

function boundedQueryInteger(value, fallback, minimum, maximum) {
  if (value === null) return fallback;
  const parsed = positiveQueryInteger(value);
  return parsed !== null && parsed >= minimum && parsed <= maximum ? parsed : null;
}

function hasUnknownParameters(url, allowed) {
  const names = new Set(allowed);
  return [...url.searchParams.keys()].some((key) => !names.has(key));
}

function validFontSimilarityRow(row) {
  return Boolean(
    Array.isArray(row)
    && row.length === 13
    && Number.isSafeInteger(row[0])
    && Number.isSafeInteger(row[1])
    && typeof row[2] === "string"
    && Number.isSafeInteger(row[3])
    && typeof row[4] === "string"
    && taggedBytes(row[5], 32) !== null
    && Number.isSafeInteger(row[6])
    && row[6] >= 0
    && taggedBytes(row[7]) !== null
    && Number.isFinite(row[8])
    && Number.isFinite(row[9])
    && Number.isSafeInteger(row[10])
    && typeof row[11] === "boolean"
    && typeof row[12] === "boolean"
  );
}

function fontSimilarityResult(row) {
  const contentSha256 = taggedBytes(row[5], 32);
  const variationCoordinates = taggedBytes(row[7]);
  const identity = {
    contentSha256: base64Url(contentSha256.base64),
    faceIndex: row[6],
    variationCoordinates: base64Url(variationCoordinates.base64),
  };
  const preview = new URL(`https://api.withfudge.com/v1/font-previews/${row[3]}`);
  preview.searchParams.set("contentSha256", identity.contentSha256);
  preview.searchParams.set("faceIndex", String(identity.faceIndex));
  preview.searchParams.set("variationCoordinates", identity.variationCoordinates);
  preview.searchParams.set("sample", Array.from(`${row[4]} Aa Bb Cc 0123456789`).slice(0, 96).join(""));
  preview.searchParams.set("width", "768");
  return {
    rank: row[0],
    familyId: row[3],
    familyName: row[4],
    candidateIdentity: identity,
    previewUrl: preview.href,
    visualDistance: row[8],
    metricDistance: row[9],
    commonGlyphs: row[10],
    monospaceMismatch: row[11],
    italicMismatch: row[12],
  };
}

function representativeFontPreviewUrl(familyId, familyName) {
  const preview = new URL(`https://api.withfudge.com/v1/font-previews/${familyId}`);
  preview.searchParams.set("sample", Array.from(`${familyName} Aa Bb Cc 0123456789`).slice(0, 96).join(""));
  preview.searchParams.set("width", "768");
  return preview.href;
}

function taggedBytes(value, exactLength) {
  if (
    !isRecord(value)
    || value.$type !== "bytes"
    || typeof value.base64 !== "string"
    || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value.base64)
  ) return null;
  const byteLength = base64ByteLength(value.base64);
  return exactLength === undefined || byteLength === exactLength
    ? { base64: value.base64, byteLength }
    : null;
}

function base64ByteLength(value) {
  if (!value) return 0;
  const padding = value.endsWith("==") ? 2 : value.endsWith("=") ? 1 : 0;
  return value.length / 4 * 3 - padding;
}

function base64Url(value) {
  return value.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function validCaptureSimilarityRow(row) {
  return Boolean(
    Array.isArray(row)
    && row.length === 6
    && Number.isSafeInteger(row[0])
    && row[0] > 0
    && Number.isFinite(row[1])
    && typeof row[2] === "string"
    && typeof row[3] === "string"
    && typeof row[4] === "string"
    && Number.isSafeInteger(row[5])
  );
}

function similarityError(error, request, env) {
  const status = error?.status === 409 ? 409 : 502;
  return json({
    error: status === 409 ? "corpus_generation_changed" : "similarity_query_failed",
    detail: error instanceof Error ? error.message : "Similarity query failed",
  }, status, {}, request, env);
}

function evidenceError(error, request, env) {
  const status = error?.status === 409 ? 409 : 502;
  return json({
    error: status === 409 ? "corpus_generation_changed" : "evidence_query_failed",
    detail: error instanceof Error ? error.message : "Evidence query failed",
  }, status, {}, request, env);
}

function validateQuery(value) {
  if (!isRecord(value)) return { error: "invalid_query" };
  const allowed = new Set([
    "contractVersion",
    "script",
    "parameters",
    "expectedGeneration",
    "limits",
  ]);
  if (Object.keys(value).some((key) => !allowed.has(key))) {
    return { error: "invalid_query" };
  }
  if (
    value.contractVersion !== undefined
    && value.contractVersion !== QUERY_CONTRACT_VERSION
  ) {
    return { error: "unsupported_contract" };
  }
  if (
    typeof value.script !== "string"
    || value.script.length === 0
    || encoder.encode(value.script).byteLength > MAX_SCRIPT_BYTES
  ) {
    return { error: "invalid_query" };
  }
  if (value.parameters !== undefined && !isRecord(value.parameters)) {
    return { error: "invalid_query" };
  }
  if (
    value.expectedGeneration !== undefined
    && !Number.isSafeInteger(value.expectedGeneration)
  ) {
    return { error: "invalid_query" };
  }
  if (value.limits !== undefined && !isRecord(value.limits)) {
    return { error: "invalid_query" };
  }
  if (
    value.limits
    && Object.keys(value.limits).some((key) => !["maxRows", "maxBytes"].includes(key))
  ) {
    return { error: "invalid_query" };
  }

  const maxRows = boundedInteger(value.limits?.maxRows, 2_000, MAX_ROWS);
  const maxBytes = boundedInteger(value.limits?.maxBytes, 512 * 1024, MAX_BYTES);
  if (maxRows === null || maxBytes === null) return { error: "invalid_limits" };

  return {
    value: {
      script: value.script,
      parameters: value.parameters ?? {},
      ...(value.expectedGeneration === undefined
        ? {}
        : { expectedGeneration: value.expectedGeneration }),
      maxRows,
      maxBytes,
    },
  };
}

function boundedInteger(value, fallback, maximum) {
  if (value === undefined) return fallback;
  return Number.isSafeInteger(value) && value > 0 && value <= maximum
    ? value
    : null;
}

function isRecord(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function preflight(request, env) {
  const headers = new Headers({
    "access-control-allow-headers": "Authorization, Content-Type",
    "access-control-allow-methods": "GET, POST, OPTIONS",
    "access-control-max-age": "86400",
  });
  if (!applyCors(headers, request)) return json({ error: "origin_not_allowed" }, 403);
  return new Response(null, { status: 204, headers });
}

function applyCors(headers, request) {
  const origin = request.headers.get("origin");
  if (!origin) return true;
  if (origin !== new URL(request.url).origin) return false;
  headers.set("access-control-allow-origin", origin);
  headers.set("vary", "Origin");
  return true;
}

function json(body, status = 200, headers = {}, request, env) {
  const responseHeaders = new Headers({
    "cache-control": "no-store",
    "x-content-type-options": "nosniff",
    ...headers,
  });
  if (request && env) applyCors(responseHeaders, request);
  return Response.json(body, {
    status,
    headers: responseHeaders,
  });
}
