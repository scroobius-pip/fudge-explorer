import { normalizeObservedFontFamily, observedFontFamilyKey } from "./fonts";
import type {
  CatalogFile,
  CatalogDetailsProjection,
  ColorRole,
  Facet,
  FontUse,
  FontCredit,
  FontMetadata,
  HistoricalFontUse,
  MotionClip,
  PaletteSwatch,
  RawCapture,
  TermRef,
  TextStyle,
  TypeRole,
} from "./types";

type Row = unknown[];
type ExplorerData = {
  observed_generation: number;
  captures: Row[];
  families: Row[];
  designers?: Row[];
  vendors?: Row[];
  terms: Record<string, [string, string, string]>;
  assignments: Row[];
  color_roles: Row[];
  raster_palette?: Row[];
  font_obs: Row[];
  hist_fonts?: Row[];
  type_roles: Row[];
  text_styles?: Row[];
  motion_assets: Row[];
  video_observations: Array<{
    capture_id: number;
    coverage_ppm: number;
  }>;
  classification_runtime?: { ontology_id?: string };
};

type ExplorerBundle = {
  data: ExplorerData;
  legacyColors?: Record<string, number[]>;
};

const FIELD_LIMIT = 480;
let lastProgressValue = -1;
let lastProgressLabel = "";

function reportProgress(value: number, label: string): void {
  const nextValue = Math.max(0, Math.min(100, Math.round(value)));
  if (nextValue === lastProgressValue && label === lastProgressLabel) return;
  lastProgressValue = nextValue;
  lastProgressLabel = label;
  if (typeof window !== "undefined") {
    window.dispatchEvent(
      new CustomEvent("fudge:load-progress", {
        detail: { value: nextValue, label },
      }),
    );
  } else {
    (
      globalThis as unknown as {
        postMessage(message: unknown): void;
      }
    ).postMessage({
      type: "progress",
      value: nextValue,
      label,
    });
  }
}

const FACET_GROUPS: Record<string, string> = {
  page_role: "purpose",
  offering: "purpose",
  industry: "purpose",
  capability: "purpose",
  layout_archetype: "structure",
  layout_shell: "structure",
  layout_feature: "structure",
  component: "structure",
  section_pattern: "structure",
  color_mode: "visual",
  color_hue_family: "visual",
  color_chroma_profile: "visual",
  color_palette_span: "visual",
  density: "visual",
  visual_background: "visual",
  visual_corner: "visual",
  visual_surface: "visual",
  visual_trait: "visual",
  aesthetic: "visual",
  typography_generic: "type_media",
  typography_system_size: "type_media",
  typography_role: "type_media",
  media: "type_media",
  interaction_data_state: "state",
  interaction_task_state: "state",
  interaction_overlay_state: "state",
  interaction_component_state: "state",
};

export type CatalogLoad = {
  initial: CatalogFile;
  details: Promise<CatalogDetailsProjection | null>;
};

export type SemanticSearchResult = {
  captureId: number;
  distance: number;
  title: string;
  origin: string;
  path: string;
};

export async function searchSemanticText(
  query: string,
  signal?: AbortSignal,
): Promise<SemanticSearchResult[]> {
  const response = await fetch("/v1/semantic-search/text", {
    method: "POST",
    headers: {
      accept: "application/json",
      "content-type": "application/json",
    },
    credentials: "omit",
    body: JSON.stringify({ query }),
    signal,
  });
  return semanticSearchResults(response);
}

export async function searchSemanticImage(
  image: File,
  signal?: AbortSignal,
): Promise<SemanticSearchResult[]> {
  const response = await fetch("/v1/semantic-search/image", {
    method: "POST",
    headers: {
      accept: "application/json",
      "content-type": image.type,
    },
    credentials: "omit",
    body: image,
    signal,
  });
  return semanticSearchResults(response);
}

async function semanticSearchResults(
  response: Response,
): Promise<SemanticSearchResult[]> {
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const errorCode =
      isRecord(body) && typeof body.error === "string" ? body.error : "";
    const message =
      response.status === 429
        ? "Too many searches. Try again in a minute."
        : response.status === 413
          ? "Choose an image smaller than 4 MB."
          : response.status === 415
            ? "Choose a JPEG or PNG image."
            : errorCode === "invalid_search_image"
              ? "That image could not be searched."
              : "Semantic search is temporarily unavailable.";
    throw new Error(message);
  }
  if (
    !isRecord(body) ||
    typeof body.observedGeneration !== "number" ||
    !Number.isSafeInteger(body.observedGeneration) ||
    !Array.isArray(body.results) ||
    !body.results.every(validSemanticSearchResult)
  ) {
    throw new Error("Semantic search returned an invalid response.");
  }
  return body.results;
}

function validSemanticSearchResult(
  value: unknown,
): value is SemanticSearchResult {
  return Boolean(
    isRecord(value) &&
    typeof value.captureId === "number" &&
    Number.isSafeInteger(value.captureId) &&
    value.captureId > 0 &&
    typeof value.distance === "number" &&
    Number.isFinite(value.distance) &&
    typeof value.title === "string" &&
    typeof value.origin === "string" &&
    typeof value.path === "string",
  );
}
export type SimilarFontResult = {
  familyId: number;
  familyName: string;
  previewUrl: string;
  visualDistance: number;
};

export async function loadSimilarFonts(
  familyId: number,
  generation: number,
): Promise<SimilarFontResult[]> {
  const response = await fetch(
    `/v1/similar-fonts?familyId=${familyId}&generation=${generation}&limit=8`,
    { headers: { accept: "application/json" }, credentials: "same-origin" },
  );
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(`Similar fonts failed (${response.status})`);
  }
  if (
    !isRecord(body) ||
    !Array.isArray(body.results) ||
    !body.results.every(
      (row): row is SimilarFontResult =>
        isRecord(row) &&
        typeof row.familyId === "number" &&
        Number.isSafeInteger(row.familyId) &&
        row.familyId > 0 &&
        typeof row.familyName === "string" &&
        row.familyName.length > 0 &&
        typeof row.previewUrl === "string" &&
        typeof row.visualDistance === "number" &&
        Number.isFinite(row.visualDistance),
    )
  ) {
    throw new Error("Similar fonts returned an invalid response");
  }
  return body.results;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

export async function loadCatalogFile(): Promise<CatalogLoad> {
  reportProgress(2, "Connecting to the live corpus");
  const bootstrap = await requestBootstrapBundle();
  const generation = bootstrap.data?.observed_generation;
  if (!Number.isSafeInteger(generation) || generation < 1) {
    throw new Error("Fudge returned an invalid corpus generation");
  }

  reportProgress(96, "Building the Explorer field");
  const initial = catalogFromBundles(bootstrap);
  reportProgress(100, "Explorer ready");
  const details = requestBundle(
    `/v1/query?phase=details&generation=${generation}`,
    100,
    100,
    "Downloading search index",
  )
    .then((bundle) =>
      projectCatalogDetails(catalogFromBundles(bootstrap, bundle)),
    )
    .catch(() => null);
  return { initial, details };
}

export function catalogFromBundles(
  bootstrap: ExplorerBundle,
  details?: ExplorerBundle,
): CatalogFile {
  const base = requireData(bootstrap);
  const detail = details ? requireData(details) : undefined;

  const data: ExplorerData = detail
    ? {
        ...base,
        assignments: detail.assignments,
        hist_fonts: detail.hist_fonts,
        text_styles: detail.text_styles,
        observed_generation: base.observed_generation,
      }
    : base;
  const captures = captureRows(data.captures);
  const assignments = assignmentRows(data.assignments);
  const facets = facetRows(data.terms);
  const palettes = paletteRows(data.color_roles, data.raster_palette ?? [], {
    ...(bootstrap.legacyColors ?? {}),
    ...(details?.legacyColors ?? {}),
  });
  const colorRoles = colorRoleRows(data.color_roles);
  const fonts = fontRows(data.font_obs);
  const historicalFonts = historicalFontRows(data.hist_fonts ?? []);
  const fontCatalogIds = familyCatalogIds(data.families);
  const fontMetadata = fontMetadataRows(
    data.families,
    data.designers ?? [],
    data.vendors ?? [],
  );
  const typeRoles = typeRoleRows(data.type_roles);
  const textStyles = textStyleRows(data.text_styles ?? []);
  const mainCaptureIds = selectFieldIds(captures, assignments);
  const mainSet = new Set(mainCaptureIds);
  const typedCaptures = captures.map((capture) => ({
    ...capture,
    kind: mainSet.has(capture.id)
      ? ("primary" as const)
      : ("neighbor" as const),
  }));
  const termCaptureIds = termCaptureIndex(assignments);
  const domainCaptureIds = buildDomainCaptureIndex(typedCaptures);
  const fontCaptureIndex = buildFontCaptureIndex(
    typedCaptures,
    fonts,
    historicalFonts,
    typeRoles,
    textStyles,
    fontCatalogIds,
  );

  return {
    generation: data.observed_generation,
    ontologyId:
      data.classification_runtime?.ontology_id ??
      "active-capture-classification",
    captures: typedCaptures,
    mainCaptureIds,
    pivotIds: mainCaptureIds.slice(0, 8),
    facets,
    assignments,
    termCaptureIds,
    domainCaptureIds,
    fontCaptureIndex,
    searchTextByCapture: buildSearchTextIndex(
      typedCaptures,
      assignments,
      facets,
      fonts,
      historicalFonts,
      typeRoles,
      textStyles,
    ),
    palettes,
    colorRoles,
    fonts,
    historicalFonts,
    fontCatalogIds,
    fontMetadata,
    typeRoles,
    textStyles,
    motion: motionRows(data.motion_assets),
    pageVideo: pageVideoRows(data.video_observations ?? []),
    embeddingNeighbors: {},
    fontSimilarity: {},
  };
}

function projectCatalogDetails(catalog: CatalogFile): CatalogDetailsProjection {
  return {
    assignments: catalog.assignments,
    termCaptureIds: catalog.termCaptureIds,
    palettes: catalog.palettes,
    colorRoles: catalog.colorRoles,
    fonts: catalog.fonts,
    typeRoles: catalog.typeRoles,
    fontCaptureIndex: catalog.fontCaptureIndex,
    searchTextByCapture: catalog.searchTextByCapture,
  };
}

async function requestBootstrapBundle(): Promise<ExplorerBundle> {
  return requestBundle(
    "/v1/query?phase=bootstrap",
    5,
    79,
    "Downloading corpus index",
  );
}

async function requestBundle(
  path: string,
  progressStart: number,
  progressEnd: number,
  progressLabel: string,
): Promise<ExplorerBundle> {
  const response = await fetch(path, {
    headers: { accept: "application/json" },
    credentials: "same-origin",
  });
  await requireSuccessfulResponse(response);
  if (!response.body) return response.json() as Promise<ExplorerBundle>;

  const reader = response.body.getReader();
  const artifactEncoding = response.headers.get("x-fudge-artifact-encoding");
  const total =
    Number(
      response.headers.get(
        artifactEncoding
          ? "x-fudge-compressed-content-length"
          : "x-uncompressed-content-length",
      ),
    ) ||
    Number(response.headers.get("content-length")) ||
    0;
  let loaded = 0;
  const chunks: Uint8Array[] = [];
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    loaded += value.byteLength;
    const ratio = total > 0 ? Math.min(1, loaded / total) : 0.5;
    reportProgress(
      progressStart + (progressEnd - progressStart) * ratio,
      progressLabel,
    );
  }
  let bytes = joinBytes(chunks, loaded);
  if (artifactEncoding === "gzip" || (bytes[0] === 0x1f && bytes[1] === 0x8b)) {
    const compressed = new Uint8Array(bytes.byteLength);
    compressed.set(bytes);
    const body = new Response(compressed.buffer).body;
    if (!body) throw new Error("Fudge returned an invalid corpus artifact");
    bytes = new Uint8Array(
      await new Response(
        body.pipeThrough(new DecompressionStream("gzip")),
      ).arrayBuffer(),
    );
  }
  return JSON.parse(new TextDecoder().decode(bytes)) as ExplorerBundle;
}

async function requireSuccessfulResponse(response: Response): Promise<void> {
  if (response.ok) return;
  if (response.status === 409) throw new GenerationChangedError();
  let detail = "";
  try {
    const body = (await response.json()) as { detail?: string; error?: string };
    detail = body.detail ?? body.error ?? "";
  } catch {
    detail = await response.text().catch(() => "");
  }
  throw new Error(
    `Fudge Explorer request failed (${response.status})${detail ? `: ${detail}` : ""}`,
  );
}

function joinBytes(chunks: Uint8Array[], total: number): Uint8Array {
  const joined = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    joined.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return joined;
}

function requireData(bundle: ExplorerBundle): ExplorerData {
  if (!bundle || !bundle.data || !Array.isArray(bundle.data.captures ?? [])) {
    throw new Error("Fudge returned an invalid Explorer bundle");
  }
  return bundle.data;
}

function captureRows(rows: Row[]): Omit<RawCapture, "kind">[] {
  return rows.flatMap((row) => {
    const id = asNumber(row[0]);
    const origin = asString(row[1]);
    if (!Number.isSafeInteger(id) || id < 1 || !origin) return [];
    const path = asString(row[2]) || "/";
    return [
      {
        id,
        origin,
        path,
        title: asString(row[3]) || hostOf(origin),
        capturedAt: nullableNumber(row[4]),
        image: asString(row[5]) || `https://pin.fontofweb.com/${id}`,
        device: nullableString(row[6]),
        theme: nullableString(row[7]),
        state: nullableString(row[8]),
        viewportWidth: nullableNumber(row[11]),
        viewportHeight: nullableNumber(row[12]),
        imageWidth: nullableNumber(row[18]) ?? nullableNumber(row[14]),
        imageHeight: nullableNumber(row[19]) ?? nullableNumber(row[15]),
        pageUrl: pageUrl(origin, path),
      },
    ];
  });
}

function assignmentRows(rows: Row[]): Record<string, TermRef[]> {
  const grouped: Record<string, TermRef[]> = {};
  for (const row of rows) {
    const captureId = asNumber(row[0]);
    const term = asString(row[1]);
    if (!Number.isSafeInteger(captureId) || !term) continue;
    (grouped[captureId] ??= []).push({
      term,
      confidence: asNumber(row[2]) || 0,
    });
  }
  return grouped;
}

function buildDomainCaptureIndex(
  captures: RawCapture[],
): Record<string, number[]> {
  const grouped: Record<string, number[]> = {};
  for (const capture of captures) {
    (grouped[capture.origin] ??= []).push(capture.id);
  }
  return grouped;
}

function termCaptureIndex(
  assignments: Record<string, TermRef[]>,
): Record<string, number[]> {
  const grouped: Record<string, number[]> = {};
  for (const [captureIdText, rows] of Object.entries(assignments)) {
    const captureId = Number(captureIdText);
    if (!Number.isSafeInteger(captureId)) continue;
    for (const row of rows) (grouped[row.term] ??= []).push(captureId);
  }
  return grouped;
}

function captureFontFamilies(
  captureId: number,
  fonts: Record<string, FontUse[]>,
  historicalFonts: Record<string, HistoricalFontUse[]>,
  typeRoles: Record<string, TypeRole[]>,
  textStyles: Record<string, TextStyle[]>,
): string[] {
  const key = String(captureId);
  return [
    ...new Set(
      [
        ...(fonts[key] ?? []).map((row) => row.family),
        ...(historicalFonts[key] ?? []).map((row) => row.family),
        ...(typeRoles[key] ?? []).map((row) => row.family),
        ...(textStyles[key] ?? []).flatMap((row) =>
          row.family ? [row.family] : [],
        ),
      ]
        .map(normalizeObservedFontFamily)
        .filter(Boolean),
    ),
  ];
}

function buildFontCaptureIndex(
  captures: RawCapture[],
  fonts: Record<string, FontUse[]>,
  historicalFonts: Record<string, HistoricalFontUse[]>,
  typeRoles: Record<string, TypeRole[]>,
  textStyles: Record<string, TextStyle[]>,
  fontCatalogIds: Record<string, number[]>,
): CatalogFile["fontCaptureIndex"] {
  const grouped = new Map<
    string,
    { name: string; ids: number[]; catalogIds: number[] }
  >();
  for (const capture of captures) {
    for (const family of captureFontFamilies(
      capture.id,
      fonts,
      historicalFonts,
      typeRoles,
      textStyles,
    )) {
      const key = observedFontFamilyKey(family);
      const entry = grouped.get(key) ?? {
        name: family,
        ids: [],
        catalogIds: fontCatalogIds[key] ?? [],
      };
      entry.ids.push(capture.id);
      grouped.set(key, entry);
    }
  }
  return Object.fromEntries(grouped);
}

function buildSearchTextIndex(
  captures: RawCapture[],
  assignments: Record<string, TermRef[]>,
  facets: Facet[],
  fonts: Record<string, FontUse[]>,
  historicalFonts: Record<string, HistoricalFontUse[]>,
  typeRoles: Record<string, TypeRole[]>,
  textStyles: Record<string, TextStyle[]>,
): Record<string, string> {
  const termLabels = new Map(
    facets.flatMap((facet) =>
      facet.terms.map((term) => [term.id, term.label] as const),
    ),
  );
  return Object.fromEntries(
    captures.map((capture) => [
      capture.id,
      [
        capture.title,
        capture.origin,
        capture.path,
        ...(assignments[capture.id] ?? []).map(
          (row) => termLabels.get(row.term) ?? row.term,
        ),
        ...captureFontFamilies(
          capture.id,
          fonts,
          historicalFonts,
          typeRoles,
          textStyles,
        ),
      ]
        .join(" ")
        .toLocaleLowerCase("en-US"),
    ]),
  );
}

function selectFieldIds(
  captures: Omit<RawCapture, "kind">[],
  assignments: Record<string, TermRef[]>,
): number[] {
  const ranked = [...captures].sort((a, b) => {
    const aClassified = assignments[a.id]?.length ? 1 : 0;
    const bClassified = assignments[b.id]?.length ? 1 : 0;
    return (
      bClassified - aClassified ||
      (b.capturedAt ?? 0) - (a.capturedAt ?? 0) ||
      b.id - a.id
    );
  });
  const selected: number[] = [];
  const selectedSet = new Set<number>();
  const origins = new Set<string>();

  for (const capture of ranked) {
    if (selected.length >= FIELD_LIMIT) break;
    if (origins.has(capture.origin)) continue;
    origins.add(capture.origin);
    selected.push(capture.id);
    selectedSet.add(capture.id);
  }
  for (const capture of ranked) {
    if (selected.length >= FIELD_LIMIT) break;
    if (selectedSet.has(capture.id)) continue;
    selected.push(capture.id);
    selectedSet.add(capture.id);
  }
  return selected;
}

function facetRows(terms: Record<string, [string, string, string]>): Facet[] {
  const grouped = new Map<string, Facet>();
  for (const [id, row] of Object.entries(terms ?? {})) {
    const label = asString(row?.[0]) || humanize(id);
    const definition = asString(row?.[1]);
    const facetId = asString(row?.[2]) || "other";
    const facet = grouped.get(facetId) ?? {
      id: facetId,
      label: humanize(facetId),
      cardinality: "many",
      definition: "",
      group: FACET_GROUPS[facetId] ?? "visual",
      terms: [],
    };
    facet.terms.push({ id, label, parent: null, status: "active" });
    if (!facet.definition && definition) facet.definition = definition;
    grouped.set(facetId, facet);
  }
  return [...grouped.values()]
    .map((facet) => ({
      ...facet,
      terms: facet.terms.sort((a, b) => a.label.localeCompare(b.label)),
    }))
    .sort((a, b) => a.label.localeCompare(b.label));
}

function paletteRows(
  roleRows: Row[],
  rasterRows: Row[],
  legacyColors: Record<string, number[]>,
): Record<string, PaletteSwatch[]> {
  const raw = new Map<
    number,
    Array<{ r: number; g: number; b: number; count: number; rank: number }>
  >();
  const rasterCaptures = new Set<number>();
  for (const row of rasterRows) {
    const captureId = asNumber(row[0]);
    const rank = asNumber(row[1]);
    const r = asNumber(row[2]);
    const g = asNumber(row[3]);
    const b = asNumber(row[4]);
    const alpha = asNumber(row[5]);
    const coverage = asNumber(row[6]);
    if (
      !Number.isSafeInteger(captureId) ||
      ![rank, r, g, b, alpha, coverage].every(Number.isFinite) ||
      alpha <= 0 ||
      coverage <= 0
    ) {
      continue;
    }
    (raw.get(captureId) ?? raw.set(captureId, []).get(captureId)!).push({
      r: clampByte(r),
      g: clampByte(g),
      b: clampByte(b),
      count: Math.max(1, Math.round(coverage * Math.min(1, alpha / 1_000_000))),
      rank,
    });
    rasterCaptures.add(captureId);
  }

  for (const row of roleRows) {
    const captureId = asNumber(row[0]);
    if (rasterCaptures.has(captureId)) continue;
    const r = asNumber(row[2]);
    const g = asNumber(row[3]);
    const b = asNumber(row[4]);
    if (![captureId, r, g, b].every(Number.isFinite)) continue;
    (raw.get(captureId) ?? raw.set(captureId, []).get(captureId)!).push({
      r: clampByte(r),
      g: clampByte(g),
      b: clampByte(b),
      count: Math.max(1, asNumber(row[6]) || 1),
      rank: asNumber(row[7]) || 0,
    });
  }

  for (const [captureIdText, colors] of Object.entries(legacyColors)) {
    const captureId = Number(captureIdText);
    if (!Number.isSafeInteger(captureId) || !Array.isArray(colors)) continue;
    const values = raw.get(captureId) ?? [];
    colors.forEach((rgb, index) => {
      if (!Number.isSafeInteger(rgb) || rgb < 0 || rgb > 0xffffff) return;
      values.push({
        r: (rgb >> 16) & 0xff,
        g: (rgb >> 8) & 0xff,
        b: rgb & 0xff,
        count: 1,
        rank: 100 + index,
      });
    });
    raw.set(captureId, values);
  }

  const grouped: Record<string, PaletteSwatch[]> = {};
  for (const [captureId, swatches] of raw) {
    const deduped = new Map<
      string,
      { r: number; g: number; b: number; count: number; rank: number }
    >();
    for (const swatch of swatches) {
      const key = `${swatch.r},${swatch.g},${swatch.b}`;
      const current = deduped.get(key);
      if (current) {
        current.count += swatch.count;
        current.rank = Math.min(current.rank, swatch.rank);
      } else {
        deduped.set(key, { ...swatch });
      }
    }
    const selected = [...deduped.values()]
      .sort((a, b) => a.rank - b.rank || b.count - a.count)
      .slice(0, 24);
    const total = selected.reduce((sum, swatch) => sum + swatch.count, 0) || 1;
    grouped[captureId] = selected.map((swatch) => ({
      r: swatch.r,
      g: swatch.g,
      b: swatch.b,
      coverage: Math.round((swatch.count / total) * 1_000_000),
    }));
  }
  return grouped;
}

function colorRoleRows(rows: Row[]): Record<string, ColorRole[]> {
  const grouped = new Map<
    number,
    Map<string, { rank: number; value: ColorRole }>
  >();
  for (const row of rows) {
    const captureId = asNumber(row[0]);
    const role = asString(row[1]);
    if (!Number.isSafeInteger(captureId) || !role) continue;
    const byRole = grouped.get(captureId) ?? new Map();
    const rank = asNumber(row[7]) || 0;
    const current = byRole.get(role);
    if (!current || rank < current.rank) {
      byRole.set(role, {
        rank,
        value: {
          role,
          r: clampByte(asNumber(row[2])),
          g: clampByte(asNumber(row[3])),
          b: clampByte(asNumber(row[4])),
        },
      });
    }
    grouped.set(captureId, byRole);
  }
  return Object.fromEntries(
    [...grouped].map(([captureId, roles]) => [
      captureId,
      [...roles.values()]
        .sort((a, b) => a.rank - b.rank)
        .map((row) => row.value),
    ]),
  );
}

function fontRows(rows: Row[]): Record<string, FontUse[]> {
  const grouped = new Map<number, Map<string, FontUse>>();
  for (const row of rows) {
    const captureId = asNumber(row[0]);
    const family = normalizeObservedFontFamily(asString(row[2]));
    if (!Number.isSafeInteger(captureId) || !family) continue;
    const byFamily = grouped.get(captureId) ?? new Map<string, FontUse>();
    const key = observedFontFamilyKey(family);
    const share = Math.max(0, asNumber(row[6]) || 0);
    const occurrences = Math.max(0, asNumber(row[7]) || 0);
    const current = byFamily.get(key);
    if (current) {
      current.weightMin = Math.min(
        current.weightMin,
        asNumber(row[4]) || current.weightMin,
      );
      current.weightMax = Math.max(
        current.weightMax,
        asNumber(row[5]) || current.weightMax,
      );
      current.share += share;
      current.occurrences += occurrences;
    } else {
      byFamily.set(key, {
        observationIndex: Math.max(0, asNumber(row[1]) || 0),
        family,
        weightMin: asNumber(row[4]) || 400,
        weightMax: asNumber(row[5]) || asNumber(row[4]) || 400,
        share,
        occurrences,
      });
    }
    grouped.set(captureId, byFamily);
  }
  return Object.fromEntries(
    [...grouped].map(([id, values]) => [
      id,
      [...values.values()].sort((a, b) => b.share - a.share),
    ]),
  );
}

function historicalFontRows(rows: Row[]): Record<string, HistoricalFontUse[]> {
  const grouped: Record<string, HistoricalFontUse[]> = {};
  const seen = new Set<string>();
  for (const row of rows) {
    const captureId = asNumber(row[0]);
    const familyId = asNumber(row[1]);
    const family = normalizeObservedFontFamily(asString(row[2]));
    const subfamily = asString(row[3]) || "Regular";
    if (
      !Number.isSafeInteger(captureId) ||
      !Number.isSafeInteger(familyId) ||
      !family
    ) {
      continue;
    }
    const key = `${captureId}:${familyId}:${subfamily}`;
    if (seen.has(key)) continue;
    seen.add(key);
    (grouped[captureId] ??= []).push({
      familyId,
      family,
      subfamily,
      links: Math.max(0, asNumber(row[4]) || 0),
    });
  }
  return grouped;
}

function familyCatalogIds(rows: Row[]): Record<string, number[]> {
  const grouped: Record<string, number[]> = {};
  for (const row of rows) {
    const familyId = asNumber(row[0]);
    const name = normalizeObservedFontFamily(asString(row[1]));
    if (!Number.isSafeInteger(familyId) || !name) continue;
    const key = observedFontFamilyKey(name);
    (grouped[key] ??= []).push(familyId);
  }
  for (const ids of Object.values(grouped)) ids.sort((a, b) => a - b);
  return grouped;
}
function fontMetadataRows(
  rows: Row[],
  designerRows: Row[],
  foundryRows: Row[],
): Record<string, FontMetadata> {
  const credits = (source: Row[]) =>
    new Map<number, FontCredit>(
      source.flatMap((row) => {
        const id = asNumber(row[0]);
        const name = asString(row[1]).trim();
        if (!Number.isSafeInteger(id) || id < 1 || !name) return [];
        return [[id, { id, name, url: asString(row[2]).trim() || null }]];
      }),
    );
  const designers = credits(designerRows);
  const foundries = credits(foundryRows);
  const grouped: Record<string, FontMetadata> = {};
  for (const row of rows) {
    const familyId = asNumber(row[0]);
    const name = normalizeObservedFontFamily(asString(row[1]));
    if (!Number.isSafeInteger(familyId) || familyId < 1 || !name) continue;
    const key = observedFontFamilyKey(name);
    const entry = (grouped[key] ??= {
      familyIds: [],
      designers: [],
      foundries: [],
    });
    if (!entry.familyIds.includes(familyId)) entry.familyIds.push(familyId);
    const designer = designers.get(asNumber(row[2]));
    if (designer && !entry.designers.some((item) => item.id === designer.id)) {
      entry.designers.push(designer);
    }
    const foundry = foundries.get(asNumber(row[3]));
    if (foundry && !entry.foundries.some((item) => item.id === foundry.id)) {
      entry.foundries.push(foundry);
    }
  }
  for (const entry of Object.values(grouped)) {
    entry.familyIds.sort((a, b) => a - b);
    entry.designers.sort((a, b) => a.name.localeCompare(b.name));
    entry.foundries.sort((a, b) => a.name.localeCompare(b.name));
  }
  return grouped;
}

function typeRoleRows(rows: Row[]): Record<string, TypeRole[]> {
  const grouped = new Map<
    number,
    Map<string, { rank: number; value: TypeRole }>
  >();
  for (const row of rows) {
    const captureId = asNumber(row[0]);
    const role = asString(row[1]);
    const family = asString(row[2]);
    if (!Number.isSafeInteger(captureId) || !role || !family) continue;
    const byRole = grouped.get(captureId) ?? new Map();
    const rank = asNumber(row[7]) || 0;
    const current = byRole.get(role);
    if (!current || rank < current.rank) {
      byRole.set(role, {
        rank,
        value: {
          role,
          family,
          weight: asNumber(row[3]) || 400,
          size: asNumber(row[4]) || 0,
        },
      });
    }
    grouped.set(captureId, byRole);
  }
  return Object.fromEntries(
    [...grouped].map(([id, roles]) => [
      id,
      [...roles.values()]
        .sort((a, b) => a.rank - b.rank)
        .map((row) => row.value),
    ]),
  );
}

function textStyleRows(rows: Row[]): Record<string, TextStyle[]> {
  const grouped: Record<string, TextStyle[]> = {};
  for (const row of rows) {
    const captureId = asNumber(row[0]);
    const family = normalizeObservedFontFamily(asString(row[1])) || null;
    if (!Number.isSafeInteger(captureId)) continue;
    (grouped[captureId] ??= []).push({
      family,
      generic: asString(row[6]) || "unknown",
      weight: asNumber(row[2]) || 400,
      style: asString(row[7]) || "normal",
      size: asNumber(row[3]) || 0,
      lineHeight: nullableNumber(row[8]),
      letterSpacing: nullableNumber(row[9]),
      occurrences: Math.max(0, asNumber(row[4]) || 0),
    });
  }
  for (const styles of Object.values(grouped)) {
    styles.sort((a, b) => b.occurrences - a.occurrences || b.size - a.size);
  }
  return grouped;
}

function motionRows(rows: Row[]): Record<string, MotionClip> {
  const grouped: Record<string, MotionClip> = {};
  for (const row of rows) {
    const captureId = asNumber(row[0]);
    const url = asString(row[1]);
    if (!Number.isSafeInteger(captureId) || !url) continue;
    grouped[captureId] = {
      url,
      mediaType: asString(row[2]) || "video/webm",
      bytes: Math.max(0, asNumber(row[3]) || 0),
      durationMs: Math.max(0, asNumber(row[4]) || 0),
      width: Math.max(0, asNumber(row[5]) || 0),
      height: Math.max(0, asNumber(row[6]) || 0),
    };
  }
  return grouped;
}

function pageVideoRows(
  rows: Array<{ capture_id: number; coverage_ppm: number }>,
): Record<string, { count: number; maxCoverage: number }> {
  const grouped: Record<string, { count: number; maxCoverage: number }> = {};
  for (const row of rows) {
    if (!Number.isSafeInteger(row.capture_id)) continue;
    const current = grouped[row.capture_id] ?? { count: 0, maxCoverage: 0 };
    current.count += 1;
    current.maxCoverage = Math.max(current.maxCoverage, row.coverage_ppm || 0);
    grouped[row.capture_id] = current;
  }
  return grouped;
}

function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function nullableString(value: unknown): string | null {
  const text = asString(value);
  return text || null;
}

function asNumber(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function nullableNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function clampByte(value: number): number {
  return Math.max(0, Math.min(255, Math.round(value)));
}

function humanize(value: string): string {
  return value
    .replace(/[._-]+/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function hostOf(origin: string): string {
  try {
    return new URL(origin).hostname.replace(/^www\./, "");
  } catch {
    return origin;
  }
}

function pageUrl(origin: string, path: string): string {
  try {
    return new URL(path || "/", origin).href;
  } catch {
    return origin;
  }
}

class GenerationChangedError extends Error {}
