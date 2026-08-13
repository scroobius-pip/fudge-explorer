export const FONT_SIMILARITY_QUERY = String.raw`
active_contract[descriptor_schema] :=
  *primary_font_similarity_contract{
    slot: 'active',
    descriptor_schema_id: descriptor_schema
  },
  descriptor_schema = 'swash-coverage-aware-glyph-hog-rank-blend-v2-experimental'

canonical_family[family, canonical] :=
  *primary_font_family_alias{family_id: family, canonical_family_id: canonical}
canonical_family[family, family] :=
  *primary_family{id: family},
  not *primary_font_family_alias{family_id: family}

target_family[canonical, canonical_name] :=
  *primary_family{id: selected},
  selected = $family_id,
  canonical_family[selected, canonical],
  *primary_family{id: canonical, name: canonical_name}

resolved_instance[sha, face, coords, canonical] :=
  *primary_font_face_resolution{
    content_sha256: sha,
    face_index: face,
    variation_coordinates: coords,
    logical_face_id: logical_face,
    state: 'confirmed'
  },
  *primary_font_logical_face{logical_face_id: logical_face, family_id: family},
  canonical_family[family, canonical]

latest_trait_id[sha, face, coords, latest_by(trait_choice)] :=
  *primary_font_face_trait_observation{
    id: trait_id,
    content_sha256: sha,
    face_index: face,
    variation_coordinates: coords,
    observed_at
  },
  trait_choice = [trait_id, [observed_at, trait_id]]

target_descriptor_choice[smallest_by(choice)] :=
  target_family[canonical, _canonical_name],
  resolved_instance[sha, face, coords, canonical],
  coords = $default_coordinates,
  active_contract[descriptor_schema],
  *primary_font_visual_descriptor{
    content_sha256: sha,
    face_index: face,
    variation_coordinates: coords,
    descriptor_schema_id: descriptor_schema,
    coverage,
    metrics,
    visual_descriptor: visual
  },
  latest_trait_id[sha, face, coords, trait_id],
  *primary_font_face_trait_observation{
    id: trait_id,
    weight_class: weight,
    width_class: width,
    slant
  },
  payload = [coverage, metrics, visual],
  slant_cost = if(slant == 'upright', 0, 1),
  weight_cost = if(is_null(weight), 1000, abs(weight - 400)),
  width_cost = if(is_null(width), 1000, abs(width - 5)),
  cost = [slant_cost, weight_cost, width_cost, sha, face, coords],
  choice = [payload, cost]

query_descriptor[coverage, metrics, visual] :=
  target_descriptor_choice[payload],
  payload != null,
  coverage = get(payload, 0),
  metrics = get(payload, 1),
  visual = get(payload, 2)

eligible[canonical, sha, face, coords, axis_evidence, coverage, metrics, visual,
  compatibility, diagnostic] :=
  active_contract[descriptor_schema],
  *primary_font_visual_descriptor{
    content_sha256: sha,
    face_index: face,
    variation_coordinates: coords,
    descriptor_schema_id: descriptor_schema,
    coverage,
    metrics,
    visual_descriptor: visual
  },
  coords = $default_coordinates,
  axis_evidence = $default_axis_evidence,
  resolved_instance[sha, face, coords, canonical],
  target_family[target_canonical, _target_name],
  canonical != target_canonical,
  compatibility = 0,
  diagnostic = 'visual_unfiltered_unreranked_role'

ranked[rank, canonical, sha, face, coords, visual_distance, metric_distance,
  common_glyphs, monospace_mismatch, italic_mismatch, compatibility, diagnostic] <~
  FontSimilarityBcRankBlendFamilyScan(
    query_descriptor[query_coverage, query_metrics, query_visual],
    eligible[canonical, sha, face, coords, axis_evidence, coverage, metrics, visual,
      compatibility, diagnostic],
    limit: $result_limit,
    max_candidates: 10000
  )

?[rank, target_family_id, target_family_name, family_id, family_name,
  content_sha256, face_index, variation_coordinates, visual_distance,
  metric_distance, common_glyphs, monospace_mismatch, italic_mismatch] :=
  ranked[rank, family_id, content_sha256, face_index, variation_coordinates,
    visual_distance, metric_distance,
    common_glyphs, monospace_mismatch, italic_mismatch, _compatibility,
    _diagnostic],
  target_family[target_family_id, target_family_name],
  *primary_family{id: family_id, name: family_name}

:sort rank
:limit $result_limit
`.trim();

export const CAPTURE_SIMILARITY_TARGET_QUERY = String.raw`
?[retrieval_generation, index_name, model_id, dimensions, distance,
  normalization, media_asset_index, embedding] :=
  *capture_retrieval_active{
    singleton: 'current',
    active_generation_id: retrieval_generation
  },
  *capture_retrieval_generation{
    generation_id: retrieval_generation,
    index_name,
    model_id,
    dimensions,
    distance,
    normalization
  },
  *capture_embedding{
    generation_id: retrieval_generation,
    capture_id: $capture_id,
    media_asset_index,
    modality: 'screenshot',
    embedding
  }

:order media_asset_index
:limit 1
`.trim();

export function captureSimilarityQuery(indexName, resultLimit) {
  if (!/^[A-Za-z_][A-Za-z0-9_]{0,127}$/.test(indexName)) {
    throw new Error("Invalid capture similarity index");
  }
  if (!Number.isSafeInteger(resultLimit) || resultLimit < 1 || resultLimit > 24) {
    throw new Error("Invalid capture similarity limit");
  }
  const candidateLimit = resultLimit + 1;
  return String.raw`
?[capture_id, distance, title, origin, path, captured_at] :=
  *capture_retrieval_active{
    singleton: 'current',
    active_generation_id: retrieval_generation
  },
  ~capture_embedding:${indexName}{
    generation_id: retrieval_generation,
    capture_id |
    query: $query,
    k: ${candidateLimit},
    ef: 64,
    bind_distance: distance
  },
  capture_id != $capture_id,
  *capture{id: capture_id, page_id, title, captured_at},
  *page{id: page_id, domain_id, path},
  *domain{id: domain_id, origin}

:sort distance
:limit ${resultLimit}
`.trim();
}
