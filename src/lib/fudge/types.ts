export type TermRef = {
  term: string;
  confidence: number;
};

export type PaletteSwatch = {
  r: number;
  g: number;
  b: number;
  coverage: number;
};

export type ColorRole = {
  role: string;
  r: number;
  g: number;
  b: number;
};

export type FontUse = {
  family: string;
  observationIndex: number;
  weightMin: number;
  weightMax: number;
  share: number;
  occurrences: number;
};

export type HistoricalFontUse = {
  familyId: number;
  family: string;
  subfamily: string;
  links: number;
};

export type TypeRole = {
  role: string;
  family: string;
  weight: number;
  size: number;
};

export type TextStyle = {
  family: string | null;
  generic: string;
  weight: number;
  style: string;
  size: number;
  lineHeight: number | null;
  letterSpacing: number | null;
  occurrences: number;
};

export type MotionClip = {
  url: string;
  mediaType: string;
  bytes: number;
  durationMs: number;
  width: number;
  height: number;
};

export type FacetTerm = {
  id: string;
  label: string;
  parent: string | null;
  status: string;
};

export type Facet = {
  id: string;
  label: string;
  cardinality: string;
  definition: string;
  group: string;
  terms: FacetTerm[];
};

export type RawCapture = {
  id: number;
  title: string;
  capturedAt: number | null;
  origin: string;
  path: string;
  device: string | null;
  theme: string | null;
  state: string | null;
  viewportWidth: number | null;
  viewportHeight: number | null;
  image: string;
  imageWidth: number | null;
  imageHeight: number | null;
  pageUrl: string;
  kind: "primary" | "neighbor" | "embedding";
};

export type CatalogFile = {
  generation: number;
  ontologyId: string;
  captures: RawCapture[];
  mainCaptureIds: number[];
  pivotIds: number[];
  facets: Facet[];
  assignments: Record<string, TermRef[]>;
  palettes: Record<string, PaletteSwatch[]>;
  colorRoles: Record<string, ColorRole[]>;
  fonts: Record<string, FontUse[]>;
  historicalFonts: Record<string, HistoricalFontUse[]>;
  fontCatalogIds: Record<string, number[]>;
  typeRoles: Record<string, TypeRole[]>;
  textStyles?: Record<string, TextStyle[]>;
  motion: Record<string, MotionClip>;
  pageVideo: Record<string, { count: number; maxCoverage: number }>;
  embeddingNeighbors: Record<string, { captureId: number; distance: number }[]>;
  fontSimilarity: Record<string, { id: number; name: string; score: number }[]>;
};

export type Capture = RawCapture & {
  aspect: number;
  host: string;
};

export type LensId =
  "all" | "purpose" | "structure" | "visual" | "type_media" | "state";

export type FieldView =
  | { kind: "all" }
  | { kind: "saved" }
  | { kind: "term"; id: string }
  | { kind: "facet"; id: string }
  | { kind: "font"; family: string }
  | { kind: "palette"; id: number }
  | { kind: "domain"; origin: string }
  | { kind: "visual"; id: number }
  | { kind: "semantic"; id: number }
  | { kind: "typeSimilar"; id: number }
  | { kind: "adjacent"; id: number }
  | { kind: "search"; query: string; captureIds: number[] }
  | { kind: "motion" };

export type SearchHit = {
  kind: "capture" | "term" | "font" | "domain" | "facet" | "search";
  id: string;
  title: string;
  sub: string;
};
