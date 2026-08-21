import {
  MOTION_COUNT,
  coFonts,
  coTerms,
  capturedFontPreviewUrl,
  captureEvidenceFactsOf,
  colorRolesOf,
  distinctiveTerm,
  facetById,
  facetOfTerm,
  groupedTerms,
  hexSwatch,
  historicalFontsOf,
  familyFontPreviewUrl,
  fontCatalogIdsOf,
  mediaUrl,
  motionOf,
  namedFonts,
  paletteOf,
  pageRoleLabel,
  pxSize,
  relatedCounts,
  representativeCaptureForTerm,
  siblingsOf,
  similarFonts,
  termById,
  termCaptureCount,
  termConfidence,
  typeFaceList,
  typeRolesOf,
  typeSimilar,
  textStylesOf,
} from "./catalog";
import { observedFontFamilyKey } from "./fonts";
import type {
  Capture,
  FieldView,
  FontUse,
  HistoricalFontUse,
  PaletteSwatch,
  TextStyle,
} from "./types";

import type { Axis, Material } from "@/lib/impulse";

export type TypographyInfo = {
  roles: string[];
  weights: number[];
  sizes: number[];
  styles: number;
  uses: number;
  note?: string;
};

export type Stop = {
  id: string;
  label: string;
  arm: "x" | "also" | "voice";
  material: Material;
  view?: FieldView;
  count?: number;
  meta?: string;
  swatch?: string;
  thumbnail?: string;
  family?: string;
  weight?: number;
  loading?: boolean;
  fontFamilyId?: number;
  fontPreviewUrl?: string;
  typography?: TypographyInfo;
};

export function trailFor(current: FieldView[], next: FieldView): FieldView[] {
  if (next.kind === "all") return [{ kind: "all" }];
  const existing = current.findIndex((item) => sameView(item, next));
  if (existing >= 0) return current.slice(0, existing + 1);
  return [...current, next];
}

export function sameView(a: FieldView, b: FieldView) {
  return JSON.stringify(a) === JSON.stringify(b);
}

export function materialOf(view: FieldView): Material {
  if (view.kind === "font" || view.kind === "typeSimilar") return "string";
  if (view.kind === "palette" || view.kind === "visual") return "glass";
  if (view.kind === "term" || view.kind === "facet") return "wood";
  return "paper";
}

export function materialOfGroup(group: string): Material {
  if (group === "type_media") return "string";
  if (group === "visual") return "glass";
  if (group === "state") return "paper";
  return "wood";
}

export function moveOf(
  from: FieldView,
  to: FieldView,
  fromId: number | null,
  toId: number | null,
): { axis: Axis; d: number; inbound: boolean; material: Material } {
  if (fromId !== toId && (fromId == null || toId == null)) {
    return {
      axis: "z",
      d: 1.35,
      inbound: toId != null,
      material: "paper",
    };
  }
  if (fromId != null && toId != null && fromId !== toId) {
    return { axis: "z", d: 0.85, inbound: true, material: "paper" };
  }
  if (sameView(from, to)) {
    return { axis: "0", d: 0, inbound: true, material: materialOf(to) };
  }

  if (from.kind === "term" && to.kind === "term") {
    const a = facetOfTerm(from.id);
    const b = facetOfTerm(to.id);
    if (a && b && a.id === b.id) {
      return { axis: "x", d: 1, inbound: true, material: "wood" };
    }
    return { axis: "y", d: 2, inbound: true, material: "wood" };
  }
  if (from.kind === "facet" && to.kind === "term") {
    return { axis: "y", d: 1, inbound: true, material: "wood" };
  }
  if (from.kind === "term" && to.kind === "facet") {
    return { axis: "y", d: 1, inbound: false, material: "wood" };
  }
  if (to.kind === "all") {
    return { axis: "y", d: 1.4, inbound: false, material: "paper" };
  }
  if (
    to.kind === "visual" ||
    to.kind === "semantic" ||
    to.kind === "typeSimilar" ||
    to.kind === "palette" ||
    to.kind === "adjacent" ||
    to.kind === "domain" ||
    to.kind === "font"
  ) {
    return {
      axis: "r",
      d: 1.5,
      inbound: true,
      material: materialOf(to),
    };
  }
  return { axis: "y", d: 1.1, inbound: true, material: materialOf(to) };
}

export function armsOf(
  view: FieldView,
  focused: Capture | null,
): {
  x: Stop[];
  also: Stop[];
  voice: Stop[];
} {
  if (focused) return inspectArms(focused);

  if (view.kind === "term") {
    const x: Stop[] = siblingsOf(view.id)
      .filter((row) => row.id !== view.id)
      .map((row) => ({
        id: row.id,
        label: row.label,
        arm: "x" as const,
        material: "wood" as const,
        view: { kind: "term" as const, id: row.id },
        count: termCaptureCount(row.id),
        ...termStopEvidence(row.id),
      }));
    const also: Stop[] = coTerms(view.id).map((row) => ({
      id: row.id,
      label: row.label,
      arm: "also" as const,
      material: "wood" as const,
      view: { kind: "term" as const, id: row.id },
      count: row.count,
      ...termStopEvidence(row.id),
    }));
    return { x, also, voice: [] };
  }

  if (view.kind === "facet") {
    const facet = facetById.get(view.id);
    const x: Stop[] = (facet?.terms ?? [])
      .map((term) => ({
        id: term.id,
        label: term.label,
        arm: "x" as const,
        material: "wood" as const,
        view: { kind: "term" as const, id: term.id },
        count: termCaptureCount(term.id),
        ...termStopEvidence(term.id),
      }))
      .filter((row) => (row.count ?? 0) > 0)
      .sort((a, b) => (b.count ?? 0) - (a.count ?? 0));
    return { x, also: [], voice: [] };
  }

  if (view.kind === "font") {
    const x: Stop[] = similarFonts(view.family).map((row) => ({
      id: row.name,
      label: row.name,
      arm: "x" as const,
      material: "string" as const,
      view: { kind: "font" as const, family: row.name },
      family: row.name,
      meta: `${Math.round(row.score * 100)}%`,
    }));
    const also: Stop[] = coFonts(view.family).map((row) => ({
      id: `co-${row.name}`,
      label: row.name,
      arm: "also" as const,
      material: "string" as const,
      view: { kind: "font" as const, family: row.name },
      family: row.name,
      count: row.count,
    }));
    return { x, also, voice: [] };
  }

  return { x: [], also: [], voice: [] };
}

const HUE_TARGETS: Record<string, { hue: number; lightness: number }> = {
  blue: { hue: 225, lightness: 0.48 },
  brown: { hue: 28, lightness: 0.28 },
  cyan: { hue: 190, lightness: 0.58 },
  gold: { hue: 48, lightness: 0.56 },
  green: { hue: 125, lightness: 0.46 },
  orange: { hue: 30, lightness: 0.56 },
  pink: { hue: 335, lightness: 0.68 },
  purple: { hue: 285, lightness: 0.48 },
  red: { hue: 0, lightness: 0.5 },
  teal: { hue: 175, lightness: 0.43 },
  yellow: { hue: 60, lightness: 0.68 },
};

function swatchMetrics(swatch: PaletteSwatch): {
  chroma: number;
  hue: number;
  lightness: number;
} {
  const r = swatch.r / 255;
  const g = swatch.g / 255;
  const b = swatch.b / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const chroma = max - min;
  let hue = 0;
  if (chroma > 0) {
    if (max === r) hue = 60 * (((g - b) / chroma) % 6);
    else if (max === g) hue = 60 * ((b - r) / chroma + 2);
    else hue = 60 * ((r - g) / chroma + 4);
  }
  return {
    chroma,
    hue: hue < 0 ? hue + 360 : hue,
    lightness: (max + min) / 2,
  };
}

function hueDistance(a: number, b: number): number {
  const delta = Math.abs(a - b);
  return Math.min(delta, 360 - delta);
}

function hueSwatch(captureId: number, termId: string): PaletteSwatch | null {
  if (!termId.startsWith("color.hue.")) return null;
  const family = termId.slice("color.hue.".length);
  const swatches = paletteOf(captureId);
  if (swatches.length === 0 || family === "multicolor") return null;
  if (family === "neutral") {
    return (
      [...swatches].sort((a, b) => {
        const aMetrics = swatchMetrics(a);
        const bMetrics = swatchMetrics(b);
        return aMetrics.chroma - bMetrics.chroma || b.coverage - a.coverage;
      })[0] ?? null
    );
  }
  const target = HUE_TARGETS[family];
  if (!target) return null;
  let best: PaletteSwatch | null = null;
  let bestScore = Infinity;
  for (const swatch of swatches) {
    const metrics = swatchMetrics(swatch);
    if (metrics.chroma < 0.06) continue;
    const score =
      hueDistance(metrics.hue, target.hue) +
      Math.abs(metrics.lightness - target.lightness) * 20 -
      Math.min(4, swatch.coverage / 250_000);
    if (score < bestScore) {
      best = swatch;
      bestScore = score;
    }
  }
  return best;
}

function isNamedFontFamily(family: string | null): family is string {
  return (
    typeof family === "string" &&
    !/^(?:-apple-system|blinkmacsystemfont|system-ui|ui-(?:sans-serif|serif|monospace)|sans-serif|serif|monospace)$/i.test(
      family,
    )
  );
}

type MutableTypographySummary = {
  family: string;
  key: string;
  roles: Set<string>;
  weights: Set<number>;
  sizes: Set<number>;
  notes: Set<string>;
  styles: number;
  uses: number;
};

function typographySummaries(
  styles: TextStyle[],
  roles: Array<{ role: string; family: string; weight: number; size: number }>,
  faces: FontUse[],
  history: HistoricalFontUse[],
): Array<
  Omit<MutableTypographySummary, "roles" | "weights" | "sizes" | "notes"> & {
    roles: string[];
    weights: number[];
    sizes: number[];
    note?: string;
  }
> {
  const grouped = new Map<string, MutableTypographySummary>();
  const ensure = (family: string | null) => {
    if (!isNamedFontFamily(family)) return null;
    const key = observedFontFamilyKey(family);
    const summary = grouped.get(key) ?? {
      family,
      key,
      roles: new Set<string>(),
      weights: new Set<number>(),
      sizes: new Set<number>(),
      notes: new Set<string>(),
      styles: 0,
      uses: 0,
    };
    grouped.set(key, summary);
    return summary;
  };

  for (const style of styles) {
    const summary = ensure(style.family);
    if (!summary) continue;
    summary.styles += 1;
    summary.uses += style.occurrences;
    if (style.weight > 0) summary.weights.add(style.weight);
    if (style.size > 0) summary.sizes.add(style.size);
  }
  for (const role of roles) {
    const summary = ensure(role.family);
    if (!summary) continue;
    summary.roles.add(
      role.role
        .replace(/_/g, " ")
        .replace(/\b\w/g, (letter) => letter.toUpperCase()),
    );
    if (role.weight > 0) summary.weights.add(role.weight);
    if (role.size > 0) summary.sizes.add(role.size);
  }
  for (const face of faces) {
    const summary = ensure(face.family);
    if (!summary) continue;
    if (face.weightMin > 0) summary.weights.add(face.weightMin);
    if (face.weightMax > 0) summary.weights.add(face.weightMax);
    summary.uses = Math.max(summary.uses, face.occurrences);
  }
  for (const row of history) {
    const summary = ensure(row.family);
    if (!summary) continue;
    summary.notes.add(`Legacy ${row.subfamily}`);
    summary.uses = Math.max(summary.uses, row.links);
  }

  return [...grouped.values()]
    .map((summary) => ({
      family: summary.family,
      key: summary.key,
      roles: [...summary.roles],
      weights: [...summary.weights].sort((a, b) => a - b),
      sizes: [...summary.sizes].sort((a, b) => a - b),
      styles: summary.styles,
      uses: summary.uses,
      note: [...summary.notes][0],
    }))
    .sort(
      (a, b) =>
        b.uses - a.uses ||
        b.roles.length - a.roles.length ||
        a.family.localeCompare(b.family),
    );
}
function termStopEvidence(
  termId: string,
): Pick<Stop, "meta" | "swatch" | "thumbnail"> {
  const capture = representativeCaptureForTerm(termId);
  return {
    ...measuredTermValue(capture, termId),
    thumbnail:
      capture && termId.startsWith("color.") ? mediaUrl(capture.id) : undefined,
  };
}

function measuredTermValue(
  capture: Capture | null,
  termId: string,
): Pick<Stop, "meta" | "swatch"> {
  if (!capture) return {};
  const roleId = termId.startsWith("color.role.")
    ? termId.slice("color.role.".length)
    : "";
  const roleColor = roleId
    ? colorRolesOf(capture.id).find((row) => row.role === roleId)
    : null;
  const swatchSource = roleColor ?? hueSwatch(capture.id, termId);
  if (swatchSource) return { swatch: hexSwatch(swatchSource) };

  const typeRoleId = termId.startsWith("typography.role.")
    ? termId.slice("typography.role.".length)
    : "";
  const typeRole = typeRoleId
    ? typeRolesOf(capture.id).find((row) => row.role === typeRoleId)
    : null;
  if (typeRole)
    return { meta: `${typeRole.family} · ${pxSize(typeRole.size)}` };
  if (termId.startsWith("typography.")) {
    return { meta: typeFaceList(capture.id) ?? undefined };
  }
  return {};
}

function fontPreview(
  capture: Capture,
  family: string,
  faces: FontUse[],
  history: HistoricalFontUse[],
): Pick<Stop, "fontFamilyId" | "fontPreviewUrl"> {
  const key = observedFontFamilyKey(family);
  const face = faces.find((row) => observedFontFamilyKey(row.family) === key);
  const historical = history.find(
    (row) => observedFontFamilyKey(row.family) === key,
  );
  const familyId = fontCatalogIdsOf(family)[0] ?? historical?.familyId;
  if (face) {
    return {
      fontFamilyId: familyId,
      fontPreviewUrl: capturedFontPreviewUrl(capture.id, face.observationIndex),
    };
  }
  return {
    fontFamilyId: familyId,
    fontPreviewUrl: familyId ? familyFontPreviewUrl(familyId) : undefined,
  };
}

function inspectArms(capture: Capture): {
  x: Stop[];
  also: Stop[];
  voice: Stop[];
} {
  const x: Stop[] = groupedTerms(capture.id).flatMap((group) =>
    group.terms.map((term) => {
      const measured = measuredTermValue(capture, term.id);
      return {
        id: term.id,
        label: term.label,
        arm: "x" as const,
        material: materialOfGroup(group.id),
        view: { kind: "term" as const, id: term.id },
        meta: measured.swatch
          ? undefined
          : (measured.meta ??
            `${Math.round(termConfidence(capture.id, term.id) * 100)}%`),
        swatch: measured.swatch,
        count: term.count,
      };
    }),
  );
  for (const fact of captureEvidenceFactsOf(capture.id)) {
    x.push({
      id: `evidence-${fact.id}`,
      label: fact.label,
      arm: "x",
      material: "glass",
      meta:
        fact.meta && fact.count != null
          ? `${fact.meta} · ${fact.count}`
          : fact.meta,
      count: fact.meta ? undefined : fact.count,
      loading: fact.loading,
    });
  }

  const related = relatedCounts(capture.id);
  const also: Stop[] = [];
  const faces = typeFaceList(capture.id);
  const role = pageRoleLabel(capture.id);
  const shared = distinctiveTerm(capture.id);

  also.push({
    id: "visual",
    label: "Looks like this",
    arm: "also",
    material: "glass",
    view: { kind: "visual", id: capture.id },
    count: related.visual || undefined,
    thumbnail: mediaUrl(capture.id),
  });
  if (related.semantic > 0) {
    also.push({
      id: "semantic",
      label: shared ? `Shares ${shared}` : "Shared terms",
      arm: "also",
      material: "wood",
      view: { kind: "semantic", id: capture.id },
      count: related.semantic,
    });
  }
  if (related.type > 0) {
    const note = typeSimilar(capture.id)[0]?.note;
    also.push({
      id: "type",
      label: note
        ? `Set in ${note.split(",")[0]!.trim()}`
        : faces
          ? `Set in ${faces}`
          : "Same type",
      arm: "also",
      material: "string",
      view: { kind: "typeSimilar", id: capture.id },
      count: related.type,
    });
  }
  if (related.adjacent > 0) {
    also.push({
      id: "adjacent",
      label: role ? `Other ${role.toLowerCase()}` : "Same role",
      arm: "also",
      material: "wood",
      view: { kind: "adjacent", id: capture.id },
      count: related.adjacent,
    });
  }
  if (related.domain > 1) {
    also.push({
      id: "site",
      label: capture.host,
      arm: "also",
      material: "paper",
      view: { kind: "domain", origin: capture.origin },
      count: related.domain,
      meta: `${related.domain}`,
    });
  }
  if (motionOf(capture.id)) {
    also.push({
      id: "motion",
      label: "Moving",
      arm: "also",
      material: "glass",
      view: { kind: "motion" },
      count: MOTION_COUNT,
    });
  }

  const roles = typeRolesOf(capture.id);
  const styles = textStylesOf(capture.id);
  const facesUsed = namedFonts(capture.id);
  const history = historicalFontsOf(capture.id);

  const voice: Stop[] = typographySummaries(styles, roles, facesUsed, history)
    .slice(0, 6)
    .map((summary) => ({
      id: `font-${summary.key}`,
      label: summary.family,
      arm: "voice" as const,
      material: "string" as const,
      view: { kind: "font" as const, family: summary.family },
      family: summary.family,
      weight: summary.weights.includes(400) ? 400 : (summary.weights[0] ?? 400),
      meta: summary.note,
      typography: {
        roles: summary.roles,
        weights: summary.weights,
        sizes: summary.sizes,
        styles: summary.styles,
        uses: summary.uses,
        note: summary.note,
      },
      ...fontPreview(capture, summary.family, facesUsed, history),
    }));

  return { x, also, voice };
}

export { termById };
