export const FAMILY_FONT_SOURCE_QUERY = String.raw`
release_choice[latest_by(choice)] :=
  *primary_font_release{
    source_adapter_id: 'google-fonts-v1',
    upstream_release_id: release_id,
    upstream_revision: revision,
    family_id: $family_id,
    authoritative_url,
    recorded_at: release_recorded_at
  },
  choice = [[release_id, revision, authoritative_url, release_recorded_at],
    [release_recorded_at, revision, release_id]]

selected_release[release_id, revision, authoritative_url,
                 release_recorded_at] :=
  release_choice[payload],
  payload != null,
  release_id = get(payload, 0),
  revision = get(payload, 1),
  authoritative_url = get(payload, 2),
  release_recorded_at = get(payload, 3)

latest_trait[sha, face, coords, latest_by(choice)] :=
  *primary_font_face_trait_observation{
    id: trait_id,
    content_sha256: sha,
    face_index: face,
    variation_coordinates: coords,
    weight_class: weight,
    width_class: width,
    slant,
    observed_at
  },
  choice = [[weight, width, slant, observed_at], [observed_at, trait_id]]

source_choice[smallest_by(choice)] :=
  selected_release[release_id, revision, authoritative_url,
    release_recorded_at],
  *primary_font_artifact{
    source_adapter_id: 'google-fonts-v1',
    upstream_release_id: release_id,
    upstream_revision: revision,
    content_sha256: sha,
    upstream_path,
    byte_length
  },
  *primary_font_face_resolution{
    content_sha256: sha,
    face_index: face,
    variation_coordinates: coords,
    logical_face_id: logical_face,
    state: 'confirmed'
  },
  face = 0,
  coords = $default_coordinates,
  *primary_font_logical_face{
    logical_face_id: logical_face,
    family_id: $family_id
  },
  latest_trait[sha, face, coords, traits],
  traits != null,
  weight = get(traits, 0),
  width = get(traits, 1),
  slant = get(traits, 2),
  observed_at = get(traits, 3),
  slant_cost = if(slant == 'upright', 0, 1),
  weight_cost = if(is_null(weight), 1000, abs(weight - 400)),
  width_cost = if(is_null(width), 1000, abs(width - 5)),
  payload = [release_id, revision, authoritative_url, release_recorded_at,
    upstream_path, sha, byte_length, face, coords, weight, width, slant,
    observed_at],
  cost = [slant_cost, weight_cost, width_cost, upstream_path, sha],
  choice = [payload, cost]

?[source_adapter_id, upstream_release_id, upstream_revision,
  authoritative_url, release_recorded_at, upstream_path, content_sha256,
  byte_length, face_index, variation_coordinates, weight_class, width_class,
  slant, trait_observed_at] :=
  source_choice[payload],
  payload != null,
  source_adapter_id = 'google-fonts-v1',
  upstream_release_id = get(payload, 0),
  upstream_revision = get(payload, 1),
  authoritative_url = get(payload, 2),
  release_recorded_at = get(payload, 3),
  upstream_path = get(payload, 4),
  content_sha256 = get(payload, 5),
  byte_length = get(payload, 6),
  face_index = get(payload, 7),
  variation_coordinates = get(payload, 8),
  weight_class = get(payload, 9),
  width_class = get(payload, 10),
  slant = get(payload, 11),
  trait_observed_at = get(payload, 12)

:limit 1
`.trim();
