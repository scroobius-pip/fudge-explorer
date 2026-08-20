import { html, nothing } from "lit";
import { store } from "../data/store.js";
import {
  routeFor, baseSet, derive, aggregateTextStyles, termLabel,
} from "../data/indexes.js";
import { esc, rgba, hex, px, intHex, shade, specTxt, norm } from "../data/util.js";
import { specimenCss } from "../data/fonts.js";
import "../components/favicon.js";
import "../components/capture-row.js";
import "../components/font-source.js";

export const L = {
  term: (tid, label) => html`<a class="lk term" data-hop-type="term" data-hop-id=${tid} data-hop-label=${String(label || termLabel(store.data, tid) || "").slice(0, 40)}>${esc(label || termLabel(store.data, tid) || tid)}</a>`,
  facet: (fid) => html`<a class="lk term" data-hop-type="facet" data-hop-id=${fid} data-hop-label=${String(fid || "").slice(0, 40)}>${esc((fid || "").replace(/_/g, " "))}</a>`,
  dom: (origin) => html`<a class="lk dom" data-hop-type="domain" data-hop-id=${origin} data-hop-label=${String(origin || "").replace("https://", "").slice(0, 40)}><fudge-favicon .origin=${origin} inline></fudge-favicon>${esc((origin || "").replace("https://", ""))}</a>`,
  fam: (id, name) => html`<a class="lk fam" data-hop-type="family" data-hop-id=${id} data-hop-label=${String(name || "").slice(0, 40)}>${esc(name || "family " + id)}</a>`,
  cap: (id, title) => html`<a class="lk" data-hop-type="capture" data-hop-id=${id} data-hop-label=${String(title || "").slice(0, 40)}>${esc(title || "capture " + id)}</a>`,
  browse: (kind, value, label) => html`<a class="lk" data-hop-type="browse" data-hop-id=${kind} data-hop-label=${String(label || value || "")}>${esc(label || value || "")}</a>`,
  fs: (label) => html`<a class="lk fam" data-hop-type="fontSim" data-hop-id="font-similarity" data-hop-label=${String(label || "").slice(0, 40)}>${esc(label || "font similarity")}</a>`,
  rel: (label) => html`<a class="lk" data-hop-type="relations" data-hop-id="relations" data-hop-label=${String(label || "").slice(0, 40)}>${esc(label || "relations")}</a>`,
  run: (label) => html`<a class="lk" data-hop-type="runtime" data-hop-id="runtime" data-hop-label=${String(label || "").slice(0, 40)}>${esc(label || "runtime")}</a>`,
  sec: (cid, key, label) => html`<a class="lk" data-hop-type="section" data-hop-id="${cid}:${key}" data-hop-label=${String(label || "").slice(0, 40)}>${esc(label || key)}</a>`,
  motion: (cid, label) => html`<a class="lk motion-badge" data-hop-type="motion" data-hop-id=${cid} data-hop-label="motion #${cid}">${esc(label || "motion")}</a>`,
  filter: (route, kind, label) => html`<a class="lk" data-hop-type="browse" data-hop-id="filter|${route}|${kind}" data-hop-label=${String(label || "").slice(0, 40)}>${esc(label || kind)}</a>`,
  index: (kind, label) => html`<a class="lk" data-hop-type="index" data-hop-id=${kind} data-hop-label=${String(label || "").slice(0, 40)}>${esc(label || kind)}</a>`,
  designer: (id, name) => html`<a class="lk fam" data-hop-type="designer" data-hop-id=${id} data-hop-label=${String(name || "").slice(0, 40)}>${esc(name || "designer " + id)}</a>`,
  vendor: (id, name) => html`<a class="lk fam" data-hop-type="vendor" data-hop-id=${id} data-hop-label=${String(name || "").slice(0, 40)}>${esc(name || "vendor " + id)}</a>`,
};

export function capRow(cp, meta = "", note = "", options = {}) {
  return html`<capture-row .capture=${cp} .meta=${meta} .note=${note} .evidence=${options.evidence || null}></capture-row>`;
}

export function navRow(type, id, label, meta, content = null, className = "row") {
  return html`
    <button class=${className} data-hop-type=${type} data-hop-id=${id} data-hop-label=${String(label || "").slice(0, 34)}>
      <span class="t">${content == null ? esc(label) : content}</span>
      <span class="s">${esc(meta || "")}</span>
    </button>`;
}

export function evRow(title, preview, count, type, id, label, palette = nothing) {
  return html`
    <button class="evidence-family-row" data-hop-type=${type} data-hop-id=${id} data-hop-label=${String(label || "").slice(0, 40)}>
      <span class="evidence-family-copy">
        <span class="evidence-family-title">${esc(title)}</span>
        ${preview ? html`<span class="evidence-family-preview">${preview}</span>` : nothing}
        ${palette}
      </span>
      <span class="evidence-count">${count}</span>
      <span class="row-arrow">›</span>
    </button>`;
}

export function KV(rows) {
  return html`<div class="kv">${rows.map(([k, v, mono]) => html`
    <div class="r"><span class="k">${k}</span><span class="v${mono ? " mono" : ""}">${v}</span></div>`)}
  </div>`;
}

export function section(title, content, count) {
  return html`<div class="sec">
    <h4>${title}${count == null ? "" : html` <span class="n">${count}</span>`}</h4>
    ${content}
  </div>`;
}

export function boundsMap(cp, bounds, label) {
  const [x, y, w, h] = bounds;
  return html`
    <div class="bounds-map" style=${cp ? `background-image:url('${cp[5]}')` : ""}>
      <div class="bounds-box" style=${`left:${x / 100}%;top:${y / 100}%;width:${w / 100}%;height:${h / 100}%`}></div>
      <div class="bounds-label">${esc(label)}</div>
    </div>
    <div class="geometry">
      <span>x ${x}</span><span>y ${y}</span><span>w ${w}</span><span>h ${h}</span>
    </div>`;
}

export function gradientInner(row, bgHex) {
  const kind = row.kind || "linear";
  const ang = row.angle_millidegrees != null ? Math.round(row.angle_millidegrees / 1000) + "°" : null;
  const exactStops = (row.stops || []).filter((stop) => stop.r != null && stop.g != null && stop.b != null);
  const stops = exactStops.length
    ? exactStops.map((stop) => rgba(stop.r, stop.g, stop.b, stop.alpha_ppm) + (stop.position_ppm == null ? "" : " " + Math.round(stop.position_ppm / 10000) + "%"))
    : [bgHex || "#9aa1a8", shade(bgHex || "#9aa1a8", 0.55)];
  const css = kind === "radial"
    ? "radial-gradient(circle at 50% 35%, " + stops.join(",") + ")"
    : "linear-gradient(" + (ang || 135) + "deg, " + stops.join(",") + ")";
  const bits = [kind, ang, row.occurrence_count ? row.occurrence_count + "×" : null, String(row.evidence_kind || "").replace(/_/g, " ")].filter(Boolean).join(" · ");
  return html`
    <span class="sw grad-prev" style=${`background:${css}`}></span>
    <span class="t">${esc(kind)}${ang ? " · " + ang : ""}</span>
    <span class="s">${esc(bits)}</span>`;
}

export function gradientRow(row, bgHex) {
  const exact = (row.stops || []).length;
  return html`
    <div class="row" style="cursor:default"
      title="${esc((row.kind || "linear") + " gradient" + (row.angle_millidegrees != null ? " at " + Math.round(row.angle_millidegrees / 1000) + "°" : "") + (exact ? " · " + exact + " captured stops" : " · stop colors unavailable; fallback preview"))}">
      ${gradientInner(row, bgHex)}
    </div>`;
}

export function legacyPalette(ctx, rows) {
  if (!rows.length) return nothing;
  return html`<div class="sec">
    <h4>legacy palette <span class="n">${rows.length}</span></h4>
    <div class="hint">retained corpus palette</div>
    ${ctx.rows(rows, (row) => {
      const rgb = Array.isArray(row) ? row[0] : row;
      const frequency = Array.isArray(row) ? row[1] : null;
      return html`<div class="row" style="cursor:default">
        <span class="sw" style=${`background:${intHex(rgb)}`}></span>
        <span class="t">palette</span>
        <span class="s">${intHex(rgb)}${frequency ? " · " + frequency + "×" : ""}</span>
      </div>`;
    }, 24)}
  </div>`;
}

export function colorRow([role, r, g, b, a, occ]) {
  const tid = "color.role." + role;
  return html`<div class="row" style="cursor:default">
    <span class="sw" style=${`background:${rgba(r, g, b, a)}`}></span>
    <span class="t">${L.term(tid, role)}</span>
    <span class="s">${hex(r, g, b)}${a != null && a < 1000000 ? " · " + Math.round(a / 10000) + "% alpha" : ""}${occ ? " · " + occ : ""}</span>
  </div>`;
}

export function termValueNote(idx, cid, tid) {
  const parts = [];
  if (tid.startsWith("color.role.")) {
    const c = (idx.colorsByCap.get(cid) || []).find((x) => x[0] === tid.slice(11));
    if (c) parts.push(html`<span class="sw" style=${`background:${rgba(c[1], c[2], c[3], c[4])}`}></span>${hex(c[1], c[2], c[3])}`);
  } else if (tid.startsWith("typography.role.")) {
    const f = (idx.typeByCap.get(cid) || []).find((x) => x[0] === tid.slice(16));
    if (f) parts.push(esc(f[1]));
  }
  return parts;
}

export function termEvidenceNote(row, termId = "") {
  const kind = row[6];
  const values = row[8] || [];
  if (kind === "text_style") {
    const [fam, generic, weight, style, size, lineHeight, letterSpacing, r, g, b, alpha, occurrences] = values;
    const family = fam || (generic && generic !== "unknown" ? generic : "");
    const type = [family, weight, size != null ? px(size) : "", lineHeight != null ? "/ " + px(lineHeight) : "", letterSpacing != null ? "tracking " + px(letterSpacing) : "", style].filter(Boolean).join(" · ").replace(" · / ", " / ");
    const color = termId.startsWith("color.role.") && r != null && g != null && b != null ? hex(r, g, b) : "";
    return html`${[type, color, occurrences ? occurrences + "×" : ""].filter(Boolean).map((part, i) => i ? html` · ${part}` : part)}`;
  }
  if (kind === "background_property") {
    const [r, g, b, a, occ] = values;
    return r == null ? "background value unavailable" : html`<span class="sw" style=${`background:${rgba(r, g, b, a)}`}></span>${hex(r, g, b)}${occ ? " · " + occ + "×" : ""}`;
  }
  if (kind === "raster_palette_color") {
    const [r, g, b, a, coverage, occ] = values;
    return html`<span class="sw" style=${`background:${rgba(r, g, b, a)}`}></span>${hex(r, g, b)}${coverage != null ? " · " + Math.round(coverage / 10000) + "% coverage" : ""}${occ ? " · " + occ + "×" : ""}`;
  }
  if (kind === "structure_observation") {
    const [declared, x, y, w, h, coverage, occ] = values;
    return `${esc(declared || "structure")} · ${Math.round(w / 100)}% × ${Math.round(h / 100)}%${coverage != null ? " · " + Math.round(coverage / 10000) + "% coverage" : ""}${occ ? " · " + occ + "×" : ""}`;
  }
  return esc(String(kind || "measured support").replace(/_/g, " "));
}

export function typeSample(fam, style, fallbackStack = "") {
  return html`<div class="type-sample" style=${specimenCss(fam, fallbackStack) + ";" + style}>${specTxt()}</div>`;
}

export function sourceNote(fam, stack, captureId, observationIndex) {
  return html`<font-source .family=${fam} .stack=${stack} .captureId=${captureId ?? null} .observationIndex=${observationIndex ?? null} .representative=${captureId == null || observationIndex == null}></font-source>`;
}

export function foot(ctx, c) {
  const { store, idx } = ctx;
  const D = store.data;
  let route = routeFor(c);
  const isSingleCap = route.startsWith("cap|");
  if (isSingleCap) {
    const s = baseSet(store, route);
    if (!derive(store, s, "colors").size && !derive(store, s, "families").size && !derive(store, s, "terms").size) {
      const cp = idx.cById.get(Number(route.split("|")[1]));
      if (cp && (idx.cByDomain.get(cp[1]) || []).length > 1) route = "dom|" + cp[1];
    }
  }
  const set = baseSet(store, route);
  const labels = {
    captures: "captures", domains: "domains", families: "font names", text: "text styles",
    terms: "terms", facets: "facets", colors: "color captures", motion: "motion", video: "video",
  };
  const items = Object.entries(labels).flatMap(([kind, label]) => {
    if (kind === "captures" && isSingleCap) return [];
    const n = kind === "text" ? aggregateTextStyles(idx, [...set]).length : derive(store, set, kind).size;
    return n ? [{ kind, label, n }] : [];
  });
  return html`<div class="foot">${items.map(({ kind, label, n }, index) => html`${index ? " · " : ""}${L.filter(route, kind, n.toLocaleString() + " " + label)}`)}</div>`;
}

export const SECTION_DESC = {
  colors: "Measured interface color roles with their resolved values and occurrence.",
  backgrounds: "Dominant background color samples from the screenshot.",
  fonts: "CSS font families with computed stacks, weight ranges and usage.",
  typography: "Resolved typography roles — display, heading, body, UI — with family, weight and size.",
  text: "Font family, weight and size measured per text node.",
  structures: "Recognized page regions and interface structures with geometry.",
  gradients: "Gradient kinds, angles and exact retained color stops measured from computed styles.",
  effects: "Measured borders, shadows, radii, spacing, media and collection completeness for this capture.",
  terms: "Design terms assigned from the Fudge ontology, with confidence.",
  hist: "Legacy font attributions from earlier corpus versions.",
  ann: "Captures with the nearest screenshot embeddings.",
  sim: "Captures sharing the most resolved terms.",
  samepath: "The same path captured on other domains.",
  video: "Video elements detected in the rendered page, with geometry and coverage.",
};

export const ROW_FIELDS = {
  colors: ["capture_id", "role", "r", "g", "b", "alpha_ppm", "occurrence_count", "rank"],
  backgrounds: ["capture_id", "r", "g", "b", "alpha_ppm", "occurrence_count", "evidence_kind", "observation_index"],
  fonts: ["capture_id", "observation_index", "declared_family", "computed_css_stack", "weight_min", "weight_max", "character_share_ppm", "occurrence_count"],
  typography: ["capture_id", "role", "declared_family", "weight", "size_milli_px", "line_height_milli_px", "character_share_ppm", "rank", "generic_family", "style", "letter_spacing_milli_px", "occurrence_count", "measure_milli_px", "confidence_ppm", "evidence_kind"],
  text: ["capture_id", "declared_family", "weight", "size_milli_px", "occurrence_count", "observation_index", "generic_family", "style", "line_height_milli_px", "letter_spacing_milli_px", "alignment", "text_transform", "r", "g", "b", "alpha_ppm", "character_share_ppm", "evidence_kind"],
  structures: ["capture_id", "structure_id", "parent_structure_id", "term_id", "x_q", "y_q", "width_q", "height_q", "salience_rank", "repeat_count", "column_count", "row_count", "gap_milli_px", "confidence_ppm", "evidence_kind"],
  gradients: ["gradient_id", "structure_id", "structure_observation_index", "kind", "angle_millidegrees", "x_q", "y_q", "width_q", "height_q", "occurrence_count", "evidence_kind"],
  terms: ["capture_id", "term_id", "confidence", "assignment_scope", "resolution_kind"],
  hist: ["capture_id", "family_id", "family_name", "sub_family_name", "legacy_link_count", "sub_family_id"],
  ann: ["capture_id", "distance"],
  video: ["capture_id", "observation_index", "media_kind", "x_q", "y_q", "width_q", "height_q", "coverage_ppm", "occurrence_count", "evidence_kind"],
};

export function rowObject(key, raw, cid) {
  if (!Array.isArray(raw)) return Object.assign({}, raw, key === "gradients" ? { capture_id: cid } : {});
  return Object.assign(
    Object.fromEntries((ROW_FIELDS[key] || []).map((field, i) => [field, raw[i]])),
    key === "gradients" ? { capture_id: cid } : {},
  );
}

export function rowVal(idx, key, field, v) {
  if (v == null || v === "") return "—";
  if (field === "declared_family" || field === "family_name") {
    return esc(v);
  }
  if (field === "term_id") return L.term(v);
  if (field === "capture_id") {
    const cp = idx.cById.get(Number(v));
    return cp ? L.cap(v, cp[3]) : esc("#" + v);
  }
  if (field === "confidence") return Math.round(Number(v) * 100) + "%";
  if (field === "confidence_ppm" || field === "alpha_ppm" || field === "coverage_ppm" || field === "character_share_ppm") return Math.round(Number(v) / 10000) + "%";
  if (field === "size_milli_px" || field === "line_height_milli_px" || field === "letter_spacing_milli_px" || field === "measure_milli_px" || field === "gap_milli_px") return px(v);
  if (field === "weight_min" || field === "weight_max" || field === "weight" || field === "structure_id" || field === "family_id") return String(v);
  return esc(String(v));
}

export function textStyleRows(ctx, caps) {
  const { idx } = ctx;
  const attributed = new Map();
  for (const cid of caps) {
    for (const row of idx.histByCap.get(cid) || []) {
      const key = norm(row[1]);
      if (!attributed.has(key)) attributed.set(key, { id: row[0], name: row[1], captures: new Set() });
      attributed.get(key).captures.add(cid);
    }
  }
  const context = attributed.size ? html`<div class="hint">Capture-level font attributions: ${[...attributed.values()].map((item) => {
    const family = idx.fById.get(item.id);
    const link = family ? L.fam(family[0], item.name) : esc(item.name);
    return html`${link} · ${item.captures.size} captures`;
  })}. These are not linked to individual text styles.</div>` : nothing;
  return html`${context}${ctx.rows(aggregateTextStyles(idx, caps), (style) => {
    const label = style.fam
      ? esc(style.fam)
      : [style.weight, px(style.size)].filter(Boolean).join(" · ") || "text style";
    const meta = [style.captures.size + " captures", style.occurrences + "×", style.lineHeight ? "line " + px(style.lineHeight) : "", style.tracking ? "tracking " + px(style.tracking) : "", style.alignment, style.transform].filter(Boolean).join(" · ");
    const color = style.r != null && style.g != null && style.b != null
      ? html`<span class="sw" style=${`background:${rgba(style.r, style.g, style.b, style.alpha)}`}></span>${hex(style.r, style.g, style.b)}`
      : "";
    return html`
      <div class="row" style="cursor:default">
        <span class="t">${label}${color ? html` · ${color}` : ""}</span>
        <span class="s">${meta}</span>
      </div>
      ${style.fam ? html`
        <div class="type-sample" style=${specimenCss(style.fam) + ";font-weight:" + (style.weight || 400) + ";font-style:" + (style.style || "normal") + ";font-size:" + Math.min(24, Math.max(13, (style.size || 14000) / 1000)) + "px;line-height:" + (style.lineHeight ? px(style.lineHeight) : "1.4") + ";letter-spacing:" + (style.tracking ? px(style.tracking) : "0") + ";color:" + (style.r != null ? rgba(style.r, style.g, style.b, style.alpha) : "var(--ink)")}>${specTxt()}</div>
        ${sourceNote(style.fam, "", null, null)}` : nothing}`;
  }, 120)}`;
}
