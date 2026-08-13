import { html, nothing } from "lit";
import { store } from "../data/store.js";
import { termLabel } from "../data/indexes.js";
import { esc, fmtDate, fmtDateTime } from "../data/util.js";
import {
  L, capRow, KV, section, foot,
} from "./shared.js";
import "../components/capture-row.js";

export function vHome(c, ctx) {
  const { idx, D } = ctx;
  const topTerms = [...idx.capsByTerm.entries()].sort((a, b) => b[1].length - a[1].length).slice(0, 6);
  const topDomains = [...idx.cByDomain.entries()].sort((a, b) => b[1].length - a[1].length).slice(0, 6);
  const newest = [...D.captures].sort((a, b) => b[4] - a[4]).slice(0, 6);
  const rich = D.captures.filter((cp) => idx.colorsByCap.has(cp[0]) && idx.fontsByCap.has(cp[0]) && idx.typeByCap.has(cp[0])).slice(0, 6);
  const motionTop = [...(D.motion_assets || [])].sort((a, b) => b[4] - a[4]).slice(0, 6);
  const body = html`
    <p class="prose">${D.captures.length.toLocaleString()} captures of ${D.domains.length.toLocaleString()} domains — each capture carries its measured colors, fonts, and typography, and resolves into the ${L.index("facets", "28-facet taxonomy")}. Everything here links to everything: follow values to terms, terms to captures, families to foundries.</p>
    <div class="system-links" aria-label="Explorer systems">
      ${L.fs("Font similarity")} · ${L.rel("Schema")} · ${L.run("Runtime")}
    </div>
    <div class="hs">
      <h3>Rich captures</h3>
      <div class="hint">colors + fonts + type roles + terms</div>
      ${ctx.rows(rich, (cp) => capRow(cp))}
    </div>
    <div class="hs">
      <h3>Most used terms</h3>
      <div class="hint">by resolved captures</div>
      ${ctx.rows(topTerms, ([tid, caps]) => html`
        <button class="hsrow" data-hop-type="term" data-hop-id=${tid} data-hop-label=${String(termLabel(D, tid)).slice(0, 34)}>
          <span class="t"><span class="term-highlight">${esc(termLabel(D, tid))}</span></span>
          <span class="s">${caps.length} caps</span>
        </button>`)}
    </div>
    <div class="hs">
      <h3>Largest domains</h3>
      <div class="hint">by captures</div>
      ${ctx.rows(topDomains, ([origin, caps]) => html`
        <button class="hsrow" data-hop-type="domain" data-hop-id=${origin} data-hop-label=${origin.replace("https://", "").slice(0, 34)}>
          <span class="t"><fudge-favicon .origin=${origin}></fudge-favicon> ${esc(origin.replace("https://", ""))}</span>
          <span class="s">${caps.length} caps</span>
        </button>`)}
    </div>
    <div class="hs">
      <h3>Motion captures <button class="section-open" data-hop-type="browse" data-hop-id="motion" data-hop-label="motion">open ›</button></h3>
      <div class="hint">recorded WebM · by duration</div>
      ${ctx.rows(motionTop, (m) => capRow(idx.cById.get(m[0]), "▶ " + Math.round(m[4] / 1000) + "s · " + (m[3] / 1048576).toFixed(1) + " MB"))}
    </div>
    <div class="hs">
      <h3>Newest captures <button class="section-open" data-hop-type="browse" data-hop-id="captures" data-hop-label="captures">open ›</button></h3>
      <div class="hint">by capture date</div>
      ${ctx.rows(newest, (cp) => capRow(cp))}
    </div>`;
  return { n: null, body };
}

export function vDomain(c, ctx) {
  const { idx } = ctx;
  const origin = c.id;
  const caps = idx.cByDomain.get(origin) || [];
  const paths = {};
  for (const cp of caps) paths[cp[2]] = (paths[cp[2]] || 0) + 1;
  const topPaths = Object.entries(paths).sort((a, b) => b[1] - a[1]).slice(0, 8);
  const body = html`
    <p class="prose">${L.dom(origin)} has <b>${caps.length} captures</b>, newest ${fmtDate(Math.max(...caps.map((x) => x[4])))}. Open a capture to see its colors, fonts, and taxonomy.</p>
    ${section("top paths", ctx.rows(topPaths, ([p, n]) => html`
      <button class="chip" data-hop-type="browse" data-hop-id="path" data-hop-label=${p}>${esc(p || "/")} · ${n}</button>`))}
    ${section("captures", ctx.rows(caps, (cp) => capRow(cp), 30), caps.length)}
    ${foot(ctx, c)}`;
  return { n: caps.length + " captures", body };
}

export function vRuntime(c, ctx) {
  const { D } = ctx;
  const m = D.motion_assets || [];
  const meanDur = m.length ? Math.round(m.reduce((s, x) => s + x[4], 0) / m.length) / 1000 : 0;
  const meanBytes = m.length ? (m.reduce((s, x) => s + x[3], 0) / m.length / 1048576).toFixed(2) : "0";
  const vids = D.video_observations || [];
  const er = D.embedding_runtime || {};
  const cr = D.classification_runtime || {};
  const rc = D.runtime_counts || {};
  const body = html`
    <p class="prose">Runtime state of the corpus snapshot — identity, sensors and similarity subsystems.</p>
    ${KV([
      ["captures", D.captures.length.toLocaleString(), true],
      ["domains", D.domains.length.toLocaleString(), true],
      ["font families", D.families.length.toLocaleString(), true],
      ["terms", Object.keys(D.terms).length.toLocaleString(), true],
      ["term assignments", D.assignments.length.toLocaleString(), true],
      ["bundle built", fmtDateTime(Date.parse(D.built)), true],
      ["corpus generation", String(D.observed_generation), true],
    ])}
    ${section("motion", KV([
      ["recorded WebM", m.length.toLocaleString(), true],
      ["mean duration", meanDur.toFixed(1) + "s", true],
      ["mean bytes", meanBytes + " MiB", true],
    ]))}
    ${section("page video", KV([
      ["exact observations", vids.length.toLocaleString(), true],
      ["video-bearing captures", (D.embedded_video_captures ? D.embedded_video_captures.length : ctx.idx.embeddedById.size).toLocaleString(), true],
    ]))}
    ${section("design evidence", KV([
      ["color roles / backgrounds", D.color_roles.length.toLocaleString() + " / " + D.backgrounds.length.toLocaleString(), true],
      ["font observations / type roles", D.font_obs.length.toLocaleString() + " / " + D.type_roles.length.toLocaleString(), true],
      ["text styles / structures", (D.text_styles || []).length.toLocaleString() + " / " + (D.structures || []).length.toLocaleString(), true],
      ["borders", Number(rc.borders || 0).toLocaleString(), true],
      ["shadows", Number(rc.shadows || 0).toLocaleString(), true],
      ["radii", Number(rc.radii || 0).toLocaleString(), true],
      ["spacing", Number(rc.spacing || 0).toLocaleString(), true],
      ["gradients / stops", Number(rc.gradients || 0).toLocaleString() + " / " + Number(rc.gradient_stops || 0).toLocaleString(), true],
      ["media observations", Number(rc.media || 0).toLocaleString(), true],
      ["completeness rows", Number(rc.completeness || 0).toLocaleString(), true],
    ]))}
    ${section("classification", KV([
      ["current / absent / failed / unsupported", [rc.classification_current, rc.classification_absent, rc.classification_failed, rc.classification_unsupported].map((n) => Number(n || 0).toLocaleString()).join(" / "), true],
      ["contract", esc(cr.contract_id || "—"), true],
      ["ontology", esc(cr.ontology_id || "—"), true],
      ["provider / model", esc([cr.provider, cr.model_id].filter(Boolean).join(" · ") || "—"), true],
      ["activated", cr.activated_at ? fmtDateTime(cr.activated_at) : "—", true],
      ["validator / resolver", esc([cr.validator_version, cr.resolver_version].filter(Boolean).join(" · ") || "—"), true],
    ]))}
    ${section("similarity", KV([
      ["embedding generation", er.active_generation_id || "—", true],
      ["index members", er.member_count ? er.member_count.toLocaleString() : "—", true],
      ["indexed / validated", [er.indexed_member_count, er.validated_at ? fmtDate(er.validated_at) : ""].filter(Boolean).join(" · ") || "—", true],
      ["provider / model", esc([er.provider_id, er.model_id, er.immutable_model_version].filter(Boolean).join(" · ") || "—"), true],
      ["vector", [er.dimensions ? er.dimensions + "d" : "", er.scalar_type, er.distance, er.normalization].filter(Boolean).join(" · ") || "—", true],
      ["HNSW", [er.hnsw_m ? "m " + er.hnsw_m : "", er.hnsw_ef_construction ? "ef " + er.hnsw_ef_construction : ""].filter(Boolean).join(" · ") || "—", true],
      ["source corpus sequence", String(er.source_corpus_sequence || "—"), true],
      ["font similarity", "on demand", true],
      ["retrieval contract", esc(er.contract_id || "—"), true],
    ]))}
    ${section("catalogue", KV([
      ["families", D.families.length.toLocaleString(), true],
      ["designers", D.designers.length.toLocaleString(), true],
      ["vendors", D.vendors.length.toLocaleString(), true],
      ["releases", D.releases.length.toLocaleString(), true],
    ]))}
    ${foot(ctx, c)}`;
  return { n: null, body };
}

export function vRelations(c, ctx) {
  const rels = store.relations;
  const groups = new Map();
  for (const r of rels) {
    const g = r.group || "other";
    if (!groups.has(g)) groups.set(g, []);
    groups.get(g).push(r);
  }
  const out = [...groups.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([g, rows]) => html`
    <div class="sec">
      <h4>${esc(g.replace(/_/g, " "))} <span class="n">${rows.length}</span></h4>
      ${rows.sort((a, b) => a.name.localeCompare(b.name)).map((r) => html`
        <button class="row" data-hop-type="relation" data-hop-id=${r.name} data-hop-label=${r.name.slice(0, 34)}>
          <span class="t mono">${esc(r.name)}</span>
          <span class="s">${(r.keys || 0)}+${(r.nonkeys || 0)}</span>
        </button>`)}
    </div>`);
  const body = html`
    <p class="prose">${rels.length} relations in the corpus schema. Open one to inspect its columns.</p>
    ${out}
    ${foot(ctx, c)}`;
  return { n: rels.length + " relations", body };
}

export async function vRelation(c, ctx) {
  const r = store.relations.find((x) => x.name === c.id);
  if (!r) return { n: null, body: html`<div class="empty">relation not found</div>` };
  const payload = await store.loadSimilarity("relation:" + r.name, "/v1/relation-columns", { relation: r.name });
  const columns = (payload.rows || []).map((row) => ({ name: row[0], key: row[1], index: row[2], type: row[3], hasDefault: row[4], defaultExpression: row[5] }));
  const body = html`
    <p class="prose">${esc(r.description || "")}</p>
    ${KV([
      ["name", html`<span class="mono">${esc(r.name)}</span>`, true],
      ["arity", String(r.arity || columns.length), true],
      ["keys / nonkeys", (r.keys || 0) + " / " + (r.nonkeys || 0), true],
      ["access", esc(r.access || ""), true],
      ["group", esc((r.group || "other").replace(/_/g, " ")), false],
    ])}
    ${section("columns", columns.map((col) => html`
      <div class="schema-column">
        <span class="name"><span class="mono">${esc(col.name)}</span>${col.key ? html`<span class="key-badge">key</span>` : nothing}</span>
        <span class="type">${esc(col.type || "")}</span>
      </div>`), columns.length)}
    ${section("JSON", html`<pre class="raw">${esc(JSON.stringify({ ...r, columns, columnsBundled: true }, null, 2))}</pre>`)}
    ${foot(ctx, c)}`;
  return { n: (r.keys || 0) + "+" + (r.nonkeys || 0), body };
}
