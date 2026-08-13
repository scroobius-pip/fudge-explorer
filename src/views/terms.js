import { html, nothing } from "lit";
import { store } from "../data/store.js";
import { termLabel, termFacet, termDef } from "../data/indexes.js";
import { esc, hex, rgba } from "../data/util.js";
import {
  L, capRow, KV, section, foot, termEvidenceNote,
} from "./shared.js";
import "../components/capture-row.js";

export async function vTerm(c, ctx) {
  const { idx, D } = ctx;
  const tid = c.id;
  const caps = idx.capsByTerm.get(tid) || [];
  const payload = await store.loadSimilarity("term:" + tid, "/v1/term-values", { termId: tid });
  const valuesByCapture = new Map();
  for (const row of payload.rows || []) {
    if (!valuesByCapture.has(row[0])) valuesByCapture.set(row[0], []);
    valuesByCapture.get(row[0]).push(row);
  }
  const facetId = termFacet(D, tid);
  const structUses = [];
  for (const [cid, rows] of idx.structuresByCap) {
    rows.forEach((r, i) => {
      if (r[2] === tid) structUses.push([cid, i]);
    });
  }
  const siblings = Object.keys(D.terms).filter((t) => termFacet(D, t) === facetId && t !== tid).sort();
  const body = html`
    <p class="prose"><span class="term-highlight">${esc(termLabel(D, tid))}</span> belongs to ${L.facet(facetId)}. ${esc(termDef(D, tid))}</p>
    ${KV([
      ["term id", html`<span class="mono">${esc(tid)}</span>`, true],
      ["facet", L.facet(facetId), false],
      ["captures", caps.length.toLocaleString(), true],
    ])}
    ${section("captures", caps.length
      ? ctx.rows(caps, ([cid, conf, scope, resolution]) => {
        const cp = idx.cById.get(cid);
        const support = valuesByCapture.get(cid) || [];
        const measured = support.map((row) => termEvidenceNote(row, tid)).filter(Boolean);
        const colorValues = tid.startsWith("color.role.")
          ? support.flatMap((row) => {
            const values = row[8] || [];
            const offset = row[6] === "text_style" ? 7 : 0;
            return values[offset] != null && values[offset + 1] != null && values[offset + 2] != null
              ? [[values[offset], values[offset + 1], values[offset + 2], values[offset + 3]]]
              : [];
          })
          : [];
        const evidence = colorValues.length
          ? html`<span class="palette-mini" title=${colorValues.map(([r, g, b]) => hex(r, g, b)).join(" · ")}>
              ${colorValues.map(([r, g, b, a]) => html`<i style=${`background:${rgba(r, g, b, a)}`}></i>`)}
            </span>`
          : measured.length ? html`${measured.slice(0, 2).map((part, index) => html`${index ? " · " : ""}${part}`)}` : nothing;
        const confidence = conf == null ? "confidence unavailable" : Math.round(conf * 100) + "%";
        return capRow(cp, html`${confidence}${scope ? html` · ${scope}` : nothing}${resolution ? html` · ${resolution}` : nothing}`, "", { evidence });
      }, 80)
      : html`<div class="empty">no captures resolved to this term</div>`, caps.length)}
    ${section(html`other terms in ${esc(facetId.replace(/_/g, " "))} <span class="n">${siblings.length}</span><button class="section-open" data-hop-type="facet" data-hop-id=${facetId} data-hop-label=${facetId}>open ›</button>`, ctx.rows(siblings, (ot) => html`
        <button class="row" data-hop-type="term" data-hop-id=${ot} data-hop-label=${String(termLabel(D, ot)).slice(0, 34)}>
          <span class="t"><span class="term-highlight">${esc(termLabel(D, ot))}</span></span>
          <span class="s">${(idx.capsByTerm.get(ot) || []).length} caps</span>
        </button>`))}
    ${structUses.length ? section("resolved structures", ctx.rows(structUses, ([cid, i]) => {
      const cp = idx.cById.get(cid);
      return html`
        <button class="row" data-hop-type="structure" data-hop-id="${cid}:${i}" data-hop-label=${(cp ? cp[3] : "").slice(0, 34)}>
          <span class="t">${esc(cp ? cp[3] : "capture " + cid)}</span>
          <span class="s">${cp ? cp[1].replace("https://", "") : ""}</span>
        </button>`;
    }, 20), structUses.length) : nothing}
    ${foot(ctx, c)}`;
  return { n: caps.length + " captures", body };
}

export function vFacet(c, ctx) {
  const { idx, D } = ctx;
  const fid = c.id;
  const tids = Object.keys(D.terms).filter((t) => D.terms[t][2] === fid).sort((a, b) => termLabel(D, a).localeCompare(termLabel(D, b)));
  const body = html`
    <p class="prose"><span class="term-highlight">${esc(fid.replace(/_/g, " "))}</span> — ${tids.length} terms in the ontology. Open a term to see its measured values across captures.</p>
    ${KV([
      ["facet id", html`<span class="mono">${esc(fid)}</span>`, true],
      ["terms", String(tids.length), true],
    ])}
    ${section("controlled terms", ctx.rows(tids, (tid) => html`
      <button class="row" title=${termDef(D, tid)} data-hop-type="term" data-hop-id=${tid} data-hop-label=${String(termLabel(D, tid)).slice(0, 34)}>
        <span class="t"><span class="term-highlight">${esc(termLabel(D, tid))}</span></span>
        <span class="s">${(idx.capsByTerm.get(tid) || []).length} captures</span>
      </button>`))}
    ${foot(ctx, c)}`;
  return { n: tids.length + " terms", body };
}
