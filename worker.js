import {
  buildExplorerBootstrap,
  buildExplorerBundle,
  buildExplorerDetails,
} from "./explorer-bundle.js";
import {
  CAPTURE_EVIDENCE_QUERY,
  TERM_VALUES_QUERY,
} from "./evidence-queries.js";
import { FAMILY_FONT_SOURCE_QUERY } from "./font-source-query.js";
import {
  CAPTURED_FONT_DETAIL_QUERY,
  CAPTURED_FONT_SIMILARITY_QUERY,
  CAPTURED_FONT_STATUS_QUERY,
  CONFIRMED_FAMILY_USAGE_QUERY,
} from "./captured-font-queries.js";
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
const FAMILY_FONT_SOURCE_PATH = "/v1/family-font-source";
const CAPTURED_FONT_PATH = "/v1/captured-font";
const CAPTURED_FONT_SIMILARITY_PATH = "/v1/similar-captured-fonts";
const FAMILY_FONT_USAGE_PATH = "/v1/family-font-usage";
const SEMANTIC_TEXT_PATH = "/v1/semantic-search/text";
const SEMANTIC_IMAGE_PATH = "/v1/semantic-search/image";

const EXPLORER_STREAM_MEDIA_TYPE = "application/x-fudge-explorer-stream";
const INTERNAL_QUERY_URL = "https://fudge.internal/v1/internal/corpus/query";
const INTERNAL_SEMANTIC_TEXT_URL =
  "https://fudge.internal/v1/internal/corpus/semantic-search/text";
const INTERNAL_SEMANTIC_IMAGE_URL =
  "https://fudge.internal/v1/internal/corpus/semantic-search/image";
const MAX_REQUEST_BYTES = 96 * 1024;
const MAX_SCRIPT_BYTES = 32 * 1024;
const MAX_ROWS = 2_000;
const MAX_BYTES = 2 * 1024 * 1024;
const MAX_SEMANTIC_TEXT_BYTES = 2 * 1024;
const MAX_SEMANTIC_IMAGE_BYTES = 4 * 1024 * 1024;
const SEMANTIC_RESULT_LIMIT = 12;
const encoder = new TextEncoder();
const BUNDLE_TTL_MS = 5 * 60 * 1000;
let bundleCache;
let bundleExpiresAt = 0;
let bundleLoad;
let bootstrapCache;
let bootstrapExpiresAt = 0;
let bootstrapLoad;
let bootstrapProgress;
const bootstrapProgressListeners = new Set();
let detailsCache;
let detailsExpiresAt = 0;
let detailsGeneration;
let detailsLoad;

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const mediaMatch = url.pathname.match(/^\/v1\/media\/([1-9]\d*)(\.webm)?$/);
    if (mediaMatch) {
      return captureMedia(
        request,
        Number(mediaMatch[1]),
        Boolean(mediaMatch[2]),
        url,
      );
    }
    const isApi = [
      QUERY_PATH,
      FONT_SIMILARITY_PATH,
      CAPTURE_SIMILARITY_PATH,
      CAPTURE_EVIDENCE_PATH,
      TERM_VALUES_PATH,
      RELATION_COLUMNS_PATH,
      FAMILY_FONT_SOURCE_PATH,
      CAPTURED_FONT_PATH,
      CAPTURED_FONT_SIMILARITY_PATH,
      FAMILY_FONT_USAGE_PATH,
      SEMANTIC_TEXT_PATH,
      SEMANTIC_IMAGE_PATH,
    ].includes(url.pathname);

    if (url.pathname === "/health") {
      return json({ status: "ok", contractVersion: QUERY_CONTRACT_VERSION });
    }
    if (!isApi) {
      return env.ASSETS.fetch(request);
    }
    if (request.method === "OPTIONS") return preflight(request, env);
    const postOnly =
      url.pathname === SEMANTIC_TEXT_PATH ||
      url.pathname === SEMANTIC_IMAGE_PATH;
    const allowedMethods =
      url.pathname === QUERY_PATH
        ? "GET, POST, OPTIONS"
        : postOnly
          ? "POST, OPTIONS"
          : "GET, OPTIONS";
    if (
      (url.pathname === QUERY_PATH &&
        request.method !== "GET" &&
        request.method !== "POST") ||
      (postOnly && request.method !== "POST") ||
      (url.pathname !== QUERY_PATH && !postOnly && request.method !== "GET")
    ) {
      return json(
        { error: "method_not_allowed" },
        405,
        { Allow: allowedMethods },
        request,
        env,
      );
    }
    if (!env.FUDGE_SERVICE || typeof env.FUDGE_SERVICE.fetch !== "function") {
      return json(
        { error: "corpus_service_unavailable" },
        503,
        {},
        request,
        env,
      );
    }
    if (url.pathname === SEMANTIC_TEXT_PATH) {
      return semanticTextSearch(request, env);
    }
    if (url.pathname === SEMANTIC_IMAGE_PATH) {
      return semanticImageSearch(request, env);
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
    if (url.pathname === FAMILY_FONT_SOURCE_PATH) {
      return familyFontSource(url, request, env);
    }
    if (url.pathname === CAPTURED_FONT_PATH) {
      return capturedFont(url, request, env);
    }
    if (url.pathname === CAPTURED_FONT_SIMILARITY_PATH) {
      return capturedFontSimilarity(url, request, env);
    }
    if (url.pathname === FAMILY_FONT_USAGE_PATH) {
      return familyFontUsage(url, request, env);
    }
    if (request.method === "GET") {
      const phase = url.searchParams.get("phase");
      if (phase !== null && phase !== "bootstrap" && phase !== "details") {
        return json({ error: "invalid_explorer_phase" }, 400, {}, request, env);
      }
      if (phase === "bootstrap" && hasUnknownParameters(url, ["phase"])) {
        return json({ error: "invalid_explorer_phase" }, 400, {}, request, env);
      }
      if (
        phase === "details" &&
        hasUnknownParameters(url, ["phase", "generation"])
      ) {
        return json({ error: "invalid_explorer_phase" }, 400, {}, request, env);
      }
      const generation =
        phase === "details"
          ? positiveQueryInteger(url.searchParams.get("generation"))
          : null;
      if (phase === "details" && !generation) {
        return json({ error: "invalid_explorer_phase" }, 400, {}, request, env);
      }
      if (
        phase === "bootstrap" &&
        request.headers.get("accept")?.includes(EXPLORER_STREAM_MEDIA_TYPE)
      ) {
        return streamBootstrap(request, env);
      }
      try {
        const bundle =
          phase === "bootstrap"
            ? await loadBootstrap(env)
            : phase === "details"
              ? await loadDetails(env, generation)
              : await loadBundle(env);
        return json(
          bundle,
          200,
          {
            "cache-control": "private, max-age=300",
            "x-fudge-corpus-generation": String(
              bundle.data.observed_generation,
            ),
          },
          request,
          env,
        );
      } catch (error) {
        const status = error?.status === 409 ? 409 : 502;
        if (status === 409 && phase === "details") {
          bootstrapCache = undefined;
          bootstrapExpiresAt = 0;
          bootstrapProgress = undefined;
        }
        return json(
          {
            error:
              status === 409
                ? "corpus_generation_changed"
                : "explorer_bundle_failed",
            detail:
              error instanceof Error
                ? error.message
                : "Bundle construction failed",
          },
          status,
          {},
          request,
          env,
        );
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
      return json(
        { error: "corpus_service_unavailable" },
        503,
        {},
        request,
        env,
      );
    }
  },
};

async function captureMedia(request, captureId, video, url) {
  if (url.search || (request.method !== "GET" && request.method !== "HEAD")) {
    return new Response("Not found", { status: 404 });
  }
  const suffix = video ? ".webm" : "";
  const upstream = await fetch(
    `https://pin.fontofweb.com/${captureId}${suffix}`,
    {
      headers: { accept: video ? "video/webm" : "image/*" },
    },
  );
  if (!upstream.ok || !upstream.body) {
    return new Response("Capture media unavailable", {
      status: upstream.status === 404 ? 404 : 502,
    });
  }
  const headers = new Headers();
  headers.set(
    "content-type",
    upstream.headers.get("content-type") ??
      (video ? "video/webm" : "image/webp"),
  );
  headers.set(
    "cache-control",
    "public, max-age=86400, stale-while-revalidate=604800",
  );
  headers.set("cross-origin-resource-policy", "same-origin");
  return new Response(request.method === "HEAD" ? null : upstream.body, {
    status: 200,
    headers,
  });
}

async function semanticTextSearch(request, env) {
  const limited = await limitSemanticSearch(request, env, "text");
  if (limited) return limited;
  if (
    request.headers.get("content-type")?.split(";", 1)[0]?.trim() !==
    "application/json"
  ) {
    return json({ error: "unsupported_media_type" }, 415, {}, request, env);
  }
  const body = await readBoundedBody(request, MAX_SEMANTIC_TEXT_BYTES);
  if (body.error) {
    return json({ error: body.error }, 413, {}, request, env);
  }
  let query;
  try {
    const value = JSON.parse(new TextDecoder().decode(body.bytes));
    if (
      !isRecord(value) ||
      Object.keys(value).length !== 1 ||
      typeof value.query !== "string"
    ) {
      throw new Error("invalid");
    }
    query = value.query.trim();
  } catch {
    return json({ error: "invalid_search_request" }, 400, {}, request, env);
  }
  if (
    query.length < 3 ||
    query.length > 512 ||
    encoder.encode(query).byteLength > MAX_SEMANTIC_TEXT_BYTES
  ) {
    return json({ error: "invalid_search_request" }, 400, {}, request, env);
  }
  try {
    const upstream = await env.FUDGE_SERVICE.fetch(
      new Request(INTERNAL_SEMANTIC_TEXT_URL, {
        method: "POST",
        headers: {
          accept: "application/json",
          "content-type": "application/json",
        },
        body: JSON.stringify({ query }),
      }),
    );
    return semanticSearchResponse(upstream, "semantic_text", request, env);
  } catch {
    return json(
      { error: "semantic_search_unavailable" },
      503,
      {},
      request,
      env,
    );
  }
}

async function semanticImageSearch(request, env) {
  const limited = await limitSemanticSearch(request, env, "image");
  if (limited) return limited;
  const mediaType = request.headers
    .get("content-type")
    ?.split(";", 1)[0]
    ?.trim()
    .toLowerCase();
  if (mediaType !== "image/jpeg" && mediaType !== "image/png") {
    return json({ error: "unsupported_media_type" }, 415, {}, request, env);
  }
  const body = await readBoundedBody(request, MAX_SEMANTIC_IMAGE_BYTES);
  if (body.error) {
    return json({ error: body.error }, 413, {}, request, env);
  }
  if (!validSemanticImage(body.bytes, mediaType)) {
    return json({ error: "invalid_search_image" }, 400, {}, request, env);
  }
  try {
    const upstream = await env.FUDGE_SERVICE.fetch(
      new Request(INTERNAL_SEMANTIC_IMAGE_URL, {
        method: "POST",
        headers: { accept: "application/json", "content-type": mediaType },
        body: body.bytes,
      }),
    );
    return semanticSearchResponse(upstream, "semantic_image", request, env);
  } catch {
    return json(
      { error: "semantic_search_unavailable" },
      503,
      {},
      request,
      env,
    );
  }
}

async function limitSemanticSearch(request, env, kind) {
  const limiter =
    kind === "image"
      ? env.SEMANTIC_IMAGE_RATE_LIMITER
      : env.SEMANTIC_TEXT_RATE_LIMITER;
  if (!limiter || typeof limiter.limit !== "function") {
    return json(
      { error: "semantic_search_unavailable" },
      503,
      {},
      request,
      env,
    );
  }
  try {
    const ip = request.headers.get("cf-connecting-ip") ?? "local";
    const result = await limiter.limit({ key: `${kind}:${ip}` });
    if (result.success) return null;
    return json(
      { error: "semantic_search_rate_limited" },
      429,
      { "retry-after": "60" },
      request,
      env,
    );
  } catch {
    return json(
      { error: "semantic_search_unavailable" },
      503,
      {},
      request,
      env,
    );
  }
}

async function readBoundedBody(request, maximum) {
  const declaredLength = Number(request.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > maximum) {
    return { error: "request_too_large" };
  }
  const bytes = new Uint8Array(await request.arrayBuffer());
  return bytes.byteLength > 0 && bytes.byteLength <= maximum
    ? { bytes }
    : { error: "request_too_large" };
}

function validSemanticImage(bytes, mediaType) {
  if (mediaType === "image/jpeg") {
    return (
      bytes.byteLength >= 4 &&
      bytes[0] === 0xff &&
      bytes[1] === 0xd8 &&
      bytes[2] === 0xff
    );
  }
  const png = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  return (
    bytes.byteLength >= png.length &&
    png.every((value, index) => bytes[index] === value)
  );
}

async function semanticSearchResponse(upstream, expectedType, request, env) {
  let body;
  try {
    body = await upstream.json();
  } catch {
    return json(
      { error: "semantic_search_unavailable" },
      502,
      {},
      request,
      env,
    );
  }
  if (!upstream.ok) {
    const status = [400, 413, 415, 429, 503, 504].includes(upstream.status)
      ? upstream.status
      : 502;
    const error =
      status === 400
        ? "invalid_search_request"
        : status === 413
          ? "request_too_large"
          : status === 415
            ? "unsupported_media_type"
            : "semantic_search_unavailable";
    return json({ error }, status, {}, request, env);
  }
  if (
    !isRecord(body) ||
    !Number.isSafeInteger(body.observedGeneration) ||
    !isRecord(body.result) ||
    !Array.isArray(body.result.headers) ||
    !Array.isArray(body.result.rows) ||
    body.truncated !== false
  ) {
    return json(
      { error: "invalid_semantic_search_response" },
      502,
      {},
      request,
      env,
    );
  }
  const columns = new Map(
    body.result.headers.map((header, index) => [header, index]),
  );
  const required = [
    "capture_id",
    "distance",
    "title",
    "origin",
    "path",
    "match_type",
  ];
  if (required.some((header) => !columns.has(header))) {
    return json(
      { error: "invalid_semantic_search_response" },
      502,
      {},
      request,
      env,
    );
  }
  const results = [];
  for (const row of body.result.rows.slice(0, SEMANTIC_RESULT_LIMIT)) {
    if (!Array.isArray(row)) {
      return json(
        { error: "invalid_semantic_search_response" },
        502,
        {},
        request,
        env,
      );
    }
    const captureId = row[columns.get("capture_id")];
    const distance = row[columns.get("distance")];
    const title = row[columns.get("title")];
    const origin = row[columns.get("origin")];
    const path = row[columns.get("path")];
    const matchType = row[columns.get("match_type")];
    if (
      !Number.isSafeInteger(captureId) ||
      captureId < 1 ||
      !Number.isFinite(distance) ||
      typeof title !== "string" ||
      typeof origin !== "string" ||
      typeof path !== "string" ||
      matchType !== expectedType
    ) {
      return json(
        { error: "invalid_semantic_search_response" },
        502,
        {},
        request,
        env,
      );
    }
    results.push({ captureId, distance, title, origin, path });
  }
  return json(
    { observedGeneration: body.observedGeneration, results },
    200,
    { "cache-control": "no-store" },
    request,
    env,
  );
}

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
    return await runCurrentCorpusOperation(async () => {
      const response = await queryCorpus(env, {
        script: CAPTURE_EVIDENCE_QUERY,
        parameters: { capture_id: captureId },
        maxRows: 2_000,
        maxBytes: 1024 * 1024,
      });
      const observedGeneration = response.observedGeneration;
      const rows = checkedRows(
        response,
        ["kind", "identity", "values"],
        observedGeneration,
      );
      const evidence = {};
      for (const [kind, identity, values] of rows) {
        if (typeof kind !== "string" || !Array.isArray(values)) {
          throw new Error("Corpus capture evidence response was invalid");
        }
        (evidence[kind] ||= []).push({ identity, values });
      }
      return json(
        { observedGeneration, captureId, evidence },
        200,
        { "cache-control": "private, max-age=60" },
        request,
        env,
      );
    });
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
    typeof termId !== "string" ||
    !/^[A-Za-z0-9._:-]{1,200}$/.test(termId) ||
    !generation
  ) {
    return json({ error: "invalid_evidence_request" }, 400, {}, request, env);
  }
  try {
    return await runCurrentCorpusOperation(async () => {
      const response = await queryCorpus(env, {
        script: TERM_VALUES_QUERY,
        parameters: { term_id: termId },
        maxRows: 2_000,
        maxBytes: 1024 * 1024,
      });
      const observedGeneration = response.observedGeneration;
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
      const rows = checkedRows(response, headers, observedGeneration);
      if (
        !rows.every(
          (row) => Number.isSafeInteger(row[0]) && Array.isArray(row[8]),
        )
      ) {
        throw new Error("Corpus term evidence response was invalid");
      }
      return json(
        { observedGeneration, termId, headers, rows },
        200,
        { "cache-control": "private, max-age=60" },
        request,
        env,
      );
    });
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
    typeof relation !== "string" ||
    !/^[A-Za-z_][A-Za-z0-9_]{0,127}$/.test(relation) ||
    !generation
  ) {
    return json({ error: "invalid_evidence_request" }, 400, {}, request, env);
  }
  try {
    return await runCurrentCorpusOperation(async () => {
      const response = await queryCorpus(env, {
        script: `::columns ${relation}`,
        parameters: {},
        maxRows: 200,
        maxBytes: 128 * 1024,
      });
      const observedGeneration = response.observedGeneration;
      const headers = [
        "column",
        "is_key",
        "index",
        "type",
        "has_default",
        "default_expr",
      ];
      const rows = checkedRows(response, headers, observedGeneration);
      if (
        !rows.every(
          (row) => typeof row[0] === "string" && typeof row[1] === "boolean",
        )
      ) {
        throw new Error("Corpus relation schema response was invalid");
      }
      return json(
        { observedGeneration, relation, headers, rows },
        200,
        { "cache-control": "private, max-age=60" },
        request,
        env,
      );
    });
  } catch (error) {
    return evidenceError(error, request, env);
  }
}

async function familyFontSource(url, request, env) {
  if (hasUnknownParameters(url, ["familyId", "generation"])) {
    return json(
      { error: "invalid_font_source_request" },
      400,
      {},
      request,
      env,
    );
  }
  const familyId = positiveQueryInteger(url.searchParams.get("familyId"));
  const generation = positiveQueryInteger(url.searchParams.get("generation"));
  if (!familyId || !generation) {
    return json(
      { error: "invalid_font_source_request" },
      400,
      {},
      request,
      env,
    );
  }
  try {
    return await runCurrentCorpusOperation(async () => {
      const response = await queryCorpus(env, {
        script: FAMILY_FONT_SOURCE_QUERY,
        parameters: {
          family_id: familyId,
          default_coordinates: { $type: "bytes", base64: "" },
        },
        maxRows: 1,
        maxBytes: 128 * 1024,
      });
      const observedGeneration = response.observedGeneration;
      const headers = [
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
      ];
      const rows = checkedRows(response, headers, observedGeneration);
      if (rows.length > 1)
        throw new Error("Corpus family font source response was invalid");
      const source = rows[0] ? familyFontSourceResult(rows[0]) : null;
      if (rows[0] && !source)
        throw new Error("Corpus family font source response was invalid");
      return json(
        { observedGeneration, familyId, source },
        200,
        { "cache-control": "private, max-age=60" },
        request,
        env,
      );
    });
  } catch (error) {
    return fontSourceError(error, request, env);
  }
}

async function capturedFont(url, request, env) {
  if (
    hasUnknownParameters(url, ["captureId", "observationIndex", "generation"])
  ) {
    return json(
      { error: "invalid_captured_font_request" },
      400,
      {},
      request,
      env,
    );
  }
  const captureId = positiveQueryInteger(url.searchParams.get("captureId"));
  const observationIndex = nonnegativeQueryInteger(
    url.searchParams.get("observationIndex"),
  );
  const generation = positiveQueryInteger(url.searchParams.get("generation"));
  if (!captureId || observationIndex === null || !generation) {
    return json(
      { error: "invalid_captured_font_request" },
      400,
      {},
      request,
      env,
    );
  }

  try {
    return await runCurrentCorpusOperation(async () => {
      const statusResponse = await queryCorpus(env, {
        script: CAPTURED_FONT_STATUS_QUERY,
        parameters: {
          capture_id: captureId,
          observation_index: observationIndex,
        },
        maxRows: 20,
        maxBytes: 128 * 1024,
      });
      const observedGeneration = statusResponse.observedGeneration;
      const statusHeaders = [
        "capture_id",
        "observation_index",
        "declared_family",
        "computed_css_stack",
        "acquisition_index",
        "state",
        "failure_code",
      ];
      const statusRows = checkedRows(
        statusResponse,
        statusHeaders,
        observedGeneration,
      );
      if (!statusRows.every(validCapturedFontStatusRow)) {
        throw new Error("Corpus captured font status response was invalid");
      }
      if (!statusRows.length) {
        return json(
          { error: "captured_font_not_found" },
          404,
          {},
          request,
          env,
        );
      }
      const statusRow = [...statusRows].sort(compareCapturedFontStatusRows)[0];
      const state = statusRow[5];
      let faces = [];

      if (
        state === "searchable" ||
        state === "acquired_without_active_descriptor"
      ) {
        const detailResponse = await queryCorpus(env, {
          script: CAPTURED_FONT_DETAIL_QUERY,
          parameters: {
            capture_id: captureId,
            observation_index: observationIndex,
          },
          maxRows: 20,
          maxBytes: 256 * 1024,
        });
        const detailHeaders = [
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
        ];
        const detailRows = checkedRows(
          detailResponse,
          detailHeaders,
          detailResponse.observedGeneration,
        );
        if (!detailRows.every(validCapturedFontDetailRow)) {
          throw new Error("Corpus captured font detail response was invalid");
        }
        faces = detailRows.map(capturedFontFaceResult);
      }

      return json(
        {
          observedGeneration,
          captureId,
          observationIndex,
          observation: {
            declaredFamily: statusRow[2],
            computedCssStack: statusRow[3],
          },
          pipeline: {
            state,
            acquisitionIndex: statusRow[4],
            failureCode: statusRow[6] || null,
          },
          previewUrl:
            statusRow[4] === null
              ? null
              : capturedFontPreviewUrl(captureId, observationIndex),
          faces,
        },
        200,
        { "cache-control": "private, max-age=60" },
        request,
        env,
      );
    });
  } catch (error) {
    return capturedFontError(error, request, env);
  }
}

async function capturedFontSimilarity(url, request, env) {
  if (
    hasUnknownParameters(url, [
      "captureId",
      "observationIndex",
      "generation",
      "limit",
    ])
  ) {
    return json({ error: "invalid_similarity_request" }, 400, {}, request, env);
  }
  const captureId = positiveQueryInteger(url.searchParams.get("captureId"));
  const observationIndex = nonnegativeQueryInteger(
    url.searchParams.get("observationIndex"),
  );
  const generation = positiveQueryInteger(url.searchParams.get("generation"));
  const limit = boundedQueryInteger(url.searchParams.get("limit"), 8, 1, 20);
  if (!captureId || observationIndex === null || !generation || !limit) {
    return json({ error: "invalid_similarity_request" }, 400, {}, request, env);
  }

  try {
    return await runCurrentCorpusOperation(async () => {
      const response = await queryCorpus(env, {
        script: CAPTURED_FONT_SIMILARITY_QUERY,
        parameters: {
          capture_id: captureId,
          observation_index: observationIndex,
          result_limit: limit,
          default_coordinates: { $type: "bytes", base64: "" },
          default_axis_evidence: { $type: "bytes", base64: "" },
        },
        maxRows: limit,
        maxBytes: 512 * 1024,
      });
      const observedGeneration = response.observedGeneration;
      const headers = [
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
      ];
      const rows = checkedRows(response, headers, observedGeneration);
      if (!rows.every(validCapturedFontSimilarityRow)) {
        throw new Error("Corpus captured font similarity response was invalid");
      }
      return json(
        {
          observedGeneration,
          target: {
            captureId,
            observationIndex,
            familyName: rows[0]?.[1] ?? null,
            previewUrl: capturedFontPreviewUrl(captureId, observationIndex),
          },
          results: rows.map(capturedFontSimilarityResult),
        },
        200,
        { "cache-control": "private, max-age=60" },
        request,
        env,
      );
    });
  } catch (error) {
    return similarityError(error, request, env);
  }
}

async function familyFontUsage(url, request, env) {
  if (hasUnknownParameters(url, ["familyId", "generation", "limit"])) {
    return json(
      { error: "invalid_family_font_usage_request" },
      400,
      {},
      request,
      env,
    );
  }
  const familyId = positiveQueryInteger(url.searchParams.get("familyId"));
  const generation = positiveQueryInteger(url.searchParams.get("generation"));
  const limit = boundedQueryInteger(url.searchParams.get("limit"), 100, 1, 200);
  if (!familyId || !generation || !limit) {
    return json(
      { error: "invalid_family_font_usage_request" },
      400,
      {},
      request,
      env,
    );
  }

  try {
    return await runCurrentCorpusOperation(async () => {
      const response = await queryCorpus(env, {
        script: CONFIRMED_FAMILY_USAGE_QUERY,
        parameters: { family_id: familyId, result_limit: limit },
        maxRows: limit,
        maxBytes: 256 * 1024,
      });
      const observedGeneration = response.observedGeneration;
      const rows = checkedRows(
        response,
        [
          "capture_id",
          "observation_index",
          "declared_family",
          "usage_evidence",
        ],
        observedGeneration,
      );
      if (!rows.every(validFamilyFontUsageRow)) {
        throw new Error("Corpus confirmed family usage response was invalid");
      }
      return json(
        {
          observedGeneration,
          familyId,
          results: rows.map((row) => ({
            captureId: row[0],
            observationIndex: row[1],
            declaredFamily: row[2],
            usageEvidence: row[3],
          })),
        },
        200,
        { "cache-control": "private, max-age=60" },
        request,
        env,
      );
    });
  } catch (error) {
    return familyFontUsageError(error, request, env);
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
    return await runCurrentCorpusOperation(async () => {
      const response = await queryCorpus(env, {
        script: FONT_SIMILARITY_QUERY,
        parameters: {
          family_id: familyId,
          result_limit: limit,
          default_coordinates: { $type: "bytes", base64: "" },
          default_axis_evidence: { $type: "bytes", base64: "" },
        },
        maxRows: limit,
        maxBytes: 512 * 1024,
      });
      const observedGeneration = response.observedGeneration;
      const headers = [
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
      ];
      const rows = checkedRows(response, headers, observedGeneration);
      if (!rows.every(validFontSimilarityRow)) {
        throw new Error("Corpus font similarity response was invalid");
      }
      return json(
        {
          observedGeneration,
          target: rows[0]
            ? {
                familyId: rows[0][1],
                familyName: rows[0][2],
                previewUrl: representativeFontPreviewUrl(rows[0][1]),
              }
            : { familyId },
          results: rows.map(fontSimilarityResult),
        },
        200,
        { "cache-control": "private, max-age=60" },
        request,
        env,
      );
    });
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
    return await runCurrentCorpusOperation(async () => {
      const target = await queryCorpus(env, {
        script: CAPTURE_SIMILARITY_TARGET_QUERY,
        parameters: { capture_id: captureId },
        maxRows: 1,
        maxBytes: 128 * 1024,
      });
      const targetRows = checkedRows(
        target,
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
        target.observedGeneration,
      );
      if (!targetRows.length) {
        return json(
          {
            observedGeneration: target.observedGeneration,
            target: { captureId, available: false },
            results: [],
          },
          200,
          { "cache-control": "private, max-age=300" },
          request,
          env,
        );
      }
      const [
        retrievalGeneration,
        indexName,
        modelId,
        dimensions,
        distance,
        normalization,
        mediaAssetIndex,
        query,
      ] = targetRows[0];
      if (
        typeof indexName !== "string" ||
        !/^[A-Za-z_][A-Za-z0-9_]{0,127}$/.test(indexName) ||
        !isVector(query, dimensions)
      ) {
        throw new Error("Invalid active capture similarity target");
      }

      const response = await queryCorpus(env, {
        script: captureSimilarityQuery(indexName, limit),
        parameters: { capture_id: captureId, query },
        maxRows: limit,
        maxBytes: 256 * 1024,
      });
      const rows = checkedRows(
        response,
        ["capture_id", "distance", "title", "origin", "path", "captured_at"],
        response.observedGeneration,
      );
      if (!rows.every(validCaptureSimilarityRow)) {
        throw new Error("Corpus capture similarity response was invalid");
      }
      return json(
        {
          observedGeneration: response.observedGeneration,
          target: { captureId, mediaAssetIndex, available: true },
          index: {
            retrievalGeneration,
            modelId,
            dimensions,
            distance,
            normalization,
          },
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
        },
        200,
        { "cache-control": "private, max-age=60" },
        request,
        env,
      );
    });
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
      .finally(() => {
        bundleLoad = null;
      });
  }
  return bundleLoad;
}

async function loadBootstrap(env) {
  return loadBootstrapWithProgress(env);
}

async function loadBootstrapWithProgress(env, onProgress) {
  if (bootstrapCache && Date.now() < bootstrapExpiresAt) {
    onProgress?.({ completed: 1, total: 1, label: "Loaded Explorer bundle" });
    return bootstrapCache;
  }
  if (!bootstrapLoad) {
    bootstrapProgress = undefined;
    bootstrapLoad = buildExplorerBootstrap(
      (query) => queryCorpus(env, query),
      reportBootstrapProgress,
    )
      .then((bundle) => {
        bootstrapCache = bundle;
        bootstrapExpiresAt = Date.now() + BUNDLE_TTL_MS;
        return bundle;
      })
      .finally(() => {
        bootstrapLoad = null;
      });
  }
  if (onProgress) {
    bootstrapProgressListeners.add(onProgress);
    if (bootstrapProgress) onProgress(bootstrapProgress);
  }
  try {
    return await bootstrapLoad;
  } finally {
    if (onProgress) bootstrapProgressListeners.delete(onProgress);
  }
}

function reportBootstrapProgress(progress) {
  bootstrapProgress = progress;
  for (const listener of bootstrapProgressListeners) listener(progress);
}

function streamBootstrap(request, env) {
  const { readable, writable } = new TransformStream();
  const writer = writable.getWriter();
  let writes = Promise.resolve();
  const send = (event) => {
    writes = writes.then(() =>
      writer.write(encoder.encode(JSON.stringify(event) + "\n")),
    );
  };
  void (async () => {
    try {
      const bundle = await loadBootstrapWithProgress(env, (progress) => {
        send({ type: "progress", ...progress });
      });
      await writes;
      const text = JSON.stringify(bundle);
      const bytes = encoder.encode(text);
      await writer.write(
        encoder.encode(
          JSON.stringify({ type: "bundle", bytes: bytes.byteLength }) + "\n",
        ),
      );
      await writer.write(bytes);
    } catch (error) {
      const status = error?.status === 409 ? 409 : 502;
      try {
        await writes;
        await writer.write(
          encoder.encode(
            JSON.stringify({
              type: "error",
              status,
              error:
                status === 409
                  ? "corpus_generation_changed"
                  : "explorer_bundle_failed",
              detail:
                error instanceof Error
                  ? error.message
                  : "Bundle construction failed",
            }) + "\n",
          ),
        );
      } catch (_) {}
    } finally {
      try {
        await writer.close();
      } catch (_) {}
    }
  })();
  const headers = new Headers({
    "cache-control": "private, no-store, no-transform",
    "content-type": EXPLORER_STREAM_MEDIA_TYPE,
    "x-content-type-options": "nosniff",
  });
  applyCors(headers, request);
  return new Response(readable, { status: 200, headers });
}

async function loadDetails(env, generation) {
  if (
    detailsCache &&
    detailsGeneration === generation &&
    Date.now() < detailsExpiresAt
  )
    return detailsCache;
  if (!detailsLoad || detailsGeneration !== generation) {
    detailsGeneration = generation;
    detailsLoad = buildExplorerDetails(
      (query) => queryCorpus(env, query),
      generation,
    )
      .then((bundle) => {
        if (detailsGeneration === generation) {
          detailsCache = bundle;
          detailsExpiresAt = Date.now() + BUNDLE_TTL_MS;
        }
        return bundle;
      })
      .finally(() => {
        if (detailsGeneration === generation) detailsLoad = null;
      });
  }
  return detailsLoad;
}

async function queryCorpus(env, query) {
  const response = await env.FUDGE_SERVICE.fetch(
    new Request(INTERNAL_QUERY_URL, {
      method: "POST",
      headers: {
        accept: "application/json",
        "content-type": "application/json",
      },
      body: JSON.stringify(query),
    }),
  );
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    throw Object.assign(
      new Error(
        `Corpus query failed: ${body?.code || body?.error || response.status}`,
      ),
      {
        status: response.status,
        code: body?.code || body?.error,
      },
    );
  }
  return body;
}

async function runCurrentCorpusOperation(operation) {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      if (!isCorpusGenerationChanged(error) || attempt === 1) throw error;
    }
  }
  throw new Error("Current corpus operation retry exhausted");
}

function isCorpusGenerationChanged(error) {
  return Boolean(
    error?.status === 409 && error?.code === "corpus_generation_changed",
  );
}

function checkedRows(response, headers, generation) {
  if (
    !response ||
    response.observedGeneration !== generation ||
    response.truncated !== false ||
    response.returnedRows !== response.result?.rows?.length ||
    response.result?.headers?.join("\u0000") !== headers.join("\u0000")
  ) {
    throw new Error("Corpus similarity response was incomplete or invalid");
  }
  return response.result.rows;
}

function isVector(value, dimensions) {
  return Boolean(
    Number.isSafeInteger(dimensions) &&
    dimensions > 0 &&
    value?.$type === "vector" &&
    value.scalarType === "f32" &&
    Array.isArray(value.values) &&
    value.values.length === dimensions &&
    value.values.every(Number.isFinite),
  );
}

function positiveQueryInteger(value) {
  if (typeof value !== "string" || !/^[1-9][0-9]*$/.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : null;
}

function nonnegativeQueryInteger(value) {
  if (typeof value !== "string" || !/^(?:0|[1-9][0-9]*)$/.test(value))
    return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : null;
}

function boundedQueryInteger(value, fallback, minimum, maximum) {
  if (value === null) return fallback;
  const parsed = positiveQueryInteger(value);
  return parsed !== null && parsed >= minimum && parsed <= maximum
    ? parsed
    : null;
}

function hasUnknownParameters(url, allowed) {
  const names = new Set(allowed);
  return [...url.searchParams.keys()].some((key) => !names.has(key));
}

function validFontSimilarityRow(row) {
  return Boolean(
    Array.isArray(row) &&
    row.length === 13 &&
    Number.isSafeInteger(row[0]) &&
    Number.isSafeInteger(row[1]) &&
    typeof row[2] === "string" &&
    Number.isSafeInteger(row[3]) &&
    nullableString(row[4]) &&
    taggedBytes(row[5], 32) !== null &&
    Number.isSafeInteger(row[6]) &&
    row[6] >= 0 &&
    taggedBytes(row[7]) !== null &&
    Number.isFinite(row[8]) &&
    Number.isFinite(row[9]) &&
    Number.isSafeInteger(row[10]) &&
    typeof row[11] === "boolean" &&
    typeof row[12] === "boolean",
  );
}

function validCapturedFontStatusRow(row) {
  return Boolean(
    Array.isArray(row) &&
    row.length === 7 &&
    Number.isSafeInteger(row[0]) &&
    row[0] > 0 &&
    Number.isSafeInteger(row[1]) &&
    row[1] >= 0 &&
    typeof row[2] === "string" &&
    typeof row[3] === "string" &&
    (row[4] === null || (Number.isSafeInteger(row[4]) && row[4] >= 0)) &&
    typeof row[5] === "string" &&
    typeof row[6] === "string",
  );
}

function compareCapturedFontStatusRows(left, right) {
  const priority = {
    searchable: 0,
    acquired_without_active_descriptor: 1,
    acquired: 2,
    source_not_acquired: 3,
  };
  const stateDifference =
    (priority[left[5]] ?? 10) - (priority[right[5]] ?? 10);
  if (stateDifference !== 0) return stateDifference;
  return (right[4] ?? -1) - (left[4] ?? -1);
}

function validCapturedFontDetailRow(row) {
  return Boolean(
    Array.isArray(row) &&
    row.length === 17 &&
    Number.isSafeInteger(row[0]) &&
    row[0] >= 0 &&
    taggedBytes(row[1], 32) !== null &&
    Number.isSafeInteger(row[2]) &&
    row[2] >= 0 &&
    taggedBytes(row[3]) !== null &&
    nullableString(row[4]) &&
    row.slice(5, 12).every(nullableString) &&
    Number.isSafeInteger(row[12]) &&
    row[12] >= 0 &&
    typeof row[13] === "string" &&
    nullableNonnegativeInteger(row[14]) &&
    nullablePositiveInteger(row[15]) &&
    nullableString(row[16]),
  );
}

function capturedFontFaceResult(row) {
  const contentSha256 = taggedBytes(row[1], 32);
  const variationCoordinates = taggedBytes(row[3]);
  return {
    acquisitionIndex: row[0],
    identity: {
      contentSha256: base64Url(contentSha256.base64),
      faceIndex: row[2],
      variationCoordinates: base64Url(variationCoordinates.base64),
    },
    descriptorSchemaId: row[4],
    metadata: {
      family: row[5],
      subfamily: row[6],
      typographicFamily: row[7],
      fullName: row[8],
      postscriptName: row[9],
      vendorName: row[10],
      version: row[11],
      axisCount: row[12],
    },
    resolution: {
      state: row[13],
      logicalFaceId: row[14],
      familyId: row[15],
      familyName: row[16],
    },
  };
}

function validCapturedFontSimilarityRow(row) {
  return Boolean(
    Array.isArray(row) &&
    row.length === 12 &&
    Number.isSafeInteger(row[0]) &&
    row[0] > 0 &&
    typeof row[1] === "string" &&
    Number.isSafeInteger(row[2]) &&
    row[2] > 0 &&
    typeof row[3] === "string" &&
    taggedBytes(row[4], 32) !== null &&
    Number.isSafeInteger(row[5]) &&
    row[5] >= 0 &&
    taggedBytes(row[6]) !== null &&
    Number.isFinite(row[7]) &&
    Number.isFinite(row[8]) &&
    Number.isSafeInteger(row[9]) &&
    row[9] >= 0 &&
    typeof row[10] === "boolean" &&
    typeof row[11] === "boolean",
  );
}

function capturedFontSimilarityResult(row) {
  const contentSha256 = taggedBytes(row[4], 32);
  const variationCoordinates = taggedBytes(row[6]);
  const identity = {
    contentSha256: base64Url(contentSha256.base64),
    faceIndex: row[5],
    variationCoordinates: base64Url(variationCoordinates.base64),
  };
  const preview = new URL(
    `https://api.withfudge.com/v1/font-previews/${row[2]}`,
  );
  preview.searchParams.set("contentSha256", identity.contentSha256);
  preview.searchParams.set("faceIndex", String(identity.faceIndex));
  preview.searchParams.set(
    "variationCoordinates",
    identity.variationCoordinates,
  );
  preview.searchParams.set("sample", "Hamburgefontsiv 0123456789");
  preview.searchParams.set("width", "768");
  return {
    rank: row[0],
    familyId: row[2],
    familyName: row[3],
    candidateIdentity: identity,
    previewUrl: preview.href,
    visualDistance: row[7],
    metricDistance: row[8],
    commonGlyphs: row[9],
    monospaceMismatch: row[10],
    italicMismatch: row[11],
  };
}

function validFamilyFontUsageRow(row) {
  return Boolean(
    Array.isArray(row) &&
    row.length === 4 &&
    Number.isSafeInteger(row[0]) &&
    row[0] > 0 &&
    nullableNonnegativeInteger(row[1]) &&
    typeof row[2] === "string" &&
    ["confirmed_captured_face", "historical_family_attribution"].includes(
      row[3],
    ),
  );
}

function nullableString(value) {
  return value === null || typeof value === "string";
}

function nullableNonnegativeInteger(value) {
  return value === null || (Number.isSafeInteger(value) && value >= 0);
}

function nullablePositiveInteger(value) {
  return value === null || (Number.isSafeInteger(value) && value > 0);
}

function fontSimilarityResult(row) {
  const contentSha256 = taggedBytes(row[5], 32);
  const variationCoordinates = taggedBytes(row[7]);
  const identity = {
    contentSha256: base64Url(contentSha256.base64),
    faceIndex: row[6],
    variationCoordinates: base64Url(variationCoordinates.base64),
  };
  const preview = new URL(
    `https://api.withfudge.com/v1/font-previews/${row[3]}`,
  );
  preview.searchParams.set("contentSha256", identity.contentSha256);
  preview.searchParams.set("faceIndex", String(identity.faceIndex));
  preview.searchParams.set(
    "variationCoordinates",
    identity.variationCoordinates,
  );
  preview.searchParams.set("sample", "Hamburgefontsiv 0123456789");
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

function representativeFontPreviewUrl(familyId) {
  const preview = new URL(
    `https://api.withfudge.com/v1/font-previews/${familyId}`,
  );
  preview.searchParams.set("sample", "Hamburgefontsiv 0123456789");
  preview.searchParams.set("width", "768");
  return preview.href;
}

function capturedFontPreviewUrl(captureId, observationIndex) {
  const preview = new URL(
    `https://api.withfudge.com/v1/font-previews/captures/${captureId}/observations/${observationIndex}`,
  );
  preview.searchParams.set("sample", "Hamburgefontsiv 0123456789");
  preview.searchParams.set("width", "768");
  return preview.href;
}

function familyFontSourceResult(row) {
  if (!Array.isArray(row) || row.length !== 14) return null;
  const [
    sourceAdapterId,
    upstreamReleaseId,
    upstreamRevision,
    authoritativeUrl,
    releaseRecordedAt,
    upstreamPath,
    contentValue,
    byteLength,
    faceIndex,
    coordinatesValue,
    weightClass,
    widthClass,
    slant,
    traitObservedAt,
  ] = row;
  const contentSha256 = taggedBytes(contentValue, 32);
  const variationCoordinates = taggedBytes(coordinatesValue, 0);
  const releasePath = validGoogleFontsPath(upstreamReleaseId, false);
  const artifactPath = validGoogleFontsPath(upstreamPath, true);
  let authoritative;
  try {
    authoritative = new URL(authoritativeUrl);
  } catch {
    return null;
  }
  if (
    sourceAdapterId !== "google-fonts-v1" ||
    !releasePath ||
    !artifactPath ||
    !artifactPath.startsWith(releasePath + "/") ||
    !/^[0-9a-f]{40}$/.test(upstreamRevision) ||
    authoritative.protocol !== "https:" ||
    authoritative.hostname !== "github.com" ||
    authoritative.username ||
    authoritative.password ||
    authoritative.search ||
    authoritative.hash ||
    decodeURIComponent(authoritative.pathname) !==
      `/google/fonts/tree/${upstreamRevision}/${releasePath}` ||
    !contentSha256 ||
    !variationCoordinates ||
    !Number.isSafeInteger(byteLength) ||
    byteLength < 1 ||
    byteLength > 20 * 1024 * 1024 ||
    faceIndex !== 0 ||
    (weightClass !== null &&
      (!Number.isSafeInteger(weightClass) ||
        weightClass < 1 ||
        weightClass > 1_000)) ||
    (widthClass !== null &&
      (!Number.isSafeInteger(widthClass) ||
        widthClass < 1 ||
        widthClass > 9)) ||
    typeof slant !== "string" ||
    !Number.isSafeInteger(releaseRecordedAt) ||
    !Number.isSafeInteger(traitObservedAt)
  )
    return null;
  const format = artifactPath.toLowerCase().endsWith(".otf")
    ? "opentype"
    : "truetype";
  const encodedPath = artifactPath.split("/").map(encodeURIComponent).join("/");
  return {
    sourceAdapterId,
    upstreamReleaseId: releasePath,
    upstreamRevision,
    authoritativeUrl: authoritative.href,
    upstreamPath: artifactPath,
    contentSha256: base64Url(contentSha256.base64),
    byteLength,
    faceIndex,
    variationCoordinates: base64Url(variationCoordinates.base64),
    weightClass,
    widthClass,
    slant,
    fontUrl: `https://raw.githubusercontent.com/google/fonts/${upstreamRevision}/${encodedPath}`,
    format,
  };
}

function validGoogleFontsPath(value, requireFont) {
  if (
    typeof value !== "string" ||
    value.length < 1 ||
    value.length > 512 ||
    value.includes("\\")
  )
    return null;
  const segments = value.split("/");
  if (
    segments.some(
      (segment) =>
        !segment ||
        segment === "." ||
        segment === ".." ||
        !/^[A-Za-z0-9._+(),\[\] -]+$/.test(segment),
    ) ||
    (requireFont && !/\.(?:ttf|otf)$/i.test(segments.at(-1)))
  )
    return null;
  return segments.join("/");
}

function taggedBytes(value, exactLength) {
  if (
    !isRecord(value) ||
    value.$type !== "bytes" ||
    typeof value.base64 !== "string" ||
    !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(
      value.base64,
    )
  )
    return null;
  const byteLength = base64ByteLength(value.base64);
  return exactLength === undefined || byteLength === exactLength
    ? { base64: value.base64, byteLength }
    : null;
}

function base64ByteLength(value) {
  if (!value) return 0;
  const padding = value.endsWith("==") ? 2 : value.endsWith("=") ? 1 : 0;
  return (value.length / 4) * 3 - padding;
}

function base64Url(value) {
  return value.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function validCaptureSimilarityRow(row) {
  return Boolean(
    Array.isArray(row) &&
    row.length === 6 &&
    Number.isSafeInteger(row[0]) &&
    row[0] > 0 &&
    Number.isFinite(row[1]) &&
    typeof row[2] === "string" &&
    typeof row[3] === "string" &&
    typeof row[4] === "string" &&
    Number.isSafeInteger(row[5]),
  );
}

function similarityError(error, request, env) {
  const status = error?.status === 409 ? 409 : 502;
  return json(
    {
      error:
        status === 409
          ? "corpus_generation_changed"
          : "similarity_query_failed",
      detail:
        error instanceof Error ? error.message : "Similarity query failed",
    },
    status,
    {},
    request,
    env,
  );
}

function evidenceError(error, request, env) {
  const status = error?.status === 409 ? 409 : 502;
  return json(
    {
      error:
        status === 409 ? "corpus_generation_changed" : "evidence_query_failed",
      detail: error instanceof Error ? error.message : "Evidence query failed",
    },
    status,
    {},
    request,
    env,
  );
}

function fontSourceError(error, request, env) {
  const status = error?.status === 409 ? 409 : 502;
  return json(
    {
      error:
        status === 409
          ? "corpus_generation_changed"
          : "family_font_source_query_failed",
      detail:
        error instanceof Error
          ? error.message
          : "Family font source query failed",
    },
    status,
    {},
    request,
    env,
  );
}

function capturedFontError(error, request, env) {
  const status = error?.status === 409 ? 409 : 502;
  return json(
    {
      error:
        status === 409
          ? "corpus_generation_changed"
          : "captured_font_query_failed",
      detail:
        error instanceof Error ? error.message : "Captured font query failed",
    },
    status,
    {},
    request,
    env,
  );
}

function familyFontUsageError(error, request, env) {
  const status = error?.status === 409 ? 409 : 502;
  return json(
    {
      error:
        status === 409
          ? "corpus_generation_changed"
          : "family_font_usage_query_failed",
      detail:
        error instanceof Error
          ? error.message
          : "Family font usage query failed",
    },
    status,
    {},
    request,
    env,
  );
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
    value.contractVersion !== undefined &&
    value.contractVersion !== QUERY_CONTRACT_VERSION
  ) {
    return { error: "unsupported_contract" };
  }
  if (
    typeof value.script !== "string" ||
    value.script.length === 0 ||
    encoder.encode(value.script).byteLength > MAX_SCRIPT_BYTES
  ) {
    return { error: "invalid_query" };
  }
  if (value.parameters !== undefined && !isRecord(value.parameters)) {
    return { error: "invalid_query" };
  }
  if (
    value.expectedGeneration !== undefined &&
    !Number.isSafeInteger(value.expectedGeneration)
  ) {
    return { error: "invalid_query" };
  }
  if (value.limits !== undefined && !isRecord(value.limits)) {
    return { error: "invalid_query" };
  }
  if (
    value.limits &&
    Object.keys(value.limits).some(
      (key) => !["maxRows", "maxBytes"].includes(key),
    )
  ) {
    return { error: "invalid_query" };
  }

  const maxRows = boundedInteger(value.limits?.maxRows, 2_000, MAX_ROWS);
  const maxBytes = boundedInteger(
    value.limits?.maxBytes,
    512 * 1024,
    MAX_BYTES,
  );
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
  if (!applyCors(headers, request))
    return json({ error: "origin_not_allowed" }, 403);
  return new Response(null, { status: 204, headers });
}

function applyCors(headers, request) {
  const origin = request.headers.get("origin");
  if (!origin) return true;
  if (origin !== new URL(request.url).origin) return false;
  headers.set("access-control-allow-origin", origin);
  headers.set(
    "access-control-expose-headers",
    "X-Fudge-Corpus-Generation, X-Uncompressed-Content-Length",
  );
  headers.set("vary", "Origin");
  return true;
}

function json(body, status = 200, headers = {}, request, env) {
  const text = JSON.stringify(body);
  const responseHeaders = new Headers({
    "cache-control": "no-store",
    "content-type": "application/json; charset=utf-8",
    "x-content-type-options": "nosniff",
    "x-uncompressed-content-length": String(encoder.encode(text).byteLength),
    ...headers,
  });
  if (request && env) applyCors(responseHeaders, request);
  return new Response(text, {
    status,
    headers: responseHeaders,
  });
}
