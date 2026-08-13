const PAGE_LIMIT = 2_000;
const RESPONSE_LIMIT = 2 * 1024 * 1024;
const CAPTURE_COUNT_QUERY = query(
  ["count(capture_id)"],
  "?[count(capture_id)] := *capture{id: capture_id}\n:limit 1",
  [],
  1,
);

export const EXPLORER_QUERIES = {
  captures: query([
    "capture_id", "origin", "path", "title", "captured_at", "device_class",
    "theme", "interaction_state", "capture_scope", "render_context",
    "viewport_width_px", "viewport_height_px", "device_pixel_ratio",
    "crop_width_px", "crop_height_px", "screenshot_key",
    "screenshot_media_type", "screenshot_width_px", "screenshot_height_px",
    "capture_contract_id", "profile_generation",
  ], `?[capture_id, origin, path, title, captured_at, device_class, theme,
   interaction_state, capture_scope, render_context, viewport_width_px,
   viewport_height_px, device_pixel_ratio, crop_width_px, crop_height_px,
   screenshot_key, screenshot_media_type, screenshot_width_px,
   screenshot_height_px, capture_contract_id, profile_generation] :=
  *capture{
    id: capture_id, page_id, title, captured_at, device_class, theme,
    interaction_state, capture_scope, render_context, viewport_width_px,
    viewport_height_px, device_pixel_ratio, crop_width_px, crop_height_px,
    screenshot_key, screenshot_media_type, screenshot_width_px,
    screenshot_height_px, capture_contract_id, profile_generation
  },
  *page{id: page_id, domain_id, path},
  *domain{id: domain_id, origin},
  capture_id > $after_capture_id
:order capture_id
:limit ${PAGE_LIMIT}`, [["capture_id", -1]]),

  families: query(["family_id", "name", "designer_id", "vendor_id"], `
?[family_id, name, designer_id, vendor_id] :=
  *primary_family{id: family_id, name, designer_id, vendor_id},
  family_id > $after_family_id
:order family_id
:limit ${PAGE_LIMIT}`, [["family_id", -1]]),

  designers: query(["designer_id", "name", "url"], `
?[designer_id, name, url] :=
  *primary_designer{id: designer_id, name, url},
  designer_id > $after_designer_id
:order designer_id
:limit ${PAGE_LIMIT}`, [["designer_id", -1]]),

  vendors: query(["vendor_id", "name", "url"], `
?[vendor_id, name, url] :=
  *primary_vendor{id: vendor_id, name, url},
  vendor_id > $after_vendor_id
:order vendor_id
:limit ${PAGE_LIMIT}`, [["vendor_id", -1]]),

  releases: query([
    "family_id", "upstream_release_id", "upstream_revision", "released_at",
    "authoritative_url",
  ], `?[family_id, upstream_release_id, upstream_revision, released_at,
   authoritative_url] :=
  *primary_font_release{
    family_id, upstream_release_id, upstream_revision, released_at,
    authoritative_url
  },
  [family_id, upstream_release_id, upstream_revision] >
    [$after_family_id, $after_upstream_release_id, $after_upstream_revision]
:order family_id, upstream_release_id, upstream_revision
:limit ${PAGE_LIMIT}`, [
    ["family_id", -1],
    ["upstream_release_id", ""],
    ["upstream_revision", ""],
  ]),

  terms: query(["term_id", "label", "definition", "facet_id"], `
active_ontology[ontology_id] :=
  *active_capture_classification_contract{
    singleton: 'capture_classification', contract_id
  },
  *capture_classification_contract{contract_id, ontology_id}

?[term_id, label, definition, facet_id] :=
  active_ontology[ontology_id],
  *ontology_term{
    ontology_id, term_id, label, definition, facet_id, status: 'active'
  },
  term_id > $after_term_id
:order term_id
:limit ${PAGE_LIMIT}`, [["term_id", ""]]),

  assignments: query([
    "capture_id", "term_id", "confidence", "assignment_scope",
    "resolution_kind",
  ], `
?[capture_id, term_id, confidence, assignment_scope, resolution_kind] :=
  *resolved_capture_term{
    capture_id, term_id, confidence, assignment_scope, resolution_kind
  },
  [capture_id, term_id] > [$after_capture_id, $after_term_id]
:order capture_id, term_id
:limit ${PAGE_LIMIT}`, [["capture_id", -1], ["term_id", ""]]),

  colorRoles: query([
    "capture_id", "role", "r", "g", "b", "alpha_ppm", "occurrence_count",
    "rank",
  ], `?[capture_id, role, r, g, b, alpha_ppm, occurrence_count, rank] :=
  *capture_color_role{
    capture_id, role, rank, r, g, b, alpha_ppm, occurrence_count
  },
  [capture_id, role, rank] > [$after_capture_id, $after_role, $after_rank]
:order capture_id, role, rank
:limit ${PAGE_LIMIT}`, [["capture_id", -1], ["role", ""], ["rank", -1]]),

  backgrounds: query([
    "capture_id", "r", "g", "b", "alpha_ppm", "occurrence_count",
    "evidence_kind", "observation_index",
  ], `?[capture_id, r, g, b, alpha_ppm, occurrence_count, evidence_kind,
   observation_index] :=
  *capture_background_property{
    capture_id, observation_index, r, g, b, alpha_ppm, occurrence_count,
    evidence_kind
  },
  [capture_id, observation_index] >
    [$after_capture_id, $after_observation_index]
:order capture_id, observation_index
:limit ${PAGE_LIMIT}`, [["capture_id", -1], ["observation_index", -1]]),

  fontObservations: query([
    "capture_id", "observation_index", "declared_family", "computed_css_stack",
    "weight_min", "weight_max", "character_share_ppm", "occurrence_count",
  ], `font_base[capture_id, observation_index, declared_family,
          computed_css_stack] :=
  *primary_pin_font_observation{
    capture_id, observation_index, declared_family, computed_css_stack
  }

font_row[capture_id, observation_index, declared_family, computed_css_stack,
         weight_min, weight_max, character_share_ppm, occurrence_count] :=
  font_base[capture_id, observation_index, declared_family, computed_css_stack],
  *primary_pin_font_observation_usage{
    capture_id, observation_index, weight_min, weight_max,
    character_share_ppm, occurrence_count
  }

missing_usage[weight_min, weight_max, character_share_ppm, occurrence_count] <-
  [[null, null, null, 0]]

font_row[capture_id, observation_index, declared_family, computed_css_stack,
         weight_min, weight_max, character_share_ppm, occurrence_count] :=
  font_base[capture_id, observation_index, declared_family, computed_css_stack],
  not *primary_pin_font_observation_usage{capture_id, observation_index},
  missing_usage[weight_min, weight_max, character_share_ppm, occurrence_count]

?[capture_id, observation_index, declared_family, computed_css_stack,
  weight_min, weight_max, character_share_ppm, occurrence_count] :=
  font_row[capture_id, observation_index, declared_family, computed_css_stack,
           weight_min, weight_max, character_share_ppm, occurrence_count],
  [capture_id, observation_index] >
    [$after_capture_id, $after_observation_index]
:order capture_id, observation_index
:limit ${PAGE_LIMIT}`, [["capture_id", -1], ["observation_index", -1]]),

  typeRoles: query([
    "capture_id", "role", "declared_family", "weight", "size_milli_px",
    "line_height_milli_px", "character_share_ppm", "rank", "generic_family",
    "style", "letter_spacing_milli_px", "occurrence_count", "measure_milli_px",
    "confidence_ppm", "evidence_kind",
  ], `?[capture_id, role, declared_family, weight, size_milli_px,
   line_height_milli_px, character_share_ppm, rank, generic_family, style,
   letter_spacing_milli_px, occurrence_count, measure_milli_px, confidence_ppm,
   evidence_kind] :=
  *capture_type_role{
    capture_id, role, rank, declared_family, weight, size_milli_px,
    line_height_milli_px, character_share_ppm, generic_family, style,
    letter_spacing_milli_px, occurrence_count, measure_milli_px,
    confidence_ppm, evidence_kind
  },
  [capture_id, role, rank] > [$after_capture_id, $after_role, $after_rank]
:order capture_id, role, rank
:limit ${PAGE_LIMIT}`, [["capture_id", -1], ["role", ""], ["rank", -1]]),

  textStyles: query([
    "capture_id", "declared_family", "weight", "size_milli_px",
    "occurrence_count", "observation_index", "generic_family", "style",
    "line_height_milli_px", "letter_spacing_milli_px", "alignment",
    "text_transform", "r", "g", "b", "alpha_ppm", "character_share_ppm",
    "evidence_kind",
  ], `?[capture_id, declared_family, weight, size_milli_px, occurrence_count,
   observation_index, generic_family, style, line_height_milli_px,
   letter_spacing_milli_px, alignment, text_transform, r, g, b, alpha_ppm,
   character_share_ppm, evidence_kind] :=
  *capture_text_style{
    capture_id, observation_index, declared_family, weight, size_milli_px,
    occurrence_count, generic_family, style, line_height_milli_px,
    letter_spacing_milli_px, alignment, text_transform, r, g, b, alpha_ppm,
    character_share_ppm, evidence_kind
  },
  [capture_id, observation_index] >
    [$after_capture_id, $after_observation_index]
:order capture_id, observation_index
:limit ${PAGE_LIMIT}`, [["capture_id", -1], ["observation_index", -1]]),

  historicalFonts: query([
    "capture_id", "family_id", "family_name", "sub_family_name",
    "legacy_link_count", "sub_family_id",
  ], `?[capture_id, family_id, family_name, sub_family_name,
   legacy_link_count, sub_family_id] :=
  *capture_historical_font_attribution{
    capture_id, sub_family_id, family_id, family_name, sub_family_name,
    legacy_link_count, status: 'eligible'
  },
  [capture_id, sub_family_id] > [$after_capture_id, $after_sub_family_id]
:order capture_id, sub_family_id
:limit ${PAGE_LIMIT}`, [["capture_id", -1], ["sub_family_id", -1]]),

  structures: query([
    "capture_id", "structure_id", "parent_structure_id", "term_id", "x_q",
    "y_q", "width_q", "height_q", "salience_rank", "repeat_count",
    "column_count", "row_count", "gap_milli_px", "confidence_ppm",
    "evidence_kind",
  ], `?[capture_id, structure_id, parent_structure_id, term_id, x_q, y_q,
   width_q, height_q, salience_rank, repeat_count, column_count, row_count,
   gap_milli_px, confidence_ppm, evidence_kind] :=
  *capture_structure{
    capture_id, structure_id, parent_structure_id, term_id, x_q, y_q,
    width_q, height_q, salience_rank, repeat_count, column_count, row_count,
    gap_milli_px, confidence_ppm, evidence_kind
  },
  [capture_id, structure_id] > [$after_capture_id, $after_structure_id]
:order capture_id, structure_id
:limit ${PAGE_LIMIT}`, [["capture_id", -1], ["structure_id", -1]]),

  motionAssets: query([
    "capture_id", "object_key", "media_type", "byte_length",
    "duration_milli_seconds", "width_px", "height_px",
  ], `?[capture_id, object_key, media_type, byte_length,
   duration_milli_seconds, width_px, height_px] :=
  *capture_motion_asset{
    capture_id, object_key, media_type, byte_length, duration_milli_seconds,
    width_px, height_px
  },
  capture_id > $after_capture_id
:order capture_id
:limit ${PAGE_LIMIT}`, [["capture_id", -1]]),

  videoObservations: query([
    "capture_id", "observation_index", "media_kind", "x_q", "y_q", "width_q",
    "height_q", "coverage_ppm", "occurrence_count", "evidence_kind",
  ], `?[capture_id, observation_index, media_kind, x_q, y_q, width_q, height_q,
   coverage_ppm, occurrence_count, evidence_kind] :=
  *capture_media_observation{
    capture_id, observation_index, media_kind: 'video', x_q, y_q, width_q,
    height_q, coverage_ppm, occurrence_count, evidence_kind
  },
  media_kind = 'video',
  [capture_id, observation_index] >
    [$after_capture_id, $after_observation_index]
:order capture_id, observation_index
:limit ${PAGE_LIMIT}`, [["capture_id", -1], ["observation_index", -1]]),

  gradients: query([
    "capture_id", "gradient_id", "structure_id", "structure_observation_index",
    "kind", "angle_millidegrees", "x_q", "y_q", "width_q", "height_q",
    "occurrence_count", "evidence_kind",
  ], `?[capture_id, gradient_id, structure_id, structure_observation_index,
   kind, angle_millidegrees, x_q, y_q, width_q, height_q, occurrence_count,
   evidence_kind] :=
  *capture_gradient{
    capture_id, gradient_id, structure_id, structure_observation_index, kind,
    angle_millidegrees, x_q, y_q, width_q, height_q, occurrence_count,
    evidence_kind
  },
  [capture_id, gradient_id] > [$after_capture_id, $after_gradient_id]
:order capture_id, gradient_id
:limit ${PAGE_LIMIT}`, [["capture_id", -1], ["gradient_id", -1]]),

  legacyColors: query(["capture_id", "collect(rgb_integer)"], `
legacy[capture_id, rgb_integer] :=
  *historical_capture_color_observation{capture_id, legacy_color_id},
  *historical_color_value{legacy_color_id, rgb_integer},
  capture_id != null

?[capture_id, collect(rgb_integer)] :=
  legacy[capture_id, rgb_integer],
  capture_id > $after_capture_id
:order capture_id
:limit ${PAGE_LIMIT}`, [["capture_id", -1]]),

  fontSources: query([
    "capture_id", "observation_index", "source_index", "family", "format", "url",
  ], `?[capture_id, observation_index, source_index, family, format, url] :=
  *capture_font_source_locator{
    capture_id, observation_index, source_index, format, url
  },
  *primary_pin_font_observation{
    capture_id, observation_index, declared_family: family
  },
  [capture_id, observation_index, source_index] >
    [$after_capture_id, $after_observation_index, $after_source_index]
:order capture_id, observation_index, source_index
:limit ${PAGE_LIMIT}`, [
    ["capture_id", -1],
    ["observation_index", -1],
    ["source_index", -1],
  ]),

  embeddingRuntime: query([
    "active_generation_id", "rollback_generation_id", "activated_at",
    "rollback_expires_at", "index_name", "contract_id", "provider_id",
    "model_id", "immutable_model_version", "dimensions", "scalar_type",
    "distance", "normalization", "corpus_modality", "source_corpus_sequence",
    "member_count", "hnsw_m", "hnsw_ef_construction", "staged_at",
    "indexed_member_count", "benchmark_suite_id", "validated_at",
  ], `?[active_generation_id, rollback_generation_id, activated_at,
   rollback_expires_at, index_name, contract_id, provider_id, model_id,
   immutable_model_version, dimensions, scalar_type, distance, normalization,
   corpus_modality, source_corpus_sequence, member_count, hnsw_m,
   hnsw_ef_construction, staged_at, indexed_member_count, benchmark_suite_id,
   validated_at] :=
  *capture_retrieval_active{
    singleton: 'current', active_generation_id, rollback_generation_id,
    activated_at, rollback_expires_at
  },
  *capture_retrieval_generation{
    generation_id: active_generation_id, index_name, contract_id, provider_id,
    model_id, immutable_model_version, dimensions, scalar_type, distance,
    normalization, corpus_modality, source_corpus_sequence, member_count,
    hnsw_m, hnsw_ef_construction, staged_at
  },
  *capture_retrieval_generation_validation{
    generation_id: active_generation_id, indexed_member_count,
    benchmark_suite_id, validated_at
  }
:limit 1`),

  classificationRuntime: query([
    "contract_id", "activated_at", "previous_contract_id", "ontology_id",
    "provider", "model_id", "immutable_model_version", "validator_version",
    "resolver_version",
  ], `?[contract_id, activated_at, previous_contract_id, ontology_id, provider,
   model_id, immutable_model_version, validator_version, resolver_version] :=
  *active_capture_classification_contract{
    singleton: 'capture_classification', contract_id, activated_at,
    previous_contract_id
  },
  *capture_classification_contract{
    contract_id, ontology_id, provider, model_id, immutable_model_version,
    validator_version, resolver_version
  }
:limit 1`),

  runtimeCounts: query([
    "borders", "shadows", "radii", "spacing", "gradients", "gradient_stops",
    "media", "completeness", "classification_current",
    "classification_absent", "classification_failed", "classification_unsupported",
  ], `border_count[count(id)] := *capture_border_observation{capture_id: id}
shadow_count[count(id)] := *capture_shadow_observation{capture_id: id}
radius_count[count(id)] := *capture_radius_observation{capture_id: id}
spacing_count[count(id)] := *capture_spacing_observation{capture_id: id}
gradient_count[count(id)] := *capture_gradient{capture_id: id}
stop_count[count(id)] := *capture_gradient_stop{capture_id: id}
media_count[count(id)] := *capture_media_observation{capture_id: id}
completeness_count[count(id)] := *capture_profile_completeness{capture_id: id}
class_current[count(id)] := *capture_classification_state{capture_id: id, status: 'current'}
class_absent[count(id)] := *capture_classification_state{capture_id: id, status: 'absent'}
class_failed[count(id)] := *capture_classification_state{capture_id: id, status: 'failed'}
class_unsupported[count(id)] := *capture_classification_state{capture_id: id, status: 'unsupported'}

?[borders, shadows, radii, spacing, gradients, gradient_stops, media,
  completeness, classification_current, classification_absent,
  classification_failed, classification_unsupported] :=
  border_count[borders], shadow_count[shadows], radius_count[radii],
  spacing_count[spacing], gradient_count[gradients], stop_count[gradient_stops],
  media_count[media], completeness_count[completeness],
  class_current[classification_current], class_absent[classification_absent],
  class_failed[classification_failed],
  class_unsupported[classification_unsupported]
:limit 1`, [], 2),

  relations: query([
    "name", "arity", "access_level", "n_keys", "n_non_keys", "n_put_triggers",
    "n_rm_triggers", "n_replace_triggers", "description",
  ], "::relations", [], 500),
};

const CAPTURE_PAGE_QUERY = query([
  "capture_id", "origin", "path", "title", "captured_at", "device_class",
  "theme", "interaction_state", "capture_scope", "render_context",
  "viewport_width_px", "viewport_height_px", "device_pixel_ratio",
  "crop_width_px", "crop_height_px", "screenshot_key",
  "screenshot_media_type", "screenshot_width_px", "screenshot_height_px",
  "capture_contract_id", "profile_generation",
], `?[capture_id, origin, path, title, captured_at, device_class, theme,
   interaction_state, capture_scope, render_context, viewport_width_px,
   viewport_height_px, device_pixel_ratio, crop_width_px, crop_height_px,
   screenshot_key, screenshot_media_type, screenshot_width_px,
   screenshot_height_px, capture_contract_id, profile_generation] :=
  *capture{
    id: capture_id, page_id, title, captured_at, device_class, theme,
    interaction_state, capture_scope, render_context, viewport_width_px,
    viewport_height_px, device_pixel_ratio, crop_width_px, crop_height_px,
    screenshot_key, screenshot_media_type, screenshot_width_px,
    screenshot_height_px, capture_contract_id, profile_generation
  },
  *page{id: page_id, domain_id, path},
  *domain{id: domain_id, origin}
:order capture_id
:limit ${PAGE_LIMIT}
:offset $offset`);

export const EXPLORER_DEFERRED_QUERY_NAMES = Object.freeze([
  "backgrounds",
  "textStyles",
  "historicalFonts",
  "legacyColors",
]);

export const EXPLORER_BOOTSTRAP_QUERY_NAMES = Object.freeze(
  Object.keys(EXPLORER_QUERIES).filter((name) => (
    name !== "captures" && !EXPLORER_DEFERRED_QUERY_NAMES.includes(name)
  )),
);

export async function buildExplorerBundle(runQuery) {
  const capturesResult = await execute(runQuery, "captures", undefined);
  const generation = capturesResult.observedGeneration;
  const names = Object.keys(EXPLORER_QUERIES).filter((name) => name !== "captures");
  const results = await executeAll(runQuery, names, generation);
  return assembleExplorerBundle(capturesResult, results);
}

export async function buildExplorerBootstrap(runQuery, onProgress = () => {}) {
  const capturePlan = await planCaptures(runQuery);
  const capturePages = Math.ceil(capturePlan.total / PAGE_LIMIT);
  const total = 1 + capturePages + EXPLORER_BOOTSTRAP_QUERY_NAMES.length + 1;
  let completed = 1;
  onProgress({ completed, total, label: "Counted captures" });
  const advance = (label) => {
    completed += 1;
    onProgress({ completed, total, label });
  };
  const [capturesResult, results] = await Promise.all([
    executeCapturePages(runQuery, capturePlan, () => advance("Loaded captures")),
    executeAll(
      runQuery,
      EXPLORER_BOOTSTRAP_QUERY_NAMES,
      capturePlan.generation,
      (name) => advance(`Loaded ${name}`),
    ),
  ]);
  const bundle = assembleExplorerBundle(capturesResult, results);
  advance("Built Explorer bundle");
  return bundle;
}

export async function buildExplorerDetails(runQuery, generation) {
  if (!Number.isSafeInteger(generation) || generation < 1) {
    throw new Error("Explorer detail generation was invalid");
  }
  const results = await executeAll(
    runQuery,
    EXPLORER_DEFERRED_QUERY_NAMES,
    generation,
  );
  return {
    data: {
      observed_generation: generation,
      backgrounds: resultRows(results, "backgrounds"),
      text_styles: resultRows(results, "textStyles"),
      hist_fonts: resultRows(results, "historicalFonts"),
    },
    legacyColors: legacyColors(resultRows(results, "legacyColors")),
  };
}

async function executeAll(runQuery, names, generation, onComplete = () => {}) {
  const entries = await Promise.all(names.map(async (name) => [
    name,
    await execute(runQuery, name, generation).then((result) => {
      onComplete(name);
      return result;
    }),
  ]));
  return Object.fromEntries(entries);
}

async function planCaptures(runQuery) {
  const countResponse = await checkedQuery(runQuery, "captureCount", CAPTURE_COUNT_QUERY, {}, undefined);
  const generation = countResponse.observedGeneration;
  const total = countResponse.result.rows[0]?.[0];
  if (!Number.isSafeInteger(total) || total < 0) {
    throw new Error("Explorer projection captureCount was incomplete or invalid");
  }
  return { generation, total };
}

async function executeCapturePages(runQuery, { generation, total }, onPage = () => {}) {
  if (!total) return { observedGeneration: generation, rows: [] };
  const pages = await Promise.all(
    Array.from({ length: Math.ceil(total / PAGE_LIMIT) }, async (_, index) => {
      const page = await checkedQuery(
        runQuery,
        "captures",
        CAPTURE_PAGE_QUERY,
        { offset: index * PAGE_LIMIT },
        generation,
      );
      onPage(index);
      return page;
    }),
  );
  const rows = pages.flatMap((page) => page.result.rows);
  if (rows.length !== total) {
    throw new Error("Explorer projection captures was incomplete or invalid");
  }
  return { observedGeneration: generation, rows };
}

async function checkedQuery(runQuery, name, spec, parameters, expectedGeneration) {
  let response;
  try {
    response = await runQuery({
      script: spec.script,
      parameters,
      expectedGeneration,
      maxRows: spec.maxRows,
      maxBytes: spec.maxBytes,
    });
  } catch (error) {
    const wrapped = new Error(`Explorer projection ${name} failed: ${
      error instanceof Error ? error.message : "query failed"
    }`);
    wrapped.status = error?.status;
    throw wrapped;
  }
  if (
    !response
    || !Number.isSafeInteger(response.observedGeneration)
    || (expectedGeneration !== undefined && response.observedGeneration !== expectedGeneration)
    || !Array.isArray(response.result?.headers)
    || response.result.headers.join("\u0000") !== spec.headers.join("\u0000")
    || !Array.isArray(response.result.rows)
    || response.returnedRows !== response.result.rows.length
    || response.truncated
  ) {
    throw new Error(`Explorer projection ${name} was incomplete or invalid`);
  }
  return response;
}

function assembleExplorerBundle(capturesResult, results) {
  const generation = capturesResult.observedGeneration;
  const captures = capturesResult.rows.map((row) => [
    row[0], row[1], row[2], row[3], row[4],
    `https://pin.fontofweb.com/${row[0]}`,
    row[5], row[6], row[7], ...row.slice(8),
  ]);
  const captureById = new Map(captures.map((capture) => [capture[0], capture]));
  const domainCounts = new Map();
  for (const capture of captures) {
    domainCounts.set(capture[1], (domainCounts.get(capture[1]) || 0) + 1);
  }
  const videoObservations = resultRows(results, "videoObservations").map((row) => ({
    capture_id: row[0], observation_index: row[1], media_kind: row[2],
    x_q: row[3], y_q: row[4], width_q: row[5], height_q: row[6],
    coverage_ppm: row[7], occurrence_count: row[8], evidence_kind: row[9],
  }));
  const embeddedVideoCaptures = [...new Set(videoObservations.map((row) => row.capture_id))]
    .flatMap((captureId) => {
      const capture = captureById.get(captureId);
      return capture ? [{
        id: capture[0], origin: capture[1], path: capture[2], title: capture[3],
        captured_at: capture[4],
      }] : [];
    });

  return {
    data: {
      built: new Date().toISOString(),
      observed_generation: generation,
      domains: [...domainCounts.entries()].sort((a, b) => a[0].localeCompare(b[0])),
      captures,
      families: resultRows(results, "families"),
      designers: resultRows(results, "designers"),
      vendors: resultRows(results, "vendors"),
      releases: resultRows(results, "releases"),
      terms: Object.fromEntries(resultRows(results, "terms").map((row) => [
        row[0], [row[1], row[2], row[3]],
      ])),
      assignments: resultRows(results, "assignments"),
      color_roles: resultRows(results, "colorRoles"),
      backgrounds: resultRows(results, "backgrounds"),
      font_obs: resultRows(results, "fontObservations"),
      type_roles: resultRows(results, "typeRoles"),
      text_styles: resultRows(results, "textStyles"),
      hist_fonts: resultRows(results, "historicalFonts"),
      structures: resultRows(results, "structures"),
      motion_assets: resultRows(results, "motionAssets").map((row) => [
        row[0], `https://pin.fontofweb.com/${row[0]}.webm`, ...row.slice(2),
      ]),
      video_observations: videoObservations,
      embedded_video_captures: embeddedVideoCaptures,
      ann: {},
      font_similarity_results: {},
      font_similarity: {},
      catalog_matches: {},
      embedding_runtime: embeddingRuntime(resultRows(results, "embeddingRuntime")[0]),
      classification_runtime: classificationRuntime(resultRows(results, "classificationRuntime")[0]),
      runtime_counts: runtimeCounts(resultRows(results, "runtimeCounts")[0]),
    },
    gradients: groupGradients(resultRows(results, "gradients")),
    legacyColors: legacyColors(resultRows(results, "legacyColors")),
    fontSources: groupFontSources(resultRows(results, "fontSources")),
    relations: resultRows(results, "relations").map(relationSummary),
  };
}

function resultRows(results, name) {
  return results[name]?.rows || [];
}

function legacyColors(rows) {
  return Object.fromEntries(rows.map(([captureId, colors]) => [
    captureId,
    [...new Set(colors)].sort((a, b) => a - b),
  ]));
}

function query(headers, script, cursor = [], maxRows = PAGE_LIMIT) {
  return { headers, script: script.trim(), cursor, maxRows, maxBytes: RESPONSE_LIMIT };
}

async function execute(runQuery, name, expectedGeneration) {
  const spec = EXPLORER_QUERIES[name];
  const parameters = Object.fromEntries(spec.cursor.map(([column, initial]) => [
    `after_${column}`,
    initial,
  ]));
  const cursorIndexes = spec.cursor.map(([column]) => spec.headers.indexOf(column));
  const rows = [];
  let generation = expectedGeneration;
  for (;;) {
    let response;
    try {
      response = await runQuery({
        script: spec.script,
        parameters,
        expectedGeneration: generation,
        maxRows: spec.maxRows,
        maxBytes: spec.maxBytes,
      });
    } catch (error) {
      const wrapped = new Error(`Explorer projection ${name} failed: ${
        error instanceof Error ? error.message : "query failed"
      }`);
      wrapped.status = error?.status;
      throw wrapped;
    }
    if (
      !response
      || !Number.isSafeInteger(response.observedGeneration)
      || (generation !== undefined && response.observedGeneration !== generation)
      || !Array.isArray(response.result?.headers)
      || response.result.headers.join("\u0000") !== spec.headers.join("\u0000")
      || !Array.isArray(response.result.rows)
      || response.returnedRows !== response.result.rows.length
    ) {
      throw new Error(`Explorer projection ${name} was incomplete or invalid`);
    }
    generation ??= response.observedGeneration;
    rows.push(...response.result.rows);
    if (!response.truncated && response.result.rows.length < spec.maxRows) {
      return { observedGeneration: generation, rows };
    }
    const last = response.result.rows.at(-1);
    if (!last || !spec.cursor.length || cursorIndexes.some((index) => index < 0)) {
      throw new Error(`Explorer projection ${name} was incomplete or invalid`);
    }
    spec.cursor.forEach(([column], index) => {
      parameters[`after_${column}`] = last[cursorIndexes[index]];
    });
  }
}

function groupGradients(rows) {
  const grouped = {};
  for (const row of rows) {
    const [captureId, gradientId, structureId, structureObservationIndex, kind,
      angle, x, y, width, height, occurrenceCount, evidenceKind] = row;
    (grouped[captureId] ||= []).push({
      gradient_id: gradientId,
      structure_id: structureId,
      structure_observation_index: structureObservationIndex,
      kind,
      angle_millidegrees: angle,
      x_q: x,
      y_q: y,
      width_q: width,
      height_q: height,
      occurrence_count: occurrenceCount,
      evidence_kind: evidenceKind,
    });
  }
  return grouped;
}

function groupFontSources(rows) {
  const grouped = {};
  for (const [captureId, observationIndex, sourceIndex, family, format, url] of rows) {
    (grouped[captureId] ||= []).push({
      family,
      format,
      url,
      observation_index: observationIndex,
      source_index: sourceIndex,
    });
  }
  return grouped;
}

function embeddingRuntime(row) {
  if (!row) return {};
  return {
    active_generation_id: row[0], rollback_generation_id: row[1],
    activated_at: row[2], rollback_expires_at: row[3], index_name: row[4],
    contract_id: row[5], provider_id: row[6], model_id: row[7],
    immutable_model_version: row[8], dimensions: row[9], scalar_type: row[10],
    distance: row[11], normalization: row[12], corpus_modality: row[13],
    source_corpus_sequence: row[14], member_count: row[15], hnsw_m: row[16],
    hnsw_ef_construction: row[17], staged_at: row[18],
    indexed_member_count: row[19], benchmark_suite_id: row[20],
    validated_at: row[21],
  };
}

function classificationRuntime(row) {
  if (!row) return {};
  return {
    contract_id: row[0], activated_at: row[1], previous_contract_id: row[2],
    ontology_id: row[3], provider: row[4], model_id: row[5],
    immutable_model_version: row[6], validator_version: row[7],
    resolver_version: row[8],
  };
}

function runtimeCounts(row) {
  const names = [
    "borders", "shadows", "radii", "spacing", "gradients", "gradient_stops",
    "media", "completeness", "classification_current",
    "classification_absent", "classification_failed", "classification_unsupported",
  ];
  return Object.fromEntries(names.map((name, index) => [name, row?.[index] || 0]));
}

function relationSummary(row) {
  const description = row[8] || "";
  const separator = description.indexOf(":");
  return {
    name: row[0],
    arity: row[1],
    access: row[2],
    keys: row[3],
    nonkeys: row[4],
    description,
    scope: separator > 0 ? description.slice(0, separator) : "",
    group: "live",
    columns: [],
    columnsBundled: false,
  };
}
