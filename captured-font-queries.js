export const CAPTURED_FONT_STATUS_QUERY = String.raw`
active_descriptor[descriptor_schema] :=
  *primary_font_similarity_contract{
    slot: 'active',
    descriptor_schema_id: descriptor_schema
  },
  descriptor_schema =
    'swash-coverage-aware-glyph-hog-rank-blend-v2-experimental'

observed[declared_family, computed_css_stack] :=
  *primary_pin_font_observation{
    capture_id: $capture_id,
    observation_index: $observation_index,
    declared_family,
    computed_css_stack
  }

source[acquisition_index, outcome] :=
  *primary_pin_font_observation_source{
    capture_id: $capture_id,
    observation_index: $observation_index,
    acquisition_index
  },
  *primary_font_source_acquisition{
    capture_id: $capture_id,
    acquisition_index,
    outcome
  }

source_failure[acquisition_index, failure_code] :=
  *primary_font_source_acquisition_failure{
    capture_id: $capture_id,
    acquisition_index,
    failure_code
  }

has_source[declared_family, computed_css_stack] :=
  observed[declared_family, computed_css_stack],
  source[_acquisition_index, _outcome]

has_source_failure[acquisition_index] :=
  source_failure[acquisition_index, _failure_code]

verified_descriptor[acquisition_index] :=
  source[acquisition_index, 'acquired'],
  active_descriptor[descriptor_schema],
  *primary_font_similarity_attempt{
    capture_id: $capture_id,
    acquisition_index,
    content_sha256,
    face_index,
    variation_coordinates,
    descriptor_schema_id: descriptor_schema,
    status: 'verified'
  },
  *primary_font_visual_descriptor{
    content_sha256,
    face_index,
    variation_coordinates,
    descriptor_schema_id: descriptor_schema
  }

state[declared_family, computed_css_stack, acquisition_index, status,
  failure_code] :=
  observed[declared_family, computed_css_stack],
  not has_source[declared_family, computed_css_stack],
  acquisition_index = null,
  status = 'source_not_acquired',
  failure_code = ''

state[declared_family, computed_css_stack, acquisition_index, outcome,
  failure_code] :=
  observed[declared_family, computed_css_stack],
  source[acquisition_index, outcome],
  outcome != 'acquired',
  source_failure[acquisition_index, failure_code]

state[declared_family, computed_css_stack, acquisition_index, outcome,
  failure_code] :=
  observed[declared_family, computed_css_stack],
  source[acquisition_index, outcome],
  outcome != 'acquired',
  not has_source_failure[acquisition_index],
  failure_code = ''

state[declared_family, computed_css_stack, acquisition_index, status,
  failure_code] :=
  observed[declared_family, computed_css_stack],
  source[acquisition_index, 'acquired'],
  not verified_descriptor[acquisition_index],
  status = 'acquired_without_active_descriptor',
  failure_code = ''

state[declared_family, computed_css_stack, acquisition_index, status,
  failure_code] :=
  observed[declared_family, computed_css_stack],
  verified_descriptor[acquisition_index],
  status = 'searchable',
  failure_code = ''

?[capture_id, observation_index, declared_family, computed_css_stack,
  acquisition_index, state, failure_code] :=
  state[declared_family, computed_css_stack, acquisition_index, state,
    failure_code],
  capture_id = $capture_id,
  observation_index = $observation_index

:order acquisition_index
:limit 20
`.trim();

export const CAPTURED_FONT_DETAIL_QUERY = String.raw`
active_descriptor[descriptor_schema] :=
  *primary_font_similarity_contract{
    slot: 'active',
    descriptor_schema_id: descriptor_schema
  },
  descriptor_schema =
    'swash-coverage-aware-glyph-hog-rank-blend-v2-experimental'

acquired_face[max(acquisition_index), content_sha256, face_index,
  variation_coordinates] :=
  *primary_pin_font_observation_source{
    capture_id: $capture_id,
    observation_index: $observation_index,
    acquisition_index
  },
  *primary_font_source_acquisition{
    capture_id: $capture_id,
    acquisition_index,
    content_sha256,
    outcome: 'acquired'
  },
  *primary_font_face_instance{
    content_sha256,
    face_index,
    variation_coordinates
  }

verified_descriptor[content_sha256, face_index, variation_coordinates,
  descriptor_schema] :=
  acquired_face[acquisition_index, content_sha256, face_index,
    variation_coordinates],
  active_descriptor[descriptor_schema],
  *primary_font_similarity_attempt{
    capture_id: $capture_id,
    acquisition_index,
    content_sha256,
    face_index,
    variation_coordinates,
    descriptor_schema_id: descriptor_schema,
    status: 'verified'
  },
  *primary_font_visual_descriptor{
    content_sha256,
    face_index,
    variation_coordinates,
    descriptor_schema_id: descriptor_schema
  }

has_verified_descriptor[content_sha256, face_index, variation_coordinates] :=
  verified_descriptor[content_sha256, face_index, variation_coordinates,
    _descriptor_schema]

absent_descriptor[descriptor_schema] <- [[null]]

descriptor_or_absent[content_sha256, face_index, variation_coordinates,
  descriptor_schema] :=
  verified_descriptor[content_sha256, face_index, variation_coordinates,
    descriptor_schema]

descriptor_or_absent[content_sha256, face_index, variation_coordinates,
  descriptor_schema] :=
  acquired_face[_acquisition_index, content_sha256, face_index,
    variation_coordinates],
  not has_verified_descriptor[content_sha256, face_index,
    variation_coordinates],
  absent_descriptor[descriptor_schema]

latest_metadata_id[content_sha256, face_index, latest_by(metadata_choice)] :=
  *primary_font_face_metadata_observation{
    id,
    content_sha256,
    face_index,
    status: 'verified',
    observed_at
  },
  metadata_choice = [id, [observed_at, id]]

canonical_family[family_id, canonical_family_id] :=
  *primary_font_family_alias{family_id, canonical_family_id}
canonical_family[family_id, family_id] :=
  *primary_family{id: family_id},
  not *primary_font_family_alias{family_id}

absent_family[family_id, family_name] <- [[null, null]]

resolution[content_sha256, face_index, variation_coordinates,
  resolution_state, logical_face_id, canonical_family_id,
  canonical_family_name] :=
  *primary_font_face_resolution{
    content_sha256,
    face_index,
    variation_coordinates,
    logical_face_id,
    state: resolution_state
  },
  logical_face_id != null,
  *primary_font_logical_face{logical_face_id, family_id},
  canonical_family[family_id, canonical_family_id],
  *primary_family{id: canonical_family_id, name: canonical_family_name}

resolution[content_sha256, face_index, variation_coordinates,
  resolution_state, logical_face_id, canonical_family_id,
  canonical_family_name] :=
  *primary_font_face_resolution{
    content_sha256,
    face_index,
    variation_coordinates,
    logical_face_id,
    state: resolution_state
  },
  logical_face_id = null,
  absent_family[canonical_family_id, canonical_family_name]

has_resolution[content_sha256, face_index, variation_coordinates] :=
  *primary_font_face_resolution{
    content_sha256,
    face_index,
    variation_coordinates
  }

resolution[content_sha256, face_index, variation_coordinates,
  resolution_state, logical_face_id, canonical_family_id,
  canonical_family_name] :=
  acquired_face[_acquisition_index, content_sha256, face_index,
    variation_coordinates],
  not has_resolution[content_sha256, face_index, variation_coordinates],
  resolution_state = 'missing',
  logical_face_id = null,
  absent_family[canonical_family_id, canonical_family_name]

?[acquisition_index, content_sha256, face_index, variation_coordinates,
  descriptor_schema_id, metadata_family, metadata_subfamily,
  typographic_family, full_name, postscript_name, vendor_name, version_string,
  axis_count, resolution_state, logical_face_id, canonical_family_id,
  canonical_family_name] :=
  acquired_face[acquisition_index, content_sha256, face_index,
    variation_coordinates],
  descriptor_or_absent[content_sha256, face_index, variation_coordinates,
    descriptor_schema_id],
  latest_metadata_id[content_sha256, face_index, metadata_id],
  *primary_font_face_metadata_observation{
    id: metadata_id,
    family: metadata_family,
    subfamily: metadata_subfamily,
    typographic_family,
    full_name,
    postscript_name,
    vendor_name,
    version_string,
    axis_count
  },
  resolution[content_sha256, face_index, variation_coordinates,
    resolution_state, logical_face_id, canonical_family_id,
    canonical_family_name]

:order acquisition_index, face_index, variation_coordinates
:limit 20
`.trim();

export const CAPTURED_FONT_SIMILARITY_QUERY = String.raw`
active_contract[descriptor_schema] :=
  *primary_font_similarity_contract{
    slot: 'active',
    descriptor_schema_id: descriptor_schema
  },
  descriptor_schema =
    'swash-coverage-aware-glyph-hog-rank-blend-v2-experimental'

canonical_family[family, canonical] :=
  *primary_font_family_alias{family_id: family, canonical_family_id: canonical}
canonical_family[family, family] :=
  *primary_family{id: family},
  not *primary_font_family_alias{family_id: family}

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

target_descriptor_candidate[declared_family, sha, face, coords, coverage,
  metrics, visual] :=
  *primary_pin_font_observation{
    capture_id: $capture_id,
    observation_index: $observation_index,
    declared_family
  },
  *primary_pin_font_observation_source{
    capture_id: $capture_id,
    observation_index: $observation_index,
    acquisition_index
  },
  *primary_font_source_acquisition{
    capture_id: $capture_id,
    acquisition_index,
    content_sha256: sha,
    outcome: 'acquired'
  },
  active_contract[descriptor_schema],
  *primary_font_similarity_attempt{
    capture_id: $capture_id,
    acquisition_index,
    content_sha256: sha,
    face_index: face,
    variation_coordinates: coords,
    descriptor_schema_id: descriptor_schema,
    status: 'verified'
  },
  *primary_font_visual_descriptor{
    content_sha256: sha,
    face_index: face,
    variation_coordinates: coords,
    descriptor_schema_id: descriptor_schema,
    coverage,
    metrics,
    visual_descriptor: visual
  }

target_descriptor_count[count(sha)] :=
  target_descriptor_candidate[_declared_family, sha, _face, _coords,
    _coverage, _metrics, _visual]

target_descriptor[declared_family, sha, coverage, metrics, visual] :=
  target_descriptor_count[1],
  target_descriptor_candidate[declared_family, sha, _face, _coords, coverage,
    metrics, visual]

query_descriptor[coverage, metrics, visual] :=
  target_descriptor[_declared_family, _sha, coverage, metrics, visual]

eligible[canonical, sha, face, coords, axis_evidence, coverage, metrics,
  visual, compatibility, diagnostic] :=
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
  target_descriptor[_target_name, target_sha, _target_coverage,
    _target_metrics, _target_visual],
  sha != target_sha,
  compatibility = 0,
  diagnostic = 'visual_unfiltered_unreranked_role'

ranked[rank, canonical, sha, face, coords, visual_distance, metric_distance,
  common_glyphs, monospace_mismatch, italic_mismatch, compatibility,
  diagnostic] <~
  FontSimilarityBcRankBlendFamilyScan(
    query_descriptor[query_coverage, query_metrics, query_visual],
    eligible[canonical, sha, face, coords, axis_evidence, coverage, metrics,
      visual, compatibility, diagnostic],
    limit: $result_limit,
    max_candidates: 10000
  )

?[rank, target_family, family_id, family_name, content_sha256, face_index,
  variation_coordinates, visual_distance, metric_distance, common_glyphs,
  monospace_mismatch, italic_mismatch] :=
  ranked[rank, family_id, content_sha256, face_index, variation_coordinates,
    visual_distance, metric_distance, common_glyphs, monospace_mismatch,
    italic_mismatch, _compatibility, _diagnostic],
  target_descriptor[target_family, _target_sha, _target_coverage,
    _target_metrics, _target_visual],
  *primary_family{id: family_id, name: family_name}

:sort rank
:limit $result_limit
`.trim();

export const CONFIRMED_FAMILY_USAGE_QUERY = String.raw`
canonical_family[family, canonical] :=
  *primary_font_family_alias{family_id: family, canonical_family_id: canonical}
canonical_family[family, family] :=
  *primary_family{id: family},
  not *primary_font_family_alias{family_id: family}

selected_family[canonical] :=
  *primary_family{id: selected},
  selected = $family_id,
  canonical_family[selected, canonical]

exact_usage[capture_id, observation_index, declared_family,
  usage_evidence] :=
  *primary_pin_font_observation{
    capture_id,
    observation_index,
    declared_family
  },
  *primary_pin_font_observation_source{
    capture_id,
    observation_index,
    acquisition_index
  },
  *primary_font_source_acquisition{
    capture_id,
    acquisition_index,
    content_sha256,
    outcome: 'acquired'
  },
  *primary_font_similarity_attempt{
    capture_id,
    acquisition_index,
    content_sha256,
    face_index,
    variation_coordinates,
    status: 'verified'
  },
  *primary_font_face_resolution{
    content_sha256,
    face_index,
    variation_coordinates,
    logical_face_id,
    state: 'confirmed'
  },
  *primary_font_logical_face{logical_face_id, family_id},
  canonical_family[family_id, canonical_family_id],
  selected_family[canonical_family_id],
  usage_evidence = 'confirmed_captured_face'

has_exact_usage[capture_id] :=
  exact_usage[capture_id, _observation_index, _declared_family,
    _usage_evidence]

historical_usage[capture_id, observation_index, declared_family,
  usage_evidence] :=
  *capture_historical_font_attribution{
    capture_id,
    family_id,
    family_name: declared_family,
    status: 'eligible'
  },
  canonical_family[family_id, canonical_family_id],
  selected_family[canonical_family_id],
  not has_exact_usage[capture_id],
  observation_index = null,
  usage_evidence = 'historical_family_attribution'

usage[capture_id, observation_index, declared_family, usage_evidence] :=
  exact_usage[capture_id, observation_index, declared_family, usage_evidence]

usage[capture_id, observation_index, declared_family, usage_evidence] :=
  historical_usage[capture_id, observation_index, declared_family,
    usage_evidence]

?[capture_id, observation_index, declared_family, usage_evidence] :=
  usage[capture_id, observation_index, declared_family, usage_evidence]

:order -capture_id, observation_index, usage_evidence
:limit $result_limit
`.trim();
