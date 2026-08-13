import { html, nothing } from "lit";
import { store } from "../data/store.js";
import { famResolve } from "../data/indexes.js";
import { norm } from "../data/util.js";
import { esc, familyPreviewUrl } from "../data/util.js";
import {
  L, capRow, navRow, evRow, KV, section, foot,
} from "./shared.js";
import "../components/capture-row.js";
import "../components/font-preview.js";
import "../components/font-source.js";

export function vFamily(c, ctx) {
  const { idx } = ctx;
  const f = idx.fById.get(c.id);
  if (!f) return { n: null, body: html`<div class="empty">family not found</div>` };
  const dg = f[2] != null ? idx.dgById.get(f[2]) : null;
  const v = f[3] != null ? idx.vById.get(f[3]) : null;
  const rels = idx.relsById.get(c.id) || [];
  const sameDg = (dg ? idx.fByDesigner.get(dg[0]) || [] : []).filter((x) => x[0] !== f[0]);
  const sameV = (v ? idx.fByVendor.get(v[0]) || [] : []).filter((x) => x[0] !== f[0]);
  const users = idx.capsByFam.get(norm(f[1])) || [];
  const dupes = (idx.famGroups.get(norm(f[1])) || []).filter((x) => x[0] !== f[0]);
  const cooc = new Map();
  const coocNames = new Map();
  for (const cid of new Set(users.map(([id]) => id))) {
    const seen = new Set();
    for (const [fam2] of idx.fontsByCap.get(cid) || []) {
      const k = norm(fam2);
      if (k === norm(f[1]) || seen.has(k)) continue;
      seen.add(k);
      cooc.set(k, (cooc.get(k) || 0) + 1);
      if (!coocNames.has(k)) coocNames.set(k, fam2);
    }
  }
  const coocRows = [...cooc.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6);
  const releaseSource = rels.find((release) => release[4])?.[4] || null;
  const catalogueSource = releaseSource || dg?.[2] || v?.[2] || null;
  const catalogueSourceLabel = releaseSource ? "release source" : dg?.[2] ? "designer source" : v?.[2] ? "vendor source" : "source not retained";
  const body = html`
    <font-preview class="font-preview-hero" releaseFallback .result=${{ familyId: f[0], familyName: f[1], previewUrl: familyPreviewUrl(f[0]) }}></font-preview>
    <div class="font-hero-caption">
      <strong>${esc(f[1])}</strong>
      <span>catalogue family #${f[0]}</span>
    </div>
    <div class="font-provenance">
      ${catalogueSource ? html`<a class="ext" href=${catalogueSource} target="_blank" rel="noreferrer">${catalogueSourceLabel} ↗</a>` : html`<span>${catalogueSourceLabel}</span>`}
    </div>
    <p class="prose family-attribution">${L.fam(f[0], f[1])}${dg ? html` by ${L.designer(dg[0], dg[1])}` : nothing}${v ? html`, sold by ${L.vendor(v[0], v[1])}` : nothing}. ${rels.length} releases.</p>
    ${dupes.length ? section("possible duplicates", html`
      <div class="hint">${esc(f[1])} appears ${dupes.length + 1} times in the catalogue. The corpus alias table (family → canonical) exists but holds no reviewed links yet — these are same-name candidates.</div>
      ${ctx.rows(dupes, (x) => html`
        <button class="row" data-hop-type="family" data-hop-id=${x[0]} data-hop-label=${x[1].slice(0, 34)}>
          <span class="t">${esc(x[1])}</span>
          <span class="s">#${x[0]}${idx.relCount.get(x[0]) ? " · " + idx.relCount.get(x[0]) + " releases" : ""}</span>
        </button>`, 12)}
`, dupes.length + " same name") : nothing}
    ${sameDg.length ? section("other families by " + esc(dg[1].slice(0, 26)), ctx.rows(sameDg, (x) => html`
      <button class="row" data-hop-type="family" data-hop-id=${x[0]} data-hop-label=${x[1].slice(0, 34)}>
        <span class="t">${esc(x[1])}</span><span class="s">#${x[0]}</span>
      </button>`, 8)) : nothing}
    ${sameV.length ? section("other families by " + esc(v[1].slice(0, 26)), ctx.rows(sameV, (x) => html`
      <button class="row" data-hop-type="family" data-hop-id=${x[0]} data-hop-label=${x[1].slice(0, 34)}>
        <span class="t">${esc(x[1])}</span><span class="s">#${x[0]}</span>
      </button>`, 8)) : nothing}
    ${users.length ? section("captures using this family", ctx.rows(users, ([cid]) => capRow(idx.cById.get(cid)), 20), users.length) : nothing}
    ${coocRows.length ? section("often seen with", ctx.rows(coocRows, ([k, n]) => {
      const m = famResolve(idx, k);
      return m ? navRow("family", m[0], m[1], n + " shared captures")
        : html`<div class="row" style="cursor:default"><span class="t">${esc(coocNames.get(k) || k)}</span><span class="s">observed only · ${n} shared captures</span></div>`;
    }), "co-occurring") : nothing}
    ${section("visual similarity", evRow("Visually similar", "compare rendered glyph descriptors", "live", "fontLookup", f[0], "Similar to " + f[1]))}
    ${section("releases", ctx.rows(rels, (r) => html`
      <div class="row" style="cursor:default">
        <span class="t mono">${esc(r[1])}</span>
        <span class="s">${r[4] ? html`<a class="ext" href=${r[4]} target="_blank">source ↗</a>` : esc(r[2].slice(0, 8))}</span>
      </div>`), rels.length)}
    ${foot(ctx, c)}`;
  return { n: rels.length + " releases", body };
}

function vProvider(c, ctx, type) {
  const { idx } = ctx;
  const entity = idx[type === "designer" ? "dgById" : "vById"].get(c.id);
  if (!entity) return { n: null, body: html`<div class="empty">${type} not found</div>` };
  const fams = idx[type === "designer" ? "fByDesigner" : "fByVendor"].get(c.id) || [];
  const prose = html`${L[type](entity[0], entity[1])} — ${fams.length} families in the catalogue.${entity[2] ? html` <a class="ext" href=${entity[2]} target="_blank">${esc(entity[2])} ↗</a>` : nothing}`;
  const body = html`
    <p class="prose">${prose}</p>
    ${section("families", ctx.rows(fams, (f) => navRow("family", f[0], f[1], "#" + f[0])), fams.length)}
    ${foot(ctx, c)}`;
  return { n: fams.length + " families", body };
}

export function vDesigner(c, ctx) {
  return vProvider(c, ctx, "designer");
}
export function vVendor(c, ctx) {
  return vProvider(c, ctx, "vendor");
}

export function vFontSim(c, ctx) {
  const { D } = ctx;
  const body = html`
    <p class="prose">Font similarity compares catalogue families from rendered glyph descriptors. Open a family and choose <b>Visually similar</b> to run a lookup.</p>
    ${KV([
      ["mode", "on demand", true],
      ["target", "exact catalogue family ID", true],
      ["rank", "visual descriptor distance", true],
    ])}
    ${section("catalogue families", ctx.rows(D.families.slice().sort((a, b) => a[1].localeCompare(b[1])), (f) =>
      navRow("family", f[0], f[1], "#" + f[0], html`<span class="font-highlight">${esc(f[1])}</span>`), 80), D.families.length.toLocaleString())}
    ${foot(ctx, c)}`;
  return { n: "on demand", body };
}

export async function vFontLookup(c, ctx) {
  const { idx } = ctx;
  const target = idx.fById.get(Number(c.id));
  if (!target) return { n: null, body: html`<div class="empty">family not found</div>` };
  const payload = await store.loadSimilarity("font:" + target[0], "/v1/similar-fonts", { familyId: target[0], limit: 8 });
  const rows = payload.results || [];
  const body = html`
    <p class="prose">Catalogue families visually closest to <span class="font-highlight">${esc(target[1])}</span> under the active experimental rendered-glyph descriptor. Lower distance is closer.</p>
    <font-preview releaseFallback .result=${{ familyId: target[0], familyName: target[1], ...(payload.target || {}) }}></font-preview>
    ${section("visual candidates", html`${ctx.rows(rows, (r) => {
      const family = idx.fById.get(Number(r.familyId));
      const name = family ? family[1] : r.familyName;
      const meta = "visual " + Number(r.visualDistance).toFixed(4) + " · metric " + Number(r.metricDistance).toFixed(4) + (r.commonGlyphs ? " · " + r.commonGlyphs + " glyphs" : "");
      return html`
        <button class="row" data-hop-type="family" data-hop-id=${r.familyId} data-hop-label=${String(name).slice(0, 34)}>
          <span class="t"><span class="font-highlight">${esc(name)}</span></span>
          <span class="s">#${r.rank}</span>
        </button>
        <font-preview releaseFallback .result=${r}></font-preview>
        <div class="font-src">${esc(meta)}</div>`;
    })}${rows.length ? nothing : html`<div class="empty">no compatible visual descriptor is available for this family</div>`}`, rows.length)}
    ${foot(ctx, c)}`;
  return { n: rows.length + " results", body };
}

export function vEmbeddings(c, ctx) {
  const { D, idx } = ctx;
  const rt = D.embedding_runtime || {};
  const pivots = Object.keys(D.ann || {});
  const body = html`
    <p class="prose">Visual similarity from screenshot embeddings.</p>
    ${KV([
      ["model", esc(rt.model_id || "—"), true],
      ["dimensions", String(rt.dimensions || "—"), true],
      ["distance", esc(rt.distance || "—"), true],
      ["normalization", esc(rt.normalization || "—"), true],
      ["captures", (rt.member_count || 0).toLocaleString(), true],
      ["generation", esc(rt.active_generation_id || "—"), true],
    ])}
    <div class="system-callout">Open any indexed capture and choose <b>Visual neighbors</b> to query this index.</div>
    ${section("pivot captures", ctx.rows(pivots, (cid) => {
      const cp = idx.cById.get(Number(cid));
      const n = (D.ann[cid] || []).length;
      return capRow(cp, n + " neighbours");
    }), pivots.length)}
    ${foot(ctx, c)}`;
  return { n: pivots.length + " pivots", body };
}
