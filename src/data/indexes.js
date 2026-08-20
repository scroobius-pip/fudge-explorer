import { norm, pushMap } from "./util.js";

export const TYPE = {
  home: { label: "dataset", color: "var(--entity-ink)" }, domain: { label: "domain", color: "var(--entity-domain)" },
  capture: { label: "capture", color: "var(--entity-capture)" }, term: { label: "term", color: "var(--entity-term)" },
  facet: { label: "facet", color: "var(--entity-facet)" }, family: { label: "font family", color: "var(--entity-family)" },
  designer: { label: "designer", color: "var(--entity-designer)" }, vendor: { label: "vendor", color: "var(--entity-designer)" },
  browse: { label: "browse", color: "var(--entity-neutral)" }, index: { label: "index", color: "var(--entity-neutral)" },
  structure: { label: "structure", color: "var(--entity-structure)" }, motion: { label: "motion", color: "var(--entity-motion)" },
  video: { label: "video", color: "var(--entity-video)" },
  runtime: { label: "runtime", color: "var(--entity-neutral)" }, section: { label: "section", color: "var(--entity-neutral)" },
  row: { label: "row", color: "var(--entity-neutral)" }, rawCapture: { label: "raw capture", color: "var(--entity-neutral)" },
  relations: { label: "schema", color: "var(--entity-neutral)" }, relation: { label: "relation", color: "var(--entity-neutral)" },
  fontSim: { label: "font similarity", color: "var(--entity-family)" }, fontLookup: { label: "similarity lookup", color: "var(--entity-family)" },
  capturedFont: { label: "captured font", color: "var(--entity-family)" },
  capturedFontLookup: { label: "captured font similarity", color: "var(--entity-family)" },
  embeddings: { label: "embeddings", color: "var(--entity-color)" },
};

const INDEX_MAPS = ["cById", "cByDomain", "termsByCap", "capsByTerm", "fById", "dgById", "vById", "fByDesigner",
  "fByVendor", "relsById", "relCount", "colorsByCap", "legacyColorsByCap", "bgByCap", "fontsByCap", "typeByCap",
  "famByNorm", "capsByFam", "famGroups", "textByCap", "histByCap", "structuresByCap", "annByCap", "motionByCap",
  "videoByCap", "gradientsByCap", "simRes", "catMatch", "capturedFontsByNorm", "cByPath", "cByTheme", "cByDevice", "cByState"];

export function createIndexes() {
  return Object.assign(Object.fromEntries(INDEX_MAPS.map((k) => [k, new Map()])), { embeddedById: new Set() });
}

export function captureFamilies(idx, cid) {
  const names = [
    ...(idx.fontsByCap.get(cid) || []).map((row) => row[0]),
    ...(idx.typeByCap.get(cid) || []).map((row) => row[1]),
    ...(idx.textByCap.get(cid) || []).map((row) => row[0]),
    ...(idx.histByCap.get(cid) || []).map((row) => row[1]),
  ].filter(Boolean);
  return [...new Map(names.map((name) => [norm(name), name])).values()];
}

export function famResolve(idx, fam) {
  const k = norm(fam);
  const cm = idx.catMatch.get(k);
  if (cm && cm.length && idx.fById.has(cm[0])) return idx.fById.get(cm[0]);
  return idx.famByNorm.get(k) || null;
}

export function aggregateTextStyles(idx, captureIds) {
  const styles = new Map();
  for (const cid of captureIds) {
    for (const [fam, weight, size, occurrences, observationIndex, generic, style, lineHeight, tracking,
      alignment, transform, r, g, b, alpha, share, evidence] of idx.textByCap.get(cid) || []) {
      const key = [norm(fam), weight || "", size || "", lineHeight || "", tracking || "", r ?? "", g ?? "", b ?? "", alpha ?? ""].join("|");
      if (!styles.has(key)) {
        styles.set(key, {
          fam, weight, size, generic, style, lineHeight, tracking, alignment, transform,
          r, g, b, alpha, share, evidence, occurrences: 0, captures: new Set(),
        });
      }
      const aggregate = styles.get(key);
      aggregate.occurrences += occurrences || 0;
      aggregate.captures.add(cid);
    }
  }
  return [...styles.values()].sort((a, b) => b.occurrences - a.occurrences);
}

export function buildIndexes(data, gradients, legacyColors) {
  const idx = createIndexes();
  for (const c of data.captures) {
    idx.cById.set(c[0], c);
    pushMap(idx.cByDomain, c[1], c);
    pushMap(idx.cByPath, c[2], c);
    pushMap(idx.cByTheme, c[7], c);
    pushMap(idx.cByDevice, c[6], c);
    pushMap(idx.cByState, c[8], c);
  }
  for (const [cid, tid, conf, scope, resolution] of data.assignments) {
    pushMap(idx.termsByCap, cid, [tid, conf, scope, resolution]);
    pushMap(idx.capsByTerm, tid, [cid, conf, scope, resolution]);
  }
  for (const f of data.families) {
    idx.fById.set(f[0], f);
    idx.famByNorm.set(norm(f[1]), f);
    pushMap(idx.famGroups, norm(f[1]), f);
    if (f[2] != null) pushMap(idx.fByDesigner, f[2], f);
    if (f[3] != null) pushMap(idx.fByVendor, f[3], f);
  }
  for (const dg of data.designers) idx.dgById.set(dg[0], dg);
  for (const v of data.vendors) idx.vById.set(v[0], v);
  for (const r of data.releases) {
    pushMap(idx.relsById, r[0], r);
    idx.relCount.set(r[0], (idx.relCount.get(r[0]) || 0) + 1);
  }
  for (const [cid, role, r, g, b, a, occ, rank] of data.color_roles) {
    pushMap(idx.colorsByCap, cid, [role, r, g, b, a, occ, rank]);
  }
  for (const [cid, rows] of Object.entries(legacyColors || {})) idx.legacyColorsByCap.set(Number(cid), rows);
  for (const [cid, r, g, b, a, occ, evidence, oi] of data.backgrounds) {
    pushMap(idx.bgByCap, cid, [r, g, b, a, occ, evidence, oi]);
  }
  for (const [cid, rows] of Object.entries(gradients || {})) {
    idx.gradientsByCap.set(Number(cid), rows);
  }
  for (const [cid, oi, fam, stack, wmin, wmax, share, occ] of data.font_obs) {
    pushMap(idx.fontsByCap, cid, [fam, stack, wmin, wmax, share, occ, oi]);
    if (fam) pushMap(idx.capturedFontsByNorm, norm(fam), [cid, oi, fam]);
  }
  for (const [cid, role, fam, w, size, lh, share, rank, generic, style, tracking, occ, measure, conf, evidence] of data.type_roles) {
    pushMap(idx.typeByCap, cid, [role, fam, w, size, lh, share, rank, generic, style, tracking, occ, measure, conf, evidence]);
  }
  for (const row of data.text_styles || []) {
    const [cid, fam, w, size, occ, oi, generic, style, lh, tracking, alignment, transform, r, g, b, alpha, share, evidence] = row;
    pushMap(idx.textByCap, cid, [fam, w, size, occ, oi, generic, style, lh, tracking, alignment, transform, r, g, b, alpha, share, evidence]);
  }
  for (const row of data.hist_fonts || []) {
    const [cid, fid, name, sub, links, subId] = row;
    pushMap(idx.histByCap, cid, [fid, name, sub, links, subId]);
  }
  for (const row of data.structures || []) {
    const [cid, sid, parent, tid, x, y, w, h, salience, repeat, columns, rows, gap, conf, evidence] = row;
    pushMap(idx.structuresByCap, cid, [sid, parent, tid, x, y, w, h, salience, repeat, columns, rows, gap, conf, evidence]);
  }
  for (const [cid, rows] of Object.entries(data.ann || {})) {
    for (const r of rows) pushMap(idx.annByCap, Number(cid), [r[0], r[1]]);
  }
  for (const r of data.motion_assets || []) idx.motionByCap.set(r[0], r);
  for (const v of data.video_observations || []) {
    pushMap(idx.videoByCap, v.capture_id, [v.observation_index, v.x_q, v.y_q, v.width_q, v.height_q, v.coverage_ppm, v.occurrence_count]);
  }
  for (const c of data.embedded_video_captures || []) idx.embeddedById.add(c.id);
  for (const [name, rows] of Object.entries(data.font_similarity_results || {})) {
    idx.simRes.set(norm(name), rows);
  }
  for (const [name, ids] of Object.entries(data.catalog_matches || {})) {
    idx.catMatch.set(norm(name), ids);
  }
  for (const cp of data.captures) {
    for (const fam of captureFamilies(idx, cp[0])) pushMap(idx.capsByFam, norm(fam), [cp[0], fam]);
  }
  return idx;
}

/* ---------- filter routes ---------- */

export const ROUTE_SOURCES = {
  all: (D) => D.captures.map((cp) => cp[0]),
  cap: (_D, v, idx) => [Number(v)],
  mov: (_D, v, idx) => (idx.motionByCap.has(Number(v)) ? [Number(v)] : []),
  vid: (_D, v, idx) => (idx.videoByCap.has(Number(v)) || idx.embeddedById.has(Number(v)) ? [Number(v)] : []),
  dom: (_D, v, idx) => (idx.cByDomain.get(v) || []).map((cp) => cp[0]),
  fam: () => [],
  ter: (_D, v, idx) => (idx.capsByTerm.get(v) || []).map(([cid]) => cid),
  fac: (D, v, idx) => Object.keys(D.terms).filter((t) => termFacet(D, t) === v).flatMap((t) => (idx.capsByTerm.get(t) || []).map(([cid]) => cid)),
};

export const CAPTURE_FILTERS = {
  motion: (_D, _idx, cid) => null,
  video: (_D, _idx, cid) => null,
  colors: (_D, _idx, cid) => null,
  gradients: (_D, _idx, cid) => null,
  typography: (_D, _idx, cid) => null,
  text: (_D, _idx, cid) => null,
};
CAPTURE_FILTERS.motion = (_D, idx, cid) => idx.motionByCap.has(cid);
CAPTURE_FILTERS.video = (_D, idx, cid) => idx.videoByCap.has(cid) || idx.embeddedById.has(cid);
CAPTURE_FILTERS.colors = (_D, idx, cid) => (idx.colorsByCap.get(cid) || []).length || (idx.legacyColorsByCap.get(cid) || []).length;
CAPTURE_FILTERS.gradients = (_D, idx, cid) => (idx.gradientsByCap.get(cid) || []).length;
CAPTURE_FILTERS.typography = (_D, idx, cid) => (idx.typeByCap.get(cid) || []).length;
CAPTURE_FILTERS.text = (_D, idx, cid) => (idx.textByCap.get(cid) || []).length;

export const PROJECTIONS = {
  domains: (_D, idx, cid) => [(idx.cById.get(cid) || [])[1]],
  families: (_D, idx, cid) => captureFamilies(idx, cid).map(norm),
  terms: (_D, idx, cid) => (idx.termsByCap.get(cid) || []).map(([t]) => t),
  facets: (D, idx, cid) => (idx.termsByCap.get(cid) || []).map(([t]) => termFacet(D, t)),
};

export function termLabel(D, t) {
  return String((D.terms[t] && D.terms[t][0]) || t || "");
}
export function termFacet(D, t) {
  return (D.terms[t] && D.terms[t][2]) || "";
}
export function termDef(D, t) {
  return (D.terms[t] && D.terms[t][1]) || "";
}

export function baseSet(store, route) {
  const { D, idx } = store;
  if (!route) route = "all";
  if (route.startsWith("filter|")) {
    const inner = route.slice(7);
    const i = inner.lastIndexOf("|");
    const set = baseSet(store, inner.slice(0, i));
    const test = CAPTURE_FILTERS[inner.slice(i + 1)];
    return test ? new Set([...set].filter((cid) => test(D, idx, cid))) : set;
  }
  const i = route.indexOf("|");
  const kind = i < 0 ? route : route.slice(0, i);
  const value = i < 0 ? "" : route.slice(i + 1);
  return new Set((ROUTE_SOURCES[kind] || (() => []))(D, value, idx));
}

export function derive(store, set, kind) {
  const { D, idx } = store;
  if (kind === "captures") return set;
  const test = CAPTURE_FILTERS[kind];
  if (test) return new Set([...set].filter((cid) => test(D, idx, cid)));
  const project = PROJECTIONS[kind];
  return project ? new Set([...set].flatMap((cid) => project(D, idx, cid)).filter(Boolean)) : set;
}

export const ROUTE_TYPES = { capture: "cap", motion: "mov", video: "vid", domain: "dom", family: "fam", term: "ter", facet: "fac" };

export function routeFor(c) {
  if (!c) return "all";
  if (["capture", "section", "row", "rawCapture", "capturedFont", "capturedFontLookup"].includes(c.type)) return "cap|" + String(c.id).split(/[:|]/)[0];
  if (c.type === "browse") return String(c.id).startsWith("filter|") ? c.id : "all";
  const id = c.type === "video" ? String(c.id).split(":")[0] : c.id;
  return ROUTE_TYPES[c.type] ? ROUTE_TYPES[c.type] + "|" + id : "all";
}

export function similarCaptures(idx, cid) {
  const my = idx.termsByCap.get(cid);
  if (!my) return [];
  const tally = new Map();
  for (const [tid] of my) {
    for (const [oc] of idx.capsByTerm.get(tid) || []) {
      if (oc === cid) continue;
      tally.set(oc, (tally.get(oc) || 0) + 1);
    }
  }
  return [...tally.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);
}

export function countBy(caps, project) {
  const counts = new Map();
  for (const cid of caps) {
    for (const value of project(cid).filter(Boolean)) counts.set(value, (counts.get(value) || 0) + 1);
  }
  return [...counts].sort((a, b) => b[1] - a[1]);
}

export function domainProfile(store, origin, exceptCid) {
  const { idx } = store;
  if (!origin) return null;
  const caps = idx.cByDomain.get(origin) || [];
  let best = null;
  let bestScore = 0;
  for (const cp of caps) {
    const cid = cp[0];
    if (cid === exceptCid) continue;
    const score = (idx.colorsByCap.get(cid) || []).length + (idx.legacyColorsByCap.get(cid) || []).length
      + (idx.bgByCap.get(cid) || []).length + (idx.fontsByCap.get(cid) || []).length
      + (idx.typeByCap.get(cid) || []).length + (idx.textByCap.get(cid) || []).length
      + (idx.termsByCap.get(cid) || []).length
      + (idx.gradientsByCap.get(cid) || []).length + (idx.structuresByCap.get(cid) || []).length;
    if (score > bestScore) { bestScore = score; best = cp; }
  }
  if (!best || !bestScore) return null;
  const cid = best[0];
  return {
    cid, cp: best, score: bestScore,
    colors: idx.colorsByCap.get(cid) || [], legacyColors: idx.legacyColorsByCap.get(cid) || [],
    bg: idx.bgByCap.get(cid) || [], fonts: idx.fontsByCap.get(cid) || [],
    types: idx.typeByCap.get(cid) || [], texts: idx.textByCap.get(cid) || [],
    grads: idx.gradientsByCap.get(cid) || [], terms: idx.termsByCap.get(cid) || [],
  };
}
