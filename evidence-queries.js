export const CAPTURE_EVIDENCE_QUERY = String.raw`
evidence[kind, identity, values] :=
  *capture_border_observation{
    capture_id: $capture_id, observation_index: identity, structure_id,
    structure_observation_index, side, width_milli_px, style, r, g, b,
    alpha_ppm, occurrence_count, evidence_kind
  },
  kind = 'border',
  values = [structure_id, structure_observation_index, side, width_milli_px,
    style, r, g, b, alpha_ppm, occurrence_count, evidence_kind]

evidence[kind, identity, values] :=
  *capture_shadow_observation{
    capture_id: $capture_id, observation_index: identity, structure_id,
    structure_observation_index, inset, offset_x_milli_px, offset_y_milli_px,
    blur_milli_px, spread_milli_px, r, g, b, alpha_ppm, occurrence_count,
    evidence_kind
  },
  kind = 'shadow',
  values = [structure_id, structure_observation_index, inset,
    offset_x_milli_px, offset_y_milli_px, blur_milli_px, spread_milli_px,
    r, g, b, alpha_ppm, occurrence_count, evidence_kind]

evidence[kind, identity, values] :=
  *capture_radius_observation{
    capture_id: $capture_id, observation_index: identity, value_milli_px,
    occurrence_count, evidence_kind
  },
  kind = 'radius',
  values = [value_milli_px, occurrence_count, evidence_kind]

evidence[kind, identity, values] :=
  *capture_spacing_observation{
    capture_id: $capture_id, observation_index: identity, use_kind,
    value_milli_px, occurrence_count, evidence_kind
  },
  kind = 'spacing',
  values = [use_kind, value_milli_px, occurrence_count, evidence_kind]

evidence[kind, identity, values] :=
  *capture_media_observation{
    capture_id: $capture_id, observation_index: identity, media_kind,
    x_q, y_q, width_q, height_q, coverage_ppm, occurrence_count, evidence_kind
  },
  kind = 'media',
  values = [media_kind, x_q, y_q, width_q, height_q, coverage_ppm,
    occurrence_count, evidence_kind]

evidence[kind, identity, values] :=
  *capture_profile_completeness{
    capture_id: $capture_id, family: identity, status,
    observed_candidate_count, retained_count, truncated_count, reason_code
  },
  kind = 'completeness',
  values = [status, observed_candidate_count, retained_count, truncated_count,
    reason_code]

evidence[kind, identity, values] :=
  *capture_gradient_stop{
    capture_id: $capture_id, gradient_id, stop_index, r, g, b, alpha_ppm,
    position_ppm
  },
  kind = 'gradient_stop',
  identity = [gradient_id, stop_index],
  values = [r, g, b, alpha_ppm, position_ppm]

?[kind, identity, values] := evidence[kind, identity, values]

:order kind, identity
:limit 2000
`.trim();

export const TERM_VALUES_QUERY = String.raw`
base[capture_id, assignment_scope, confidence, resolution_kind, attempt_id] :=
  *resolved_capture_term{
    capture_id,
    term_id: $term_id,
    source_attempt_id: attempt_id,
    assignment_scope,
    confidence,
    resolution_kind
  }

support[capture_id, assignment_scope, confidence, resolution_kind,
  evidence_index, evidence_kind, support_kind, support_index] :=
  base[capture_id, assignment_scope, confidence, resolution_kind, attempt_id],
  *capture_term_evidence{
    capture_id, attempt_id, term_id: $term_id, assignment_scope,
    evidence_index, evidence_kind, support_kind, support_index
  }

value[capture_id, assignment_scope, confidence, resolution_kind,
  evidence_index, evidence_kind, support_kind, support_index, values] :=
  support[capture_id, assignment_scope, confidence, resolution_kind,
    evidence_index, evidence_kind, support_kind, support_index],
  support_kind = 'text_style',
  *capture_text_style{
    capture_id, observation_index: support_index, declared_family,
    generic_family, weight, style, size_milli_px, line_height_milli_px,
    letter_spacing_milli_px, r, g, b, alpha_ppm, occurrence_count
  },
  values = [declared_family, generic_family, weight, style, size_milli_px,
    line_height_milli_px, letter_spacing_milli_px, r, g, b, alpha_ppm,
    occurrence_count]

value[capture_id, assignment_scope, confidence, resolution_kind,
  evidence_index, evidence_kind, support_kind, support_index, values] :=
  support[capture_id, assignment_scope, confidence, resolution_kind,
    evidence_index, evidence_kind, support_kind, support_index],
  support_kind = 'background_property',
  *capture_background_property{
    capture_id, observation_index: support_index, r, g, b, alpha_ppm,
    occurrence_count
  },
  values = [r, g, b, alpha_ppm, occurrence_count]

value[capture_id, assignment_scope, confidence, resolution_kind,
  evidence_index, evidence_kind, support_kind, support_index, values] :=
  support[capture_id, assignment_scope, confidence, resolution_kind,
    evidence_index, evidence_kind, support_kind, support_index],
  support_kind = 'raster_palette_color',
  *capture_raster_palette_color{
    capture_id, observation_index: support_index, r, g, b, alpha_ppm,
    coverage_ppm, occurrence_count
  },
  values = [r, g, b, alpha_ppm, coverage_ppm, occurrence_count]

value[capture_id, assignment_scope, confidence, resolution_kind,
  evidence_index, evidence_kind, support_kind, support_index, values] :=
  support[capture_id, assignment_scope, confidence, resolution_kind,
    evidence_index, evidence_kind, support_kind, support_index],
  support_kind = 'structure_observation',
  *capture_structure_observation{
    capture_id, observation_index: support_index, declared_kind, x_q, y_q,
    width_q, height_q, coverage_ppm, occurrence_count
  },
  values = [declared_kind, x_q, y_q, width_q, height_q, coverage_ppm,
    occurrence_count]

?[capture_id, assignment_scope, confidence, resolution_kind, evidence_index,
  evidence_kind, support_kind, support_index, values] :=
  value[capture_id, assignment_scope, confidence, resolution_kind,
    evidence_index, evidence_kind, support_kind, support_index, values]

:order capture_id, evidence_index
:limit 2000
`.trim();
