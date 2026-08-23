import { loadSimilarFonts } from "./api";
import {
  loadCatalogInWorker,
  loadCaptureEvidenceInWorker,
  type CaptureEvidenceRow,
} from "./corpus-client";
import { normalizeObservedFontFamily, observedFontFamilyKey } from "./fonts";
import type {
  Capture,
  ColorRole,
  Facet,
  FacetTerm,
  FontUse,
  HistoricalFontUse,
  FieldFilter,
  FieldView,
  LensId,
  MotionClip,
  PaletteSwatch,
  RawCapture,
  SearchHit,
  TermRef,
  TypeRole,
  TextStyle,
} from "./types";

const catalogLoad = await loadCatalogInWorker();
const data = catalogLoad.initial;

export type CatalogDetailsStatus = "loading" | "ready" | "failed";
let catalogDetailsStatus: CatalogDetailsStatus = "loading";

export function readCatalogDetailsStatus(): CatalogDetailsStatus {
  return catalogDetailsStatus;
}

const VIEW_LIMIT = 480;
export const LENS_GROUPS: { id: LensId; label: string; facets: string[] }[] = [
  { id: "all", label: "All", facets: [] },
  {
    id: "purpose",
    label: "Purpose",
    facets: ["page_role", "offering", "industry", "capability"],
  },
  {
    id: "structure",
    label: "Structure",
    facets: [
      "layout_archetype",
      "layout_shell",
      "layout_feature",
      "component",
      "section_pattern",
    ],
  },
  {
    id: "visual",
    label: "Visual",
    facets: [
      "color_mode",
      "color_hue_family",
      "color_chroma_profile",
      "color_palette_span",
      "density",
      "visual_background",
      "visual_corner",
      "visual_surface",
      "visual_trait",
      "aesthetic",
    ],
  },
  {
    id: "type_media",
    label: "Type",
    facets: [
      "typography_generic",
      "typography_system_size",
      "typography_role",
      "media",
    ],
  },
  {
    id: "state",
    label: "State",
    facets: [
      "interaction_data_state",
      "interaction_task_state",
      "interaction_overlay_state",
      "interaction_component_state",
    ],
  },
];

const GENERIC_TERMS = new Set([
  "color.hue.neutral",
  "typography.generic.sans_serif",
  "visual.background.solid",
  "visual.surface.flat",
  "density.moderate",
]);

const GROUP_LABELS = [
  { id: "purpose", label: "Purpose" },
  { id: "structure", label: "Structure" },
  { id: "visual", label: "Visual" },
  { id: "type_media", label: "Type" },
  { id: "state", label: "State" },
];

function hostFrom(origin: string): string {
  try {
    return new URL(origin).hostname.replace(/^www\./, "");
  } catch {
    return origin.replace(/^https?:\/\//, "").split("/")[0] ?? origin;
  }
}

function aspectOf(capture: RawCapture): number {
  if (capture.imageWidth && capture.imageHeight && capture.imageHeight > 0) {
    return capture.imageWidth / capture.imageHeight;
  }
  if (
    capture.viewportWidth &&
    capture.viewportHeight &&
    capture.viewportHeight > 0
  ) {
    return capture.viewportWidth / capture.viewportHeight;
  }
  return 16 / 10;
}

export const captures: Capture[] = data.captures.map((capture) => ({
  ...capture,
  host: hostFrom(capture.origin),
  aspect: aspectOf(capture),
}));

export const captureById = new Map(
  captures.map((capture) => [capture.id, capture]),
);

export const mainIds = data.mainCaptureIds.filter((id) => captureById.has(id));
const mainRank = new Map(mainIds.map((id, index) => [id, index]));

export const facets: Facet[] = data.facets;

export const facetById = new Map(facets.map((facet) => [facet.id, facet]));

export const termById = new Map<
  string,
  FacetTerm & { facet: string; facetLabel: string }
>(
  facets.flatMap((facet) =>
    facet.terms.map((term) => [
      term.id,
      { ...term, facet: facet.id, facetLabel: facet.label },
    ]),
  ),
);

const assignments: Record<string, TermRef[]> = data.assignments;
const palettes: Record<string, PaletteSwatch[]> = data.palettes;
const colorRoles: Record<string, ColorRole[]> = data.colorRoles;
const fonts: Record<string, FontUse[]> = data.fonts;
const historicalFonts: Record<string, HistoricalFontUse[]> =
  data.historicalFonts;
const typeRoles: Record<string, TypeRole[]> = data.typeRoles;
const textStyles: Record<string, TextStyle[]> = data.textStyles ?? {};
const motion: Record<string, MotionClip> = data.motion;

export const PIN_IDS = new Set(captures.map((capture) => String(capture.id)));
export const MOTION_IDS = new Set(Object.keys(motion));
export const MOTION_COUNT = MOTION_IDS.size;
export const CAPTURE_COUNT = captures.length;
export const CATALOG_GENERATION = data.generation;

const embeddings = data.embeddingNeighbors ?? {};
const pageVideo = data.pageVideo ?? {};
const fontSimilarity = data.fontSimilarity ?? {};
const fontMetadata = data.fontMetadata ?? {};

const termCaptureIds = new Map<string, number[]>(
  Object.entries(data.termCaptureIds),
);
const domainCaptureIds = new Map<string, number[]>(
  Object.entries(data.domainCaptureIds),
);
const fontCaptureIds = new Map<
  string,
  { name: string; ids: Set<number>; catalogIds: number[] }
>(
  Object.entries(data.fontCaptureIndex).map(([key, entry]) => [
    key,
    { ...entry, ids: new Set(entry.ids) },
  ]),
);
const searchTextByCapture = new Map<number, string>(
  Object.entries(data.searchTextByCapture).map(([id, text]) => [
    Number(id),
    text,
  ]),
);

function evidencedFontFamilies(captureId: number): string[] {
  return [
    ...fontsOf(captureId).map((row) => row.family),
    ...historicalFontsOf(captureId).map((row) => row.family),
    ...typeRolesOf(captureId).map((row) => row.family),
    ...textStylesOf(captureId).flatMap((row) =>
      row.family ? [row.family] : [],
    ),
  ];
}

function addFontCapture(captureId: number, family: string): void {
  const name = normalizeObservedFontFamily(family);
  if (!name) return;
  const key = observedFontFamilyKey(name);
  const entry = fontCaptureIds.get(key) ?? {
    name,
    ids: new Set<number>(),
    catalogIds: data.fontCatalogIds[key] ?? [],
  };
  entry.ids.add(captureId);
  fontCaptureIds.set(key, entry);
}

function indexCaptureFonts(capture: Capture): void {
  for (const family of evidencedFontFamilies(capture.id)) {
    addFontCapture(capture.id, family);
  }
  searchTextByCapture.set(
    capture.id,
    [
      capture.title,
      capture.host,
      capture.origin,
      capture.path,
      ...assignmentsOf(capture.id).map(
        (row) => termById.get(row.term)?.label ?? row.term,
      ),
      ...evidencedFontFamilies(capture.id),
    ]
      .join(" ")
      .toLowerCase(),
  );
}

const rankedCaptures = [...captures].sort(
  (a, b) =>
    (mainRank.get(a.id) ?? Number.MAX_SAFE_INTEGER) -
      (mainRank.get(b.id) ?? Number.MAX_SAFE_INTEGER) ||
    (b.capturedAt ?? 0) - (a.capturedAt ?? 0) ||
    b.id - a.id,
);
const captureRank = new Map(
  rankedCaptures.map((capture, index) => [capture.id, index]),
);

const catalogListeners = new Set<() => void>();

export function subscribeCatalogUpdates(listener: () => void): () => void {
  catalogListeners.add(listener);
  return () => catalogListeners.delete(listener);
}

function replaceRecord<T>(
  target: Record<string, T>,
  source: Record<string, T>,
): void {
  for (const key of Object.keys(target)) delete target[key];
  Object.assign(target, source);
}

void catalogLoad.details.then((details) => {
  if (!details) {
    catalogDetailsStatus = "failed";
    for (const listener of catalogListeners) listener();
    return;
  }
  replaceRecord(assignments, details.assignments);
  replaceRecord(palettes, details.palettes);
  replaceRecord(colorRoles, details.colorRoles);
  replaceRecord(fonts, details.fonts);
  replaceRecord(typeRoles, details.typeRoles);
  fontCaptureIds.clear();
  for (const [key, entry] of Object.entries(details.fontCaptureIndex)) {
    fontCaptureIds.set(key, { ...entry, ids: new Set(entry.ids) });
  }
  termCaptureIds.clear();
  for (const [term, ids] of Object.entries(details.termCaptureIds)) {
    termCaptureIds.set(term, ids);
  }
  searchTextByCapture.clear();
  for (const [id, text] of Object.entries(details.searchTextByCapture)) {
    searchTextByCapture.set(Number(id), text);
  }
  catalogDetailsStatus = "ready";
  for (const listener of catalogListeners) listener();
});

function fieldCaptures(): Capture[] {
  return mainIds.flatMap((id) => {
    const capture = captureById.get(id);
    return capture ? [capture] : [];
  });
}

function bounded(rows: Capture[]): Capture[] {
  return rows.slice(0, VIEW_LIMIT);
}

export function assignmentsOf(id: number): TermRef[] {
  return assignments[String(id)] ?? [];
}

export function termSetOf(id: number): Set<string> {
  return new Set(assignmentsOf(id).map((row) => row.term));
}

export function paletteOf(id: number): PaletteSwatch[] {
  return palettes[String(id)] ?? [];
}

export function colorRolesOf(id: number): ColorRole[] {
  return colorRoles[String(id)] ?? [];
}

export function fontsOf(id: number): FontUse[] {
  return fonts[String(id)] ?? [];
}

export function fontCatalogIdsOf(family: string): number[] {
  return data.fontCatalogIds[observedFontFamilyKey(family)] ?? [];
}
export function fontMetadataOf(family: string) {
  return fontMetadata[observedFontFamilyKey(family)] ?? null;
}

export function familyFontPreviewUrl(
  familyId: number,
  sample = "Hamburgefontsiv 0123456789",
): string {
  const url = new URL(`https://api.withfudge.com/v1/font-previews/${familyId}`);
  url.searchParams.set("sample", sample);
  url.searchParams.set("width", "768");
  return url.href;
}

export function capturedFontPreviewUrl(
  captureId: number,
  observationIndex: number,
  sample = "Hamburgefontsiv 0123456789",
): string {
  const url = new URL(
    `https://api.withfudge.com/v1/font-previews/captures/${captureId}/observations/${observationIndex}`,
  );
  url.searchParams.set("sample", sample);
  url.searchParams.set("width", "768");
  return url.href;
}

export function historicalFontsOf(id: number): HistoricalFontUse[] {
  return historicalFonts[String(id)] ?? [];
}

export function typeRolesOf(id: number): TypeRole[] {
  return typeRoles[String(id)] ?? [];
}

export function textStylesOf(id: number): TextStyle[] {
  return textStyles[String(id)] ?? [];
}

export function motionOf(id: number): MotionClip | null {
  return motion[String(id)] ?? null;
}

export function hexSwatch(
  swatch: Pick<PaletteSwatch, "r" | "g" | "b">,
): string {
  const to = (value: number) =>
    Math.max(0, Math.min(255, value)).toString(16).padStart(2, "0");
  return `#${to(swatch.r)}${to(swatch.g)}${to(swatch.b)}`;
}

const PLACEHOLDER_COLORS = ["#d0cec7", "#d8d6cf", "#c7c5be", "#e0ded7"];

export function fallbackColor(id: number): string {
  return PLACEHOLDER_COLORS[Math.abs(id) % PLACEHOLDER_COLORS.length]!;
}

export function mediaUrl(id: number, video = false): string {
  return `/v1/media/${id}${video ? ".webm" : ""}`;
}

export function namedFonts(id: number): FontUse[] {
  return fontsOf(id).filter(
    (row) =>
      !/^(-apple-system|blinkmacsystemfont|system-ui)$/i.test(row.family),
  );
}

export function coveragePct(value: number): string {
  return `${Math.round(value / 1000) / 10}%`;
}

export function sharePct(value: number): string {
  return `${Math.round(value / 1000) / 10}%`;
}

export function pxSize(value: number): string {
  if (!value) return "";
  return `${Math.round(value / 100) / 10}px`;
}

export function roleSample(role: string): string {
  return (
    {
      display: "A defining headline",
      heading: "Section heading",
      body: "Readable body text for longer passages.",
      ui: "Interface label",
      code: "const result = explore(data);",
      numeric_data: "1,284.53",
    }[role] ?? "Typography sample"
  );
}

export function termCaptureCount(term: string): number {
  return termCaptureIds.get(term)?.length ?? 0;
}

export function representativeCaptureForTerm(term: string): Capture | null {
  const ids = termCaptureIds.get(term) ?? [];
  if (ids.length === 0) return null;
  const available = new Set(ids);
  const candidates = [
    ...mainIds.filter((captureId) => available.has(captureId)),
    ...ids.filter((captureId) => !mainRank.has(captureId)),
  ];
  for (const captureId of candidates) {
    if (hasMeasuredTermValue(captureId, term)) {
      return captureById.get(captureId) ?? null;
    }
  }
  return captureById.get(candidates[0]!) ?? null;
}

function hasMeasuredTermValue(captureId: number, term: string): boolean {
  if (term.startsWith("color.role.")) {
    const role = term.slice("color.role.".length);
    return colorRolesOf(captureId).some((row) => row.role === role);
  }
  if (
    term.startsWith("color.") ||
    termById.get(term)?.facet.startsWith("color_")
  ) {
    return paletteOf(captureId).length > 0;
  }
  if (term.startsWith("typography.role.")) {
    const role = term.slice("typography.role.".length);
    return typeRolesOf(captureId).some((row) => row.role === role);
  }
  if (term.startsWith("typography.")) return namedFonts(captureId).length > 0;
  return true;
}

export function pageVideoOf(
  id: number,
): { count: number; maxCoverage: number } | null {
  return pageVideo[String(id)] ?? null;
}

export function neighborsOf(
  id: number,
): { captureId: number; distance: number }[] {
  return (embeddings[String(id)] ?? []).filter((row) =>
    captureById.has(row.captureId),
  );
}

export function semanticNeighborsReady(id: number): boolean {
  return Object.hasOwn(embeddings, String(id));
}

const semanticRequests = new Map<number, Promise<void>>();

export function ensureSemanticNeighbors(id: number): Promise<void> {
  const key = String(id);
  if (Object.hasOwn(embeddings, key)) return Promise.resolve();
  const pending = semanticRequests.get(id);
  if (pending) return pending;
  const request = fetch(
    `/v1/similar-captures?captureId=${id}&generation=${data.generation}&limit=100`,
    { headers: { accept: "application/json" }, credentials: "same-origin" },
  )
    .then(async (response) => {
      if (!response.ok) {
        throw new Error(`Semantic search failed (${response.status})`);
      }
      const payload: unknown = await response.json();
      if (
        !payload ||
        typeof payload !== "object" ||
        !("observedGeneration" in payload) ||
        !Number.isSafeInteger(payload.observedGeneration) ||
        !("results" in payload) ||
        !Array.isArray(payload.results)
      ) {
        throw new Error("Semantic search returned an invalid response");
      }
      const rows: { captureId: number; distance: number }[] = [];
      for (const row of payload.results) {
        if (
          !row ||
          typeof row !== "object" ||
          !("captureId" in row) ||
          !Number.isSafeInteger(row.captureId) ||
          typeof row.captureId !== "number" ||
          row.captureId < 1 ||
          !("distance" in row) ||
          typeof row.distance !== "number" ||
          !Number.isFinite(row.distance)
        ) {
          continue;
        }
        rows.push({ captureId: row.captureId, distance: row.distance });
      }
      embeddings[key] = rows;
    })
    .catch((error) => {
      embeddings[key] = [];
      throw error;
    })
    .finally(() => semanticRequests.delete(id));
  semanticRequests.set(id, request);
  return request;
}

export type CaptureEvidenceFact = {
  id: string;
  label: string;
  meta?: string;
  count?: number;
  loading?: boolean;
};

const captureEvidence = new Map<number, Record<string, CaptureEvidenceRow[]>>();
const evidenceRequests = new Map<number, Promise<void>>();

function hydrateCaptureEvidence(
  id: number,
  evidence: Record<string, CaptureEvidenceRow[]>,
): void {
  const key = String(id);
  const historical = evidence.historical_font?.flatMap(({ values }) => {
    const familyId = Number(values[0]);
    const family = normalizeObservedFontFamily(String(values[1] ?? ""));
    if (!Number.isSafeInteger(familyId) || !family) return [];
    return [
      {
        familyId,
        family,
        subfamily: String(values[2] || "Regular"),
        links: Math.max(0, Number(values[3]) || 0),
      },
    ];
  });
  if (historical?.length) historicalFonts[key] = historical;

  const styles = evidence.text_style?.map(({ values }) => {
    const lineHeight = values[6] == null ? null : Number(values[6]);
    const letterSpacing = values[7] == null ? null : Number(values[7]);
    return {
      family: normalizeObservedFontFamily(String(values[0] ?? "")) || null,
      generic: String(values[4] || "unknown"),
      weight: Number(values[1]) || 400,
      style: String(values[5] || "normal"),
      size: Number(values[2]) || 0,
      lineHeight:
        lineHeight != null && Number.isFinite(lineHeight) ? lineHeight : null,
      letterSpacing:
        letterSpacing != null && Number.isFinite(letterSpacing)
          ? letterSpacing
          : null,
      occurrences: Math.max(0, Number(values[3]) || 0),
    };
  });
  if (styles?.length) {
    styles.sort((a, b) => b.occurrences - a.occurrences || b.size - a.size);
    textStyles[key] = styles;
  }

  if (!(palettes[key]?.length > 0)) {
    const colors = [
      ...new Set(
        (evidence.legacy_color ?? [])
          .map(({ values }) => Number(values[0]))
          .filter(Number.isSafeInteger)
          .map((value) => value & 0xffffff),
      ),
    ];
    if (colors.length) {
      const coverage = Math.floor(1_000_000 / colors.length);
      palettes[key] = colors.map((value) => ({
        r: (value >> 16) & 0xff,
        g: (value >> 8) & 0xff,
        b: value & 0xff,
        coverage,
      }));
    }
  }

  const capture = captureById.get(id);
  if (capture) indexCaptureFonts(capture);
}

export function ensureCaptureEvidence(id: number): Promise<void> {
  if (captureEvidence.has(id)) return Promise.resolve();
  const pending = evidenceRequests.get(id);
  if (pending) return pending;
  const request = loadCaptureEvidenceInWorker(id, data.generation)
    .then((payload) => {
      if (
        !Number.isSafeInteger(payload.observedGeneration) ||
        (payload.observedGeneration ?? 0) < 1 ||
        payload.captureId !== id ||
        !payload.evidence
      ) {
        throw new Error("Capture evidence returned an invalid generation");
      }
      captureEvidence.set(id, payload.evidence);
      hydrateCaptureEvidence(id, payload.evidence);
    })
    .finally(() => evidenceRequests.delete(id));
  evidenceRequests.set(id, request);
  return request;
}
export function captureEvidenceFactsOf(id: number): CaptureEvidenceFact[] {
  const evidence = captureEvidence.get(id);
  if (!evidence) {
    return evidenceRequests.has(id)
      ? [{ id: "loading", label: "", loading: true }]
      : [];
  }
  const facts: CaptureEvidenceFact[] = [];
  const add = (kind: string, label: string, meta?: string) => {
    const count = evidence[kind]?.length ?? 0;
    if (count > 0) facts.push({ id: kind, label, meta, count });
  };
  const px = (value: unknown) => {
    const milli =
      typeof value === "number" && Number.isFinite(value) ? value : 0;
    return `${Number((milli / 1000).toFixed(2))}px`;
  };
  const first = (kind: string) => evidence[kind]?.[0]?.values ?? [];
  const border = first("border");
  add(
    "border",
    "Measured borders",
    border.length
      ? `${px(border[3])} ${String(border[4] ?? "")}`.trim()
      : undefined,
  );
  const shadow = first("shadow");
  add(
    "shadow",
    "Measured shadows",
    shadow.length ? `${px(shadow[5])} blur` : undefined,
  );
  const radius = first("radius");
  add("radius", "Corner radii", radius.length ? px(radius[0]) : undefined);
  const spacing = first("spacing");
  add(
    "spacing",
    "Spacing values",
    spacing.length
      ? `${String(spacing[0] ?? "spacing")} · ${px(spacing[1])}`
      : undefined,
  );
  const media = first("media");
  add(
    "media",
    "Media regions",
    media.length ? String(media[0] ?? "media") : undefined,
  );
  add("gradient_stop", "Gradient stops");
  return facts;
}

export function groupedTerms(id: number): {
  id: string;
  label: string;
  terms: { id: string; label: string; count: number }[];
}[] {
  const buckets = new Map<
    string,
    { id: string; label: string; count: number }[]
  >();
  for (const row of assignmentsOf(id)) {
    const meta = termById.get(row.term);
    if (!meta) continue;
    const facet = facetById.get(meta.facet);
    const group = facet?.group ?? "visual";
    const list = buckets.get(group) ?? [];
    list.push({
      id: row.term,
      label: meta.label,
      count: termCaptureCount(row.term),
    });
    buckets.set(group, list);
  }
  return GROUP_LABELS.map((group) => ({
    ...group,
    terms: buckets.get(group.id) ?? [],
  })).filter((group) => group.terms.length > 0);
}

export function formatDate(ms: number | null): string {
  if (!ms) return "";
  return new Date(ms).toISOString().slice(0, 10);
}

export function semanticSimilar(id: number): { id: number; score: number }[] {
  const mine = termSetOf(id);
  const rows: { id: number; score: number }[] = [];
  for (const other of rankedCaptures) {
    if (other.id === id) continue;
    let score = 0;
    const theirs = termSetOf(other.id);
    for (const term of mine) {
      if (theirs.has(term)) score += 1;
    }
    if (score) rows.push({ id: other.id, score });
  }
  return rows.sort((a, b) => b.score - a.score || a.id - b.id).slice(0, 16);
}

export function typeSimilar(
  id: number,
): { id: number; score: number; note: string }[] {
  const mine = new Set(
    namedFonts(id)
      .map((row) => observedFontFamilyKey(row.family))
      .filter(Boolean),
  );
  if (mine.size === 0) return [];
  const rows: { id: number; score: number; note: string }[] = [];
  for (const other of rankedCaptures) {
    if (other.id === id) continue;
    const shared = namedFonts(other.id).filter((row) =>
      mine.has(observedFontFamilyKey(row.family)),
    );
    if (!shared.length) continue;
    rows.push({
      id: other.id,
      score: shared.length,
      note: [...new Set(shared.map((row) => row.family))].join(", "),
    });
  }
  return rows.sort((a, b) => b.score - a.score || a.id - b.id).slice(0, 16);
}

export function adjacentCaptures(id: number): { id: number; score: number }[] {
  const page = primaryTerm(id, "page_role");
  const mode = primaryTerm(id, "color_mode");
  const layout = primaryTerm(id, "layout_archetype");
  if (!page) return [];
  const rows: { id: number; score: number }[] = [];
  for (const other of rankedCaptures) {
    if (other.id === id) continue;
    if (primaryTerm(other.id, "page_role") !== page) continue;
    let score = 0;
    const otherMode = primaryTerm(other.id, "color_mode");
    const otherLayout = primaryTerm(other.id, "layout_archetype");
    if (mode && otherMode && mode !== otherMode) score += 2;
    if (layout && otherLayout && layout !== otherLayout) score += 1;
    if (score) rows.push({ id: other.id, score });
  }
  return rows.sort((a, b) => b.score - a.score || a.id - b.id).slice(0, 16);
}

export function primaryTerm(id: number, facet: string): string | null {
  return (
    assignmentsOf(id)
      .filter((row) => termById.get(row.term)?.facet === facet)
      .sort((a, b) => b.confidence - a.confidence)[0]?.term ?? null
  );
}

export function coTerms(
  term: string,
): { id: string; label: string; count: number }[] {
  const ids = termCaptureIds.get(term) ?? [];
  const counts = new Map<string, number>();
  for (const id of ids) {
    for (const row of assignmentsOf(id)) {
      if (row.term === term) continue;
      counts.set(row.term, (counts.get(row.term) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    .map(([id, count]) => ({
      id,
      label: termById.get(id)?.label ?? id,
      count,
    }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label))
    .slice(0, 8);
}

const fontSimilarityRequests = new Map<string, Promise<void>>();
export function fontSimilarityReady(family: string): boolean {
  const key = observedFontFamilyKey(family);
  return Object.keys(fontSimilarity).some(
    (name) => observedFontFamilyKey(name) === key,
  );
}

export function ensureFontSimilarity(family: string): Promise<void> {
  const key = observedFontFamilyKey(family);
  const existing = Object.keys(fontSimilarity).find(
    (name) => observedFontFamilyKey(name) === key,
  );
  if (existing) return Promise.resolve();
  const pending = fontSimilarityRequests.get(key);
  if (pending) return pending;
  const familyId = fontCatalogIdsOf(family)[0];
  if (!familyId) {
    fontSimilarity[family] = [];
    return Promise.resolve();
  }
  const request = loadSimilarFonts(familyId, data.generation)
    .then((rows) => {
      const seen = new Set<string>();
      fontSimilarity[family] = rows.flatMap((row) => {
        const candidateKey = observedFontFamilyKey(row.familyName);
        if (!candidateKey || candidateKey === key || seen.has(candidateKey)) {
          return [];
        }
        seen.add(candidateKey);
        return [
          {
            id: row.familyId,
            name: row.familyName,
            score: 1 / (1 + Math.max(0, row.visualDistance)),
          },
        ];
      });
    })
    .catch((error) => {
      fontSimilarity[family] = [];
      throw error;
    })
    .finally(() => fontSimilarityRequests.delete(key));
  fontSimilarityRequests.set(key, request);
  return request;
}

export function similarFonts(
  family: string,
): { name: string; score: number }[] {
  const key = observedFontFamilyKey(family);
  const direct = fontSimilarity[family];
  const match =
    direct ??
    fontSimilarity[
      Object.keys(fontSimilarity).find(
        (name) => observedFontFamilyKey(name) === key,
      ) ?? ""
    ] ??
    [];
  return match
    .filter((row) => observedFontFamilyKey(row.name) !== key)
    .map((row) => ({ name: row.name, score: row.score }))
    .slice(0, 8);
}

export function coFonts(family: string): { name: string; count: number }[] {
  const key = observedFontFamilyKey(family);
  const entry = fontCaptureIds.get(key);
  if (!entry) return [];
  const counts = new Map<string, { name: string; count: number }>();
  for (const id of entry.ids) {
    for (const font of namedFonts(id)) {
      if (observedFontFamilyKey(font.family) === key) continue;
      const k = observedFontFamilyKey(font.family);
      const current = counts.get(k) ?? { name: font.family, count: 0 };
      current.count += 1;
      counts.set(k, current);
    }
  }
  return [...counts.values()]
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
    .slice(0, 8);
}

export function fontCaptureCount(family: string): number {
  return fontCaptureIds.get(observedFontFamilyKey(family))?.ids.size ?? 0;
}

export function domainCaptureCount(origin: string): number {
  return domainCaptureIds.get(origin)?.length ?? 0;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function formatDuration(ms: number): string {
  return `${(ms / 1000).toFixed(1)}s`;
}

export function pathLabel(path: string): string {
  if (!path || path === "/") return "/";
  return path.length > 28 ? `${path.slice(0, 26)}…` : path;
}

export function isKnown(value: string | null | undefined): value is string {
  return Boolean(value) && value !== "unknown";
}

export function relatedCounts(id: number) {
  return {
    visual: neighborsOf(id).length,
    semantic: semanticSimilar(id).length,
    type: typeSimilar(id).length,
    adjacent: adjacentCaptures(id).length,
    domain:
      domainCaptureIds.get(captureById.get(id)?.origin ?? "")?.length ?? 0,
  };
}

export function siblingsOf(
  termId: string,
): { id: string; label: string; count: number }[] {
  const term = termById.get(termId);
  if (!term) return [];
  const facet = facetById.get(term.facet);
  if (!facet) return [];
  return facet.terms
    .filter((row) => row.id !== termId && row.parent === term.parent)
    .map((row) => ({
      id: row.id,
      label: row.label,
      count: termCaptureCount(row.id),
    }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label))
    .slice(0, 8);
}

export function facetOfTerm(termId: string): Facet | null {
  const term = termById.get(termId);
  if (!term) return null;
  return facetById.get(term.facet) ?? null;
}

export function termConfidence(captureId: number, termId: string): number {
  return (
    assignmentsOf(captureId).find((row) => row.term === termId)?.confidence ?? 0
  );
}

function paletteDistance(a: PaletteSwatch, b: PaletteSwatch): number {
  const dr = a.r - b.r;
  const dg = a.g - b.g;
  const db = a.b - b.b;
  return dr * dr + dg * dg + db * db;
}

export function similarPaletteIds(id: number): number[] {
  const mine = paletteOf(id)[0];
  if (!mine) return [id];
  const scored = rankedCaptures
    .map((capture) => {
      const other = paletteOf(capture.id)[0];
      return {
        id: capture.id,
        distance: other ? paletteDistance(mine, other) : 999999,
      };
    })
    .sort((a, b) => a.distance - b.distance || a.id - b.id);
  const close = scored
    .filter((row) => row.distance < 72 * 72)
    .map((row) => row.id);
  return close.length > 1 ? close : scored.slice(0, 8).map((row) => row.id);
}

export function neighborDistance(id: number): Map<number, number> {
  const map = new Map<number, number>([[id, 0]]);
  for (const row of neighborsOf(id)) map.set(row.captureId, row.distance);
  return map;
}

export function fieldFilters(view: FieldView): FieldFilter[] {
  if (view.kind === "all") return [];
  return view.kind === "filtered" ? view.filters : [view];
}

export function combineFieldViews(views: FieldView[]): FieldView {
  const filters = views.flatMap(fieldFilters);
  if (filters.length === 0) return { kind: "all" };
  if (filters.length === 1) return filters[0]!;
  return { kind: "filtered", filters };
}

export function latestFieldFilter(view: FieldView): FieldFilter | null {
  const filters = fieldFilters(view);
  return filters.at(-1) ?? null;
}

export function viewTitle(view: FieldView): string {
  if (view.kind === "filtered") {
    return view.filters.map(viewTitle).join(" + ") || "Field";
  }
  if (view.kind === "all") return "Field";
  if (view.kind === "saved") return "Saved";
  if (view.kind === "term") return termById.get(view.id)?.label ?? view.id;
  if (view.kind === "facet") return facetById.get(view.id)?.label ?? view.id;
  if (view.kind === "font") return view.family;
  if (view.kind === "palette") return "This palette";
  if (view.kind === "domain") {
    try {
      return new URL(view.origin).hostname.replace(/^www\./, "");
    } catch {
      return view.origin;
    }
  }
  if (view.kind === "search") return view.query;
  if (view.kind === "visual") return "Looks like this";
  if (view.kind === "semantic") {
    const term = distinctiveTerm(view.id);
    return term ? `Shares ${term}` : "Shared terms";
  }
  if (view.kind === "typeSimilar") {
    const faces = typeFaceList(view.id);
    return faces ? `Set in ${faces}` : "Same type";
  }
  if (view.kind === "adjacent") {
    const role = pageRoleLabel(view.id);
    return role ? `Other ${role.toLowerCase()}` : "Same role";
  }
  return "Moving";
}

export function viewTone(view: FieldView): "term" | "type" | "data" | "fg" {
  if (view.kind === "filtered") {
    const latest = latestFieldFilter(view);
    return latest ? viewTone(latest) : "fg";
  }
  if (view.kind === "term" || view.kind === "facet") return "term";
  if (view.kind === "font" || view.kind === "typeSimilar") return "type";
  if (view.kind === "palette" || view.kind === "visual") return "data";
  return "fg";
}

export function viewPalette(view: FieldView): PaletteSwatch[] {
  if (view.kind === "filtered") {
    const latest = latestFieldFilter(view);
    return latest ? viewPalette(latest) : [];
  }
  if (
    view.kind === "palette" ||
    view.kind === "visual" ||
    view.kind === "semantic" ||
    view.kind === "typeSimilar" ||
    view.kind === "adjacent"
  ) {
    return paletteOf(view.id).slice(0, 6);
  }
  return [];
}

function fontEntryMeta(entry: {
  ids: Set<number>;
  catalogIds: number[];
}): string {
  const capturesLabel = `${entry.ids.size} captures`;
  return entry.catalogIds.length > 1
    ? `${capturesLabel} · ${entry.catalogIds.length} same-name catalogue records`
    : capturesLabel;
}

export function viewMeta(view: FieldView): string {
  if (view.kind === "filtered") {
    return `${view.filters.length} combined filters`;
  }
  if (view.kind === "term") {
    const term = termById.get(view.id);
    return term?.facetLabel ?? "";
  }
  if (view.kind === "facet") {
    const facet = facetById.get(view.id);
    return facet ? `${facet.group} · ${facet.cardinality}` : "";
  }
  if (view.kind === "font") {
    const entry = fontCaptureIds.get(observedFontFamilyKey(view.family));
    return entry ? fontEntryMeta(entry) : "";
  }
  if (view.kind === "palette") return "Measured neighbors";
  if (view.kind === "search") return "Search results";
  if (view.kind === "visual") return "Nearest embeddings";
  if (view.kind === "semantic") return "Shared terms";
  if (view.kind === "typeSimilar") return "Shared type faces";
  if (view.kind === "adjacent") return "Same job, different form";
  if (view.kind === "motion") return "Recorded motion";
  if (view.kind === "saved") return "Kept from the field";
  return "";
}

export function pageRoleLabel(id: number): string | null {
  const term = primaryTerm(id, "page_role");
  return term ? (termById.get(term)?.label ?? null) : null;
}

export function distinctiveTerm(id: number): string | null {
  const row = assignmentsOf(id)
    .filter(
      (item) =>
        !GENERIC_TERMS.has(item.term) && !item.term.startsWith("component."),
    )
    .sort((a, b) => b.confidence - a.confidence)[0];
  return row ? (termById.get(row.term)?.label ?? null) : null;
}

export function typeFaceList(id: number): string | null {
  const names = [
    ...new Set(
      [
        ...typeRolesOf(id).map((row) => row.family),
        ...namedFonts(id).map((row) => row.family),
      ].filter((name) => name && !/^(-apple-system)$/i.test(name)),
    ),
  ].slice(0, 2);
  return names.length ? names.join(" + ") : null;
}

export function browseCatalog(): { label: string; items: SearchHit[] }[] {
  const terms = [...termById.values()]
    .filter((term) => !term.id.startsWith("component."))
    .map((term) => ({
      kind: "term" as const,
      id: term.id,
      title: term.label,
      sub: `${term.facetLabel} · ${termCaptureCount(term.id)}`,
      count: termCaptureCount(term.id),
    }))
    .filter((row) => row.count > 0)
    .sort((a, b) => b.count - a.count || a.title.localeCompare(b.title))
    .slice(0, 8);

  const fonts = [...fontCaptureIds.values()]
    .sort((a, b) => b.ids.size - a.ids.size)
    .slice(0, 6)
    .map((entry) => ({
      kind: "font" as const,
      id: entry.name,
      title: entry.name,
      sub: `${entry.ids.size} captures`,
    }));

  const domains = [...domainCaptureIds.entries()]
    .sort((a, b) => b[1].length - a[1].length)
    .slice(0, 5)
    .map(([origin, ids]) => ({
      kind: "domain" as const,
      id: origin,
      title: hostFrom(origin),
      sub: `${ids.length} captures`,
    }));

  const facetHits = facets
    .map((facet) => ({
      kind: "facet" as const,
      id: facet.id,
      title: facet.label,
      sub: `${facet.group} · ${facet.terms.length} terms`,
      count: facet.terms.reduce((n, term) => n + termCaptureCount(term.id), 0),
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 6)
    .map(({ count: _c, ...hit }) => hit);

  return [
    { label: "Terms", items: terms.map(({ count: _c, ...hit }) => hit) },
    { label: "Facets", items: facetHits },
    { label: "Fonts", items: fonts },
    { label: "Domains", items: domains },
  ].filter((group) => group.items.length > 0);
}

function idsToCaptures(ids: number[]): Capture[] {
  const seen = new Set<number>();
  const out: Capture[] = [];
  for (const id of ids) {
    if (seen.has(id)) continue;
    const capture = captureById.get(id);
    if (!capture) continue;
    seen.add(id);
    out.push(capture);
  }
  return out;
}

function rankedIndexedCaptures(ids: Iterable<number>): Capture[] {
  return idsToCaptures([...ids]).sort(
    (a, b) =>
      (captureRank.get(a.id) ?? Number.MAX_SAFE_INTEGER) -
      (captureRank.get(b.id) ?? Number.MAX_SAFE_INTEGER),
  );
}

function matchesForFilter(
  filter: FieldFilter,
  savedIds: Set<string>,
): Capture[] {
  const pool = rankedCaptures;
  if (filter.kind === "saved") {
    return pool.filter((capture) => savedIds.has(String(capture.id)));
  }
  if (filter.kind === "term") {
    return rankedIndexedCaptures(termCaptureIds.get(filter.id) ?? []);
  }
  if (filter.kind === "facet") {
    const facet = facetById.get(filter.id);
    const ids = new Set(
      (facet?.terms ?? []).flatMap((term) => termCaptureIds.get(term.id) ?? []),
    );
    return rankedIndexedCaptures(ids);
  }
  if (filter.kind === "font") {
    const ids = fontCaptureIds.get(observedFontFamilyKey(filter.family))?.ids;
    return ids ? rankedIndexedCaptures(ids) : [];
  }
  if (filter.kind === "palette") {
    return rankedIndexedCaptures(similarPaletteIds(filter.id));
  }
  if (filter.kind === "domain") {
    return rankedIndexedCaptures(domainCaptureIds.get(filter.origin) ?? []);
  }
  if (filter.kind === "search") {
    return idsToCaptures(filter.captureIds);
  }
  if (filter.kind === "visual") {
    return idsToCaptures([
      filter.id,
      ...neighborsOf(filter.id).map((row) => row.captureId),
    ]).slice(0, 100);
  }
  if (filter.kind === "semantic") {
    return idsToCaptures([
      filter.id,
      ...semanticSimilar(filter.id).map((row) => row.id),
    ]);
  }
  if (filter.kind === "typeSimilar") {
    return idsToCaptures([
      filter.id,
      ...typeSimilar(filter.id).map((row) => row.id),
    ]);
  }
  if (filter.kind === "adjacent") {
    return idsToCaptures([
      filter.id,
      ...adjacentCaptures(filter.id).map((row) => row.id),
    ]);
  }
  return pool.filter((capture) => motionOf(capture.id));
}

export function captureView(
  view: FieldView,
  savedIds: Set<string>,
): { captures: Capture[]; total: number } {
  let matches: Capture[];
  if (view.kind === "all") {
    matches = fieldCaptures();
  } else if (view.kind === "filtered") {
    const filters = view.filters;
    if (filters.length === 0) {
      matches = fieldCaptures();
    } else {
      const orderedIndex = filters.findIndex(
        (filter) => filter.kind === "search",
      );
      const seed =
        orderedIndex >= 0
          ? matchesForFilter(filters[orderedIndex]!, savedIds)
          : rankedCaptures;
      const required = filters
        .filter((_, index) => index !== orderedIndex)
        .map(
          (filter) =>
            new Set(
              matchesForFilter(filter, savedIds).map((capture) => capture.id),
            ),
        );
      matches = seed.filter((capture) =>
        required.every((ids) => ids.has(capture.id)),
      );
    }
  } else {
    matches = matchesForFilter(view, savedIds);
  }
  return { captures: bounded(matches), total: matches.length };
}

export function capturesInView(
  view: FieldView,
  savedIds: Set<string>,
): Capture[] {
  return captureView(view, savedIds).captures;
}
