import { html, nothing } from "lit";
import { store } from "../data/store.js";
import {
  aggregateTextStyles, similarCaptures, domainProfile, termLabel, termFacet,
} from "../data/indexes.js";
import { esc, rgba, hex, px, fmtDate, fmtDateTime, intHex, specTxt } from "../data/util.js";
import { specimenCss } from "../data/fonts.js";
import {
  L, capRow, KV, section, foot, evRow, boundsMap, gradientRow, legacyPalette,
  termValueNote, textStyleRows, SECTION_DESC, ROW_FIELDS, rowObject, rowVal,
} from "./shared.js";
import "../components/capture-row.js";
import "../components/capture-shot.js";

export function vCapture(c, ctx) {
  const { idx, D } = ctx;
  const id = c.id;
  const cp = idx.cById.get(id);
  if (!cp) return { n: null, body: html`<div class="empty">capture not found</div>` };
  const colors = idx.colorsByCap.get(id) || [];
  const legacyColors = idx.legacyColorsByCap.get(id) || [];
  const bg = idx.bgByCap.get(id) || [];
  const fonts = idx.fontsByCap.get(id) || [];
  const texts = idx.textByCap.get(id) || [];
  const hists = idx.histByCap.get(id) || [];
  const types = idx.typeByCap.get(id) || [];
  const structs = idx.structuresByCap.get(id) || [];
  const ann = idx.annByCap.get(id) || [];
  const liveAnn = Boolean(D.embedding_runtime?.active_generation_id);
  const motion = idx.motionByCap.get(id);
  const vids = idx.videoByCap.get(id) || [];
  const grads = idx.gradientsByCap.get(id) || [];
  const textAgg = aggregateTextStyles(idx, [id]);
  const terms = idx.termsByCap.get(id) || [];
  const sim = similarCaptures(idx, id);
  const pathCaps = idx.cByPath.get(cp[2]) || [];
  const samePath = new Set(pathCaps.map((x) => x[1]));
  samePath.delete(cp[1]);
  const lkTheme = cp[7] && cp[7] !== "unknown" ? L.browse("theme", cp[7], cp[7]) : "—";
  const lkDevice = cp[6] && cp[6] !== "unknown" ? L.browse("device", cp[6], cp[6]) : "—";
  const lkState = cp[8] && cp[8] !== "unknown" ? L.browse("state", cp[8], cp[8]) : "—";
  const famNames = (fs) => [...new Set(fs.map((f) => f.fam ?? f[0]).filter(Boolean))].slice(0, 3).map(esc).join(" · ");
  const pal = html`<div class="palette-mini">${colors.slice(0, 8).map((cl) => html`<i style=${`background:${hex(cl[1], cl[2], cl[3])}`}></i>`)}</div>`;
  const rows = [];
  if (motion) rows.push(evRow("Recorded motion", "▶ " + (motion[4] / 1000).toFixed(1) + "s · " + motion[5] + "×" + motion[6] + " · " + (motion[3] / 1048576).toFixed(1) + " MB", 1, "motion", id, "motion #" + id));
  if (vids.length) rows.push(evRow("Page video", vids.length + " element" + (vids.length === 1 ? "" : "s") + " · max " + Math.round(Math.max(...vids.map((v) => v[5])) / 10000) + "%", vids.length, "section", id + ":video", "Page video"));
  const motionGroup = rows.length ? section("motion", rows) : nothing;
  const dom = (!colors.length && !bg.length && !fonts.length && !types.length && !texts.length && !terms.length) ? domainProfile(store, cp[1], id) : null;
  const colsRows = [];
  if (colors.length) colsRows.push(evRow("Measured colors", colors.slice(0, 3).map((cl) => hex(cl[1], cl[2], cl[3])).join(" · "), colors.length, "section", id + ":colors", "Measured colors", pal));
  if (dom && dom.colors.length) colsRows.push(evRow("Domain colors", dom.colors.slice(0, 3).map((cl) => hex(cl[1], cl[2], cl[3])).join(" · "), dom.colors.length, "browse", "filter|dom|" + cp[1] + "|colors", "Domain colors · capture #" + dom.cid,
    html`<div class="palette-mini">${dom.colors.slice(0, 8).map((cl) => html`<i style=${`background:${hex(cl[1], cl[2], cl[3])}`}></i>`)}</div>`));
  if (dom && dom.legacyColors.length) colsRows.push(evRow("Domain legacy palette", dom.legacyColors.slice(0, 3).map((row) => intHex(Array.isArray(row) ? row[0] : row)).join(" · "), dom.legacyColors.length, "capture", dom.cid, "Domain legacy palette"));
  if (bg.length) colsRows.push(evRow("Backgrounds", bg.slice(0, 2).map((b) => hex(b[0], b[1], b[2])).join(" · "), bg.length, "section", id + ":backgrounds", "Backgrounds"));
  if (dom && dom.bg.length) colsRows.push(evRow("Domain backgrounds", dom.bg.slice(0, 2).map((b) => hex(b[0], b[1], b[2])).join(" · "), dom.bg.length, "browse", "filter|dom|" + cp[1] + "|colors", "Domain backgrounds"));
  if (fonts.length) colsRows.push(evRow("Fonts", famNames(fonts), fonts.length, "section", id + ":fonts", "Fonts"));
  if (dom && dom.fonts.length) colsRows.push(evRow("Domain fonts", [...new Set(dom.fonts.map((f) => f[0]))].slice(0, 3).map(esc).join(" · "), dom.fonts.length, "browse", "filter|dom|" + cp[1] + "|families", "Domain fonts"));
  if (types.length) colsRows.push(evRow("Typography", types.slice(0, 3).map((t) => t[0]).join(" · "), types.length, "section", id + ":typography", "Typography"));
  if (dom && dom.types.length) colsRows.push(evRow("Domain typography", [...new Set(dom.types.map((t) => t[0]))].slice(0, 3).join(" · "), dom.types.length, "browse", "filter|dom|" + cp[1] + "|typography", "Domain typography"));
  if (textAgg.length) colsRows.push(evRow("Text styles", famNames(textAgg) || "weight & size measurements", textAgg.length, "section", id + ":text", "Text styles"));
  if (dom && dom.texts.length) {
    const names = [...new Set(dom.texts.map((t) => t[0]).filter(Boolean))].slice(0, 3).map(esc).join(" · ");
    const count = aggregateTextStyles(idx, (idx.cByDomain.get(cp[1]) || []).map((row) => row[0])).length;
    colsRows.push(evRow("Domain text styles", names || "weight & size measurements", count, "browse", "filter|dom|" + cp[1] + "|text", "Domain text styles"));
  }
  const colsGroup = colsRows.length ? section("colors & typography", colsRows) : nothing;
  const layoutRows = [];
  if (structs.length) layoutRows.push(evRow("Structures", [...new Set(structs.map((s) => termLabel(D, s[2])))].slice(0, 3).map(esc).join(" · "), structs.length, "section", id + ":structures", "Structures"));
  if (grads.length) layoutRows.push(evRow("Gradients", [...new Set(grads.map((g) => g.kind))].join(" · "), grads.length, "section", id + ":gradients", "Gradients"));
  layoutRows.push(evRow("Measured effects", "borders · shadows · radii · spacing · media", "live", "section", id + ":effects", "Measured effects"));
  if (dom && dom.grads.length) layoutRows.push(evRow("Domain gradients", [...new Set(dom.grads.map((g) => g.kind))].join(" · "), dom.grads.length, "browse", "filter|dom|" + cp[1] + "|gradients", "Domain gradients"));
  const layoutGroup = layoutRows.length ? section("layout & effects", layoutRows) : nothing;
  const roleRows = [];
  if (terms.length) roleRows.push(evRow("Ontology terms", terms.slice(0, 3).map(([t]) => termLabel(D, t)).map(esc).join(" · "), terms.length, "section", id + ":terms", "Ontology terms"));
  if (dom && dom.terms.length) roleRows.push(evRow("Domain terms", dom.terms.slice(0, 3).map(([t]) => termLabel(D, t)).map(esc).join(" · "), dom.terms.length, "browse", "filter|dom|" + cp[1] + "|terms", "Domain terms"));
  if (hists.length) roleRows.push(evRow("Legacy attributions", hists.slice(0, 3).map((h) => h[2]).map(esc).join(" · "), hists.length, "section", id + ":hist", "Legacy attributions"));
  const roleGroup = roleRows.length ? section("design roles", roleRows) : nothing;
  const domNote = dom
    ? html`<div class="system-callout">This capture predates measured design evidence — showing the <b>domain profile</b> from ${L.cap(dom.cid, "capture #" + dom.cid)} (${fmtDate(dom.cp[4])}) instead.</div>`
    : nothing;
  const simRows = [];
  if (ann.length || liveAnn) simRows.push(evRow("Visual neighbors", liveAnn ? "query the active screenshot index" : ann.length + " nearest captures", liveAnn ? "live" : ann.length, "section", id + ":ann", "Visual neighbors"));
  if (sim.length) simRows.push(evRow("Similar by terms", sim.length + " captures sharing terms", sim.length, "section", id + ":sim", "Similar by terms"));
  if (samePath.size) simRows.push(evRow("Same path elsewhere", samePath.size + " other domain" + (samePath.size === 1 ? "" : "s"), samePath.size, "section", id + ":samepath", "Same path elsewhere"));
  const simGroup = simRows.length ? section("visual similarity", simRows) : nothing;
  const dataGroup = section("data", html`
    ${evRow("Capture data", "raw identity fields · JSON", 1, "rawCapture", id, "Capture data")}
    ${evRow("Schema — capture relation", "capture · 28 columns", 28, "relation", "capture", "capture relation")}`);
  const body = html`
    <p class="prose">${L.cap(id, "Capture #" + id)} of ${L.dom(cp[1])} at ${L.browse("path", cp[2], cp[2] || "/")}, captured ${fmtDateTime(cp[4])}.</p>
    <div class="sec">
      ${motion
        ? html`
          <div class="motion-player" style=${`aspect-ratio:${motion[5]}/${motion[6]}`}>
            <video data-capture=${id} controls muted loop playsinline autoplay preload="metadata" poster=${cp[5]} src=${motion[1]}></video>
          </div>
          <div class="media-meta">
            <span>WebM</span><span>${(motion[4] / 1000).toFixed(1)}s</span><span>${motion[5]} × ${motion[6]}</span><span>${(motion[3] / 1048576).toFixed(2)} MB</span>
          </div>`
        : html`<capture-shot .capture=${cp}></capture-shot>`}
    </div>
    ${legacyPalette(ctx, legacyColors)}
    ${!colors.length && !bg.length && !legacyColors.length && !dom
      ? html`<div class="system-callout">No palette is present in the loaded Explorer bundle for this capture.</div>`
      : nothing}
    ${KV([
      ["id", html`<span class="mono">#${id}</span>`, true],
      ["domain", L.dom(cp[1]), false],
      ["path", L.browse("path", cp[2], cp[2] || "/"), false],
      ["captured", fmtDateTime(cp[4]), false],
      ["device", lkDevice, false],
      ["theme", lkTheme, false],
      ["state", lkState, false],
    ])}
    ${domNote}
    ${motionGroup}${colsGroup}${layoutGroup}${roleGroup}${simGroup}${dataGroup}
    ${foot(ctx, c)}`;
  return { n: "#" + id, body };
}

export function vSection(c, ctx) {
  const { idx, D } = ctx;
  const [cid, key] = String(c.id).split(":");
  const cp = idx.cById.get(Number(cid));
  const label = (SECTION_DESC[key] ? key : "section") + (cp ? " · " + cp[3].slice(0, 26) : "");
  if (!cp || !SECTION_DESC[key]) return { n: null, body: html`<div class="empty">section not found</div>` };
  const id = Number(cid);
  if (key === "ann" && D.embedding_runtime?.active_generation_id) return vCaptureNeighbors(c, ctx, cp);
  if (key === "effects") return vCaptureEffects(c, ctx, cp);
  if (key === "gradients") return vCaptureGradients(c, ctx, cp);
  const raw = sectionRaw(ctx, key, id);
  let body = nothing;
  if (key === "colors") {
    body = ctx.rows(idx.colorsByCap.get(id) || [], (row, i) => html`
      <button class="row" data-hop-type="row" data-hop-id="${id}|colors|${i}" data-hop-label="color row ${i + 1}">
        <span class="sw" style=${`background:${rgba(row[1], row[2], row[3], row[4])}`}></span>
        <span class="t">${esc(row[0])}</span>
        <span class="s">${hex(row[1], row[2], row[3])}${row[4] != null && row[4] < 1000000 ? " · " + Math.round(row[4] / 10000) + "% alpha" : ""}${row[5] ? " · " + row[5] + "×" : ""}</span>
      </button>`);
  } else if (key === "backgrounds") {
    const bg = idx.bgByCap.get(id) || [];
    body = html`${bg.length ? html`<span class="sw big" style=${`background:${rgba(bg[0][0], bg[0][1], bg[0][2], bg[0][3])}`}></span>` : nothing}
      ${ctx.rows(bg.slice(0, 12), (row, i) => html`
        <button class="row" data-hop-type="row" data-hop-id="${id}|backgrounds|${i}" data-hop-label="background row ${i + 1}">
          <span class="sw" style=${`background:${rgba(row[0], row[1], row[2], row[3])}`}></span>
          <span class="t">background</span>
          <span class="s">${hex(row[0], row[1], row[2])}${row[3] != null && row[3] < 1000000 ? " · " + Math.round(row[3] / 10000) + "% alpha" : ""}${row[4] ? " · " + row[4] + "×" : ""}</span>
        </button>`)}`;
  } else if (key === "fonts") {
    body = ctx.rows(idx.fontsByCap.get(id) || [], (row, i) => {
      const fam = row[0];
      const stack = row[1];
      const wmin = row[2];
      const wmax = row[3];
      const share = row[4];
      const occ = row[5];
      const observationIndex = row[6];
      const sharePct = share != null ? (share / 10000).toFixed(share >= 10000 ? 0 : 1) + "%" : "";
      return html`
        <button class="row" data-hop-type="capturedFont" data-hop-id="${id}:${observationIndex}" data-hop-label=${String(fam || "captured font").slice(0, 34)}>
          <span class="main">
            <span class="primary"><span class="font-highlight">${esc(fam || "—")}</span></span>
            ${stack ? html`<span class="secondary">${esc(stack)}</span>` : nothing}
          </span>
          <span class="s">${wmin !== wmax ? wmin + "–" + wmax : wmin}${sharePct ? " · " + sharePct : ""}${occ ? " · " + occ + "×" : ""}</span>
        </button>
        <div class="type-sample" style=${specimenCss(fam, stack, id, observationIndex) + ";font-size:15px;margin:-1px 0 8px"}>${specTxt()}</div>
        <font-source .family=${fam} .stack=${stack} .captureId=${id} .observationIndex=${observationIndex} .representative=${false}></font-source>`;
    });
  } else if (key === "typography") {
    body = ctx.rows(idx.typeByCap.get(id) || [], (row, i) => {
      const role = row[0];
      const fam = row[1];
      const w = row[2];
      const size = row[3];
      const lh = row[4];
      const generic = row[7];
      const style = row[8];
      const tracking = row[9];
      const occ = row[10];
      const conf = row[12];
      return html`
        <button class="row" data-hop-type="row" data-hop-id="${id}|typography|${i}" data-hop-label="type row ${i + 1}">
          <span class="t">${L.term("typography.role." + role, role)} · ${esc(fam)}</span>
          <span class="s">${w || ""} · ${px(size)}</span>
        </button>
        <div class="type-sample" style=${specimenCss(fam) + ";font-weight:" + (w || 400) + ";font-style:" + (style || "normal") + ";font-size:" + Math.min(24, Math.max(13, (size || 14000) / 1000)) + "px;line-height:" + (lh ? px(lh) : "1.4") + ";letter-spacing:" + (tracking ? px(tracking) : "0")}>${specTxt()}</div>
        <div class="font-src">${esc([generic && generic !== "unknown" ? generic : "", style, lh ? "line " + px(lh) : "", tracking ? "tracking " + px(tracking) : "", occ ? occ + "×" : "", conf != null ? Math.round(conf / 10000) + "% confidence" : ""].filter(Boolean).join(" · "))}</div>
        <font-source .family=${fam} .stack=${""} .captureId=${null} .observationIndex=${null} .representative=${true}></font-source>`;
    });
  } else if (key === "text") {
    body = textStyleRows(ctx, [id]);
  } else if (key === "structures") {
    body = ctx.rows(idx.structuresByCap.get(id) || [], (r, i) => html`
      <button class="row" data-hop-type="structure" data-hop-id="${id}:${i}" data-hop-label=${String(termLabel(D, r[2])).slice(0, 34)}>
        <span class="t">${esc(termLabel(D, r[2]))}</span>
        <span class="s">${Math.round(r[5] / 100)}% × ${Math.round(r[6] / 100)}% · ${Math.round(r[12] / 10000)}px gap · ${Math.round(r[13] / 10000)}%</span>
      </button>`);
  } else if (key === "terms") {
    body = ctx.rows(idx.termsByCap.get(id) || [], ([tid, conf]) => {
      const note = termValueNote(idx, id, tid);
      return html`
        <button class="row" data-hop-type="term" data-hop-id=${tid} data-hop-label=${String(termLabel(D, tid)).slice(0, 34)}>
          <span class="main">
            <span class="primary"><span class="term-highlight">${esc(termLabel(D, tid))}</span></span>
            <span class="secondary">${esc(termFacet(D, tid).replace(/_/g, " "))}${note.length ? html` · ${note}` : nothing}</span>
          </span>
          <span class="s">${conf == null ? "—" : Math.round(conf * 100) + "%"}</span>
        </button>
        ${conf == null ? nothing : html`<div class="confbar"><i style=${`width:${Math.round(conf * 100)}%`}></i></div>`}`;
    });
  } else if (key === "hist") {
    body = ctx.rows(idx.histByCap.get(id) || [], (row, i) => {
      const fid = row[0];
      const name = row[1];
      const sub = row[2];
      const links = row[3];
      const m = idx.fById.get(fid);
      return html`
        <button class="row" data-hop-type="row" data-hop-id="${id}|hist|${i}" data-hop-label="attribution row ${i + 1}">
          <span class="t">${m ? L.fam(m[0], name) : esc(name)}${sub && sub !== name ? " · " + esc(sub) : ""}</span>
          <span class="s">${links} links</span>
        </button>`;
    });
  } else if (key === "ann") {
    body = ctx.rows(idx.annByCap.get(id) || [], ([nid, dist]) => capRow(idx.cById.get(nid), Math.round((1 - Math.min(1, dist)) * 100) + "% similar"));
  } else if (key === "sim") {
    body = ctx.rows(similarCaptures(idx, id), ([ocid, n]) => capRow(idx.cById.get(ocid), n + " shared terms"));
  } else if (key === "samepath") {
    const pathCaps = idx.cByPath.get(cp[2]) || [];
    body = ctx.rows(pathCaps.filter((x) => x[1] !== cp[1]), (x) => capRow(x), 60);
  } else if (key === "video") {
    body = ctx.rows(idx.videoByCap.get(id) || [], (v, i) => html`
      <button class="row" data-hop-type="video" data-hop-id="${id}:${i}" data-hop-label="video ${i + 1}">
        <span class="t">video element ${i + 1}</span>
        <span class="s">${Math.round(v[5] / 10000)}% coverage</span>
      </button>`);
  }
  let count = raw ? raw.length : 0;
  if (key === "text") count = aggregateTextStyles(idx, [id]).length;
  if (key === "sim") count = similarCaptures(idx, id).length;
  if (key === "samepath") count = (idx.cByPath.get(cp[2]) || []).filter((x) => x[1] !== cp[1]).length;
  const rawId = raw ? ctx.raw(raw) : 0;
  const bodyOut = html`
    <div class="sec"><div class="associated-capture">${capRow(cp, "capture #" + id)}</div></div>
    <p class="prose">${SECTION_DESC[key]}</p>
    <div class="sec">
      <h4>${key === "samepath" ? "same path" : key.replace(/_/g, " ")} <span class="n">${count}</span></h4>
      ${body || html`<div class="empty">no data for this capture</div>`}
    </div>
    ${raw ? section("JSON", html`
      <div class="actions">
        <button class="action" data-download=${rawId} data-filename="capture-${id}-${key}.json">download JSON</button>
      </div>
      <pre class="raw">${esc(JSON.stringify(raw, null, 2))}</pre>`) : nothing}
    ${foot(ctx, c)}`;
  return { n: count, body: bodyOut, label };
}

function sectionRaw(ctx, key, cid) {
  const { D } = ctx;
  if (SECTION_SOURCE[key]) return (D[SECTION_SOURCE[key]] || []).filter((r) => r[0] === cid);
  if (key === "gradients") return (D.gradients || {})[cid] || [];
  if (key === "ann") return (D.ann || {})[cid] || [];
  if (key === "video") return (D.video_observations || []).filter((r) => r.capture_id === cid);
  return null;
}

const SECTION_SOURCE = {
  colors: "color_roles", backgrounds: "backgrounds", fonts: "font_obs", typography: "type_roles",
  text: "text_styles", structures: "structures", terms: "assignments", hist: "hist_fonts",
};

export async function vCaptureGradients(c, ctx, cp) {
  const { idx } = ctx;
  const id = cp[0];
  const payload = await store.loadSimilarity("evidence:" + id, "/v1/capture-evidence", { captureId: id });
  const stops = payload.evidence?.gradient_stop || [];
  const byGradient = new Map();
  for (const row of stops) {
    const [gradientId, stopIndex] = row.identity;
    const [r, g, b, a, position] = row.values;
    if (!byGradient.has(gradientId)) byGradient.set(gradientId, []);
    byGradient.get(gradientId).push({ stop_index: stopIndex, r, g, b, alpha_ppm: a, position_ppm: position });
  }
  const gradients = (idx.gradientsByCap.get(id) || []).map((row) => ({ ...row, stops: (byGradient.get(row.gradient_id) || []).sort((a, b) => a.stop_index - b.stop_index) }));
  const bg0 = (idx.bgByCap.get(id) || [])[0];
  const seed = bg0 ? hex(bg0[0], bg0[1], bg0[2]) : null;
  const body = html`
    <div class="sec"><div class="associated-capture">${capRow(cp, "capture #" + id)}</div></div>
    <p class="prose">${SECTION_DESC.gradients}</p>
    <div class="sec">
      <h4>gradients <span class="n">${gradients.length}</span></h4>
      ${gradients.length ? ctx.rows(gradients, (row) => gradientRow(row, seed)) : html`<div class="empty">no retained gradients for this capture</div>`}
    </div>
    ${foot(ctx, c)}`;
  return { n: gradients.length, body, label: "Gradients" };
}

export async function vCaptureEffects(c, ctx, cp) {
  const id = cp[0];
  const payload = await store.loadSimilarity("evidence:" + id, "/v1/capture-evidence", { captureId: id });
  const evidence = payload.evidence || {};
  const completeness = new Map((evidence.completeness || []).map((row) => [row.identity, row.values]));
  const status = (family) => {
    const row = completeness.get(family);
    if (!row || row[0] === "complete") return nothing;
    return html`<div class="hint">coverage ${esc(row[0].replace(/_/g, " "))} · retained ${row[2]}/${row[1]}${row[3] ? " · " + row[3] + " truncated" : ""}${row[4] ? " · " + esc(row[4].replace(/_/g, " ")) : ""}</div>`;
  };
  const borders = evidence.border || [];
  const shadows = evidence.shadow || [];
  const radii = evidence.radius || [];
  const spacing = evidence.spacing || [];
  const media = evidence.media || [];
  const borderRows = ctx.rows(borders, (row) => {
    const [, , side, width, style, r, g, b, a, occ] = row.values;
    return html`<div class="row" style="cursor:default">
      <span class="sw" style=${`background:${r == null ? "transparent" : rgba(r, g, b, a)}`}></span>
      <span class="t">${esc(side)} · ${px(width)} ${esc(style)}</span>
      <span class="s">${r == null ? "color unavailable" : hex(r, g, b)}${occ ? " · " + occ + "×" : ""}</span>
    </div>`;
  }, 80);
  const shadowRows = ctx.rows(shadows, (row) => {
    const [, , inset, x, y, blur, spread, r, g, b, a, occ] = row.values;
    return html`<div class="row" style="cursor:default">
      <span class="sw" style=${`background:${r == null ? "transparent" : rgba(r, g, b, a)}`}></span>
      <span class="t">${inset ? "inset · " : ""}${px(x)} ${px(y)} ${px(blur)} ${px(spread)}</span>
      <span class="s">${r == null ? "color unavailable" : hex(r, g, b)}${occ ? " · " + occ + "×" : ""}</span>
    </div>`;
  }, 80);
  const radiusRows = ctx.rows(radii, (row) => html`<div class="row" style="cursor:default"><span class="t">${px(row.values[0])}</span><span class="s">${row.values[1]}×</span></div>`, 80);
  const spacingRows = ctx.rows(spacing, (row) => html`<div class="row" style="cursor:default"><span class="t">${esc(row.values[0].replace(/-/g, " "))}</span><span class="s">${px(row.values[1])} · ${row.values[2]}×</span></div>`, 80);
  const mediaRows = ctx.rows(media, (row) => {
    const [kind, x, y, w, h, coverage, occ] = row.values;
    return html`<div class="row" style="cursor:default"><span class="t">${esc(kind)} · ${Math.round(w / 100)}% × ${Math.round(h / 100)}%</span><span class="s">${Math.round(coverage / 10000)}% · ${occ}×</span></div>`;
  }, 80);
  const group = (title, rows, rowsBody, coverageFamily) => html`<div class="sec">
    <h4>${title} <span class="n">${rows.length}</span></h4>
    ${status(coverageFamily)}
    ${rowsBody || html`<div class="empty">no retained observations</div>`}
  </div>`;
  const body = html`
    <div class="sec"><div class="associated-capture">${capRow(cp, "capture #" + id)}</div></div>
    <p class="prose">${SECTION_DESC.effects}</p>
    ${group("borders", borders, borderRows, "border_observation")}
    ${group("shadows", shadows, shadowRows, "shadow_observation")}
    ${group("radii", radii, radiusRows, "radius_observation")}
    ${group("spacing", spacing, spacingRows, "spacing_observation")}
    ${group("media", media, mediaRows, "media_observation")}
    ${foot(ctx, c)}`;
  return { n: borders.length + shadows.length + radii.length + spacing.length + media.length, body, label: "Measured effects" };
}

export async function vCaptureNeighbors(c, ctx, cp) {
  const { idx } = ctx;
  const id = cp[0];
  const payload = await store.loadSimilarity("capture:" + id, "/v1/similar-captures", { captureId: id, limit: 12 });
  const rows = payload.results || [];
  const runtime = payload.index || {};
  const body = html`
    <div class="sec"><div class="associated-capture">${capRow(cp, "capture #" + id)}</div></div>
    <p class="prose">Nearest captures in the active screenshot embedding index. Distances are returned by the index; lower is closer.</p>
    <div class="hint">${esc(runtime.modelId || "active model")}${runtime.distance ? " · " + esc(runtime.distance) + " distance" : ""}${runtime.dimensions ? " · " + runtime.dimensions + " dimensions" : ""}</div>
    <div class="sec">
      <h4>visual neighbors <span class="n">${rows.length}</span></h4>
      ${rows.length ? ctx.rows(rows, (row) => {
        const candidate = idx.cById.get(Number(row.captureId));
        return candidate ? capRow(candidate, "distance " + Number(row.distance).toFixed(4)) : nothing;
      }) : html`<div class="empty">no screenshot embedding neighbors found</div>`}
    </div>
    ${foot(ctx, c)}`;
  return { n: rows.length + " results", body, label: "Visual neighbors" };
}

export function vStructure(c, ctx) {
  const { idx, D } = ctx;
  const [cid, i] = String(c.id).split(":").map(Number);
  const rows = idx.structuresByCap.get(cid) || [];
  const x = rows[i];
  if (!x) return { n: null, body: html`<div class="empty">structure not found</div>` };
  const [sid, parent, tid, sx, sy, sw, sh, salience, repeat, columns, rowsN, gap, conf, evidence] = x;
  const cap = idx.cById.get(cid);
  const children = rows.map((r, j) => [r, j]).filter(([r]) => r[1] === sid);
  const pIdx = parent == null ? -1 : rows.findIndex((r) => r[0] === parent);
  const body = html`
    ${boundsMap(cap, [sx, sy, sw, sh], termLabel(D, tid))}
    <p class="prose">${L.term(tid)} is a resolved region in ${L.cap(cid, cap ? cap[3] : "capture " + cid)}.</p>
    ${KV([
      ["structure_id", String(sid), true],
      ["parent", parent == null ? "—" : (pIdx >= 0 ? html`<button class="chip" data-hop-type="structure" data-hop-id="${cid}:${pIdx}" data-hop-label=${String(termLabel(D, rows[pIdx][2])).slice(0, 30)}>${esc(termLabel(D, rows[pIdx][2]))}</button>` : String(parent)), false],
      ["term", L.term(tid), false],
      ["bounds", "x " + sx + " · y " + sy + " · w " + sw + " · h " + sh, true],
      ["layout", [columns ? columns + " columns" : "", rowsN ? rowsN + " rows" : "", gap != null ? px(gap) + " gap" : "", repeat > 1 ? repeat + " repeats" : ""].filter(Boolean).join(" · ") || "—", false],
      ["confidence", Math.round(conf / 10000) + "%", true],
      ["evidence", esc(evidence || "—"), true],
    ])}
    ${children.length ? section("children", ctx.rows(children, ([r, j]) => html`
      <button class="row" data-hop-type="structure" data-hop-id="${cid}:${j}" data-hop-label=${String(termLabel(D, r[2])).slice(0, 34)}>
        <span class="t">${esc(termLabel(D, r[2]))}</span><span class="s">child</span>
      </button>`), children.length) : nothing}
    ${section("raw row", html`<pre class="raw">${esc(JSON.stringify({ capture_id: cid, structure_id: sid, parent_structure_id: parent, term_id: tid, x_q: sx, y_q: sy, width_q: sw, height_q: sh, salience_rank: salience, repeat_count: repeat, column_count: columns, row_count: rowsN, gap_milli_px: gap, confidence_ppm: conf, evidence_kind: evidence }, null, 2))}</pre>`)}
    ${foot(ctx, c)}`;
  return { n: termLabel(D, tid), body };
}

export function vMotion(c, ctx) {
  const { idx } = ctx;
  const row = idx.motionByCap.get(Number(c.id));
  if (!row) return { n: null, body: html`<div class="empty">motion asset not found</div>` };
  const [cid, obj, mtype, bytes, dur, w, h] = row;
  const cap = idx.cById.get(cid);
  const body = html`
    <div class="sec">
      <div class="motion-player" style=${`aspect-ratio:${w}/${h}`}>
        <video data-capture=${cid} controls muted loop playsinline autoplay preload="metadata" poster=${cap ? cap[5] : ""} src=${obj}></video>
      </div>
      <div class="media-meta">
        <span>WebM</span><span>${(dur / 1000).toFixed(1)}s</span><span>${w} × ${h}</span><span>${(bytes / 1048576).toFixed(2)} MB</span>
      </div>
    </div>
    ${cap ? section("capture", html`<div class="associated-capture">${capRow(cap, "capture #" + cid)}</div>`) : nothing}
    <p class="prose">Recorded motion for ${L.cap(cid, cap ? cap[3] : "capture " + cid)}.</p>
    ${KV([
      ["media type", mtype, true],
      ["duration", (dur / 1000).toFixed(1) + "s", true],
      ["bytes", (bytes / 1048576).toFixed(2) + " MB", true],
      ["resolution", w + " × " + h, true],
      ["object", html`<a class="ext" href=${obj} target="_blank">${esc(obj)} ↗</a>`, false],
    ])}
    ${foot(ctx, c)}`;
  return { n: Math.round(dur / 1000) + "s", body };
}

export function vVideo(c, ctx) {
  const { idx } = ctx;
  const [cid, i] = String(c.id).split(":").map(Number);
  const v = (idx.videoByCap.get(cid) || [])[i];
  if (!v) return { n: null, body: html`<div class="empty">video observation not found</div>` };
  const cap = idx.cById.get(cid);
  const body = html`
    ${boundsMap(cap, v.slice(1, 5), "video")}
    ${cap ? section("capture", html`<div class="associated-capture">${capRow(cap, "capture #" + cid)}</div>`) : nothing}
    <p class="prose">Measured video element in ${L.cap(cid, cap ? cap[3] : "capture " + cid)}.</p>
    ${KV([
      ["capture", L.cap(cid, cap ? cap[3] : "capture " + cid), false],
      ["bounds", "x " + v[1] + " · y " + v[2] + " · w " + v[3] + " · h " + v[4], true],
      ["coverage", Math.round(v[5] / 10000) + "%", true],
      ["occurrences", String(v[6] || 1), true],
    ])}
    ${foot(ctx, c)}`;
  return { n: Math.round(v[5] / 10000) + "% coverage", body };
}

export function vRow(c, ctx) {
  const { idx, D } = ctx;
  const parts = String(c.id).split("|");
  const cid = Number(parts[0]);
  const key = parts[1];
  const idxN = Number(parts[2]);
  const cp = idx.cById.get(cid);
  if (!cp || !ROW_FIELDS[key]) return { n: null, body: html`<div class="empty">row not found</div>` };
  const raw = sectionRaw(ctx, key, cid);
  const row = raw ? raw[idxN] : null;
  if (!row) return { n: null, body: html`<div class="empty">row not found</div>` };
  const obj = rowObject(key, row, cid);
  const kv = [];
  if (obj.r != null && obj.g != null && obj.b != null) {
    kv.push(["color", html`<span class="sw" style=${`background:${rgba(obj.r, obj.g, obj.b, obj.alpha_ppm)}`}></span> <span class="mono">${hex(obj.r, obj.g, obj.b)}</span>`, false]);
  }
  for (const f of ROW_FIELDS[key]) {
    if (f === "r" || f === "g" || f === "b") continue;
    kv.push([f, rowVal(idx, key, f, obj[f]), typeof obj[f] === "string" && obj[f].length > 48]);
  }
  const hasGeo = obj.x_q != null && obj.y_q != null && obj.width_q != null && obj.height_q != null;
  const rowId = ctx.raw(obj);
  const body = html`
    <div class="sec"><div class="associated-capture">${capRow(cp, "capture #" + cid)}</div></div>
    ${hasGeo ? section(html`${boundsMap(cp, [obj.x_q, obj.y_q, obj.width_q, obj.height_q], key + " #" + (idxN + 1))}`) : nothing}
    ${obj.r != null ? section(html`<span class="sw big" style=${`background:${rgba(obj.r, obj.g, obj.b, obj.alpha_ppm)}`}></span>`) : nothing}
    ${obj.declared_family ? section(html`
      <div class="type-sample" style=${specimenCss(obj.declared_family, obj.computed_css_stack) + ";font-size:22px"}>${specTxt()}</div>
      <font-source .family=${obj.declared_family} .stack=${obj.computed_css_stack} .captureId=${cid} .observationIndex=${obj.observation_index} .representative=${false}></font-source>`) : nothing}
    <p class="prose">${esc(SECTION_DESC[key] || key)}</p>
    ${KV(kv)}
    ${section("JSON", html`
      <div class="actions">
        <button class="action" data-download=${rowId} data-filename="capture-${cid}-${key}-row${idxN}.json">download JSON</button>
      </div>
      <pre class="raw">${esc(JSON.stringify(obj, null, 2))}</pre>`)}
    ${foot(ctx, c)}`;
  return { n: "row " + (idxN + 1), body };
}

export function vRawCapture(c, ctx) {
  const { idx } = ctx;
  const id = Number(c.id);
  const cp = idx.cById.get(id);
  if (!cp) return { n: null, body: html`<div class="empty">capture not found</div>` };
  const obj = {
    id: cp[0], origin: cp[1], path: cp[2], title: cp[3], captured_at: cp[4], image_url: cp[5],
    device_class: cp[6] || null, theme: cp[7] || null, interaction_state: cp[8] || null,
    capture_scope: cp[9], render_context: cp[10], viewport_width_px: cp[11], viewport_height_px: cp[12],
    device_pixel_ratio: cp[13], crop_width_px: cp[14], crop_height_px: cp[15], screenshot_key: cp[16],
    screenshot_media_type: cp[17], screenshot_width_px: cp[18], screenshot_height_px: cp[19],
    capture_contract_id: cp[20], profile_generation: cp[21],
  };
  const rowId = ctx.raw(obj);
  const body = html`
    <div class="sec"><div class="associated-capture">${capRow(cp, "capture #" + id)}</div></div>
    <p class="prose">Raw capture identity fields as bundled in this corpus snapshot.</p>
    ${KV(Object.entries(obj).map(([k, v]) => [k, v == null ? "—" : (k === "origin" ? L.dom(v) : k === "path" ? L.browse("path", v, v || "/") : k === "image_url" ? html`<a class="ext" href=${v} target="_blank">${esc(v)} ↗</a>` : esc(String(v))), k === "id" || k === "captured_at" || k === "image_url"]))}
    ${section("JSON", html`
      <div class="actions">
        <button class="action" data-download=${rowId} data-filename="capture-${id}.json">download JSON</button>
      </div>
      <pre class="raw">${esc(JSON.stringify(obj, null, 2))}</pre>`)}
    ${foot(ctx, c)}`;
  return { n: "#" + id, body };
}
