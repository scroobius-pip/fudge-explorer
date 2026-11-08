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

evidence[kind, identity, values] :=
  *capture_text_style{
    capture_id: $capture_id, observation_index: identity, declared_family,
    weight, size_milli_px, occurrence_count, generic_family, style,
    line_height_milli_px, letter_spacing_milli_px
  },
  kind = 'text_style',
  values = [declared_family, weight, size_milli_px, occurrence_count,
    generic_family, style, line_height_milli_px, letter_spacing_milli_px]

evidence[kind, identity, values] :=
  *capture_historical_font_attribution{
    capture_id: $capture_id, sub_family_id: identity, family_id, family_name,
    sub_family_name, legacy_link_count, status: 'eligible'
  },
  kind = 'historical_font',
  values = [family_id, family_name, sub_family_name, legacy_link_count]

evidence[kind, identity, values] :=
  *historical_capture_color_observation{
    capture_id: $capture_id, legacy_color_id: identity
  },
  *historical_color_value{legacy_color_id: identity, rgb_integer},
  kind = 'legacy_color',
  values = [rgb_integer]

canonical_font_family[family_id, canonical_family_id] :=
  *primary_font_family_alias{family_id, canonical_family_id}
canonical_font_family[family_id, family_id] :=
  *primary_family{id: family_id},
  not *primary_font_family_alias{family_id}

# The family a captured font observation's own file resolves to through the
# font identity index, so a reader can show "Suisse Intl" for a declared
# "Suisse Intl-99e21c928808656c" without interpreting the name.
evidence[kind, identity, values] :=
  *primary_pin_font_observation{
    capture_id: $capture_id, observation_index: identity, declared_family
  },
  *primary_pin_font_observation_source{
    capture_id: $capture_id, observation_index: identity, acquisition_index
  },
  *primary_font_source_acquisition{
    capture_id: $capture_id, acquisition_index, content_sha256,
    outcome: 'acquired'
  },
  *primary_font_face_resolution{
    content_sha256, logical_face_id, state: 'confirmed'
  },
  *primary_font_logical_face{logical_face_id, family_id},
  canonical_font_family[family_id, canonical_family_id],
  *primary_family{id: canonical_family_id, name: family_name},
  kind = 'font_identity',
  values = [declared_family, canonical_family_id, family_name]

# A reviewed display name for a declared family that carries a bundler hash.
evidence[kind, identity, values] :=
  *primary_pin_font_observation_display_name{
    capture_id: $capture_id, observation_index: identity, display_family,
    raw_family
  },
  kind = 'font_display_name',
  values = [raw_family, display_family]

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
