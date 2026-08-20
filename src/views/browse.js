import { html, nothing } from "lit";
import { store } from "../data/store.js";
import {
  baseSet, derive, countBy, termLabel, termFacet, aggregateTextStyles, captureFamilies,
} from "../data/indexes.js";
import { esc, px, specTxt, hex, intHex, norm } from "../data/util.js";
import { specimenCss } from "../data/fonts.js";
import {
  L, capRow, navRow, section, foot, textStyleRows,
} from "./shared.js";
import "../components/capture-row.js";
import "../components/font-source.js";

function filteredCaptureRows(ctx, caps, test, meta, after) {
  const { idx } = ctx;
  return ctx.rows(caps.filter(test), (cid) => {
    return html`${capRow(idx.cById.get(cid), meta(cid))}${after ? after(cid) : nothing}`;
  }, 120);
}

export const FILTER_ROWS = {
  captures: (ctx, caps) => ctx.rows(caps.map((cid) => ctx.idx.cById.get(cid)).filter(Boolean), (cp) => capRow(cp), 120),
  domains: (ctx, caps) => ctx.rows(countBy(caps, (cid) => [(ctx.idx.cById.get(cid) || [])[1]]), ([origin, n]) =>
    navRow("domain", origin, origin.replace("https://", ""), n + " captures", html`<fudge-favicon .origin=${origin}></fudge-favicon> ${esc(origin.replace("https://", ""))}`), 120),
  families: (ctx, caps) => ctx.rows(countBy(caps, (cid) => [...new Set(captureFamilies(ctx.idx, cid).map(norm))]), ([name, n]) => {
    return html`<div class="row" style="cursor:default"><span class="t">${esc(name)}</span><span class="s">${n} captures · observed name</span></div>`;
  }, 120),
  text: (ctx, caps) => textStyleRows(ctx, caps),
  terms: (ctx, caps) => ctx.rows(countBy(caps, (cid) => (ctx.idx.termsByCap.get(cid) || []).map(([t]) => t)), ([term, n]) =>
    navRow("term", term, termLabel(ctx.D, term), n + " captures", html`<span class="term-highlight">${esc(termLabel(ctx.D, term))}</span>`), 120),
  facets: (ctx, caps) => ctx.rows(countBy(caps, (cid) => (ctx.idx.termsByCap.get(cid) || []).map(([t]) => termFacet(ctx.D, t))), ([facet, n]) =>
    navRow("facet", facet, facet, n + " captures", esc(facet.replace(/_/g, " "))), 120),
  motion: (ctx, caps) => filteredCaptureRows(ctx, caps, (cid) => ctx.idx.motionByCap.has(cid), (cid) => {
    const m = ctx.idx.motionByCap.get(cid);
    return "▶ " + Math.round(m[4] / 1000) + "s · " + (m[3] / 1048576).toFixed(1) + " MB";
  }),
  video: (ctx, caps) => filteredCaptureRows(ctx, caps, (cid) => ctx.idx.videoByCap.has(cid) || ctx.idx.embeddedById.has(cid), (cid) => {
    const rows = ctx.idx.videoByCap.get(cid) || [];
    return rows.length + " element" + (rows.length === 1 ? "" : "s") + (rows.length ? " · max " + Math.round(Math.max(...rows.map((r) => r[5])) / 10000) + "%" : "");
  }),
  colors: (ctx, caps) => filteredCaptureRows(ctx, caps, (cid) => (ctx.idx.colorsByCap.get(cid) || []).length || (ctx.idx.legacyColorsByCap.get(cid) || []).length, (cid) => {
    const modern = ctx.idx.colorsByCap.get(cid) || [];
    const legacy = ctx.idx.legacyColorsByCap.get(cid) || [];
    return [modern.length ? modern.length + " measured" : "", legacy.length ? legacy.length + " legacy" : ""].filter(Boolean).join(" · ") + " colors";
  }, (cid) => {
    const modern = ctx.idx.colorsByCap.get(cid) || [];
    const legacy = ctx.idx.legacyColorsByCap.get(cid) || [];
    const modernStrip = modern.length ? html`<div class="palette-mini" title="measured colors">${modern.slice(0, 10).map((cl) => html`<i style=${`background:${hex(cl[1], cl[2], cl[3])}`}></i>`)}</div>` : nothing;
    const legacyStrip = legacy.length ? html`<div class="palette-mini" title="legacy palette">${legacy.slice(0, 10).map((row) => html`<i style=${`background:${intHex(Array.isArray(row) ? row[0] : row)}`}></i>`)}</div>` : nothing;
    return html`${modernStrip}${legacyStrip}`;
  }),
  gradients: (ctx, caps) => filteredCaptureRows(ctx, caps, (cid) => (ctx.idx.gradientsByCap.get(cid) || []).length, (cid) => {
    const n = ctx.idx.gradientsByCap.get(cid).length;
    return n + " gradient" + (n === 1 ? "" : "s");
  }),
  typography: (ctx, caps) => {
    const seen = new Map();
    for (const cid of caps) {
      for (const row of ctx.idx.typeByCap.get(cid) || []) {
        if (!seen.has(row[0] + "|" + norm(row[1] || ""))) seen.set(row[0] + "|" + norm(row[1] || ""), row);
      }
    }
    return ctx.rows([...seen.values()], (row) => {
      const role = row[0];
      const fam = row[1];
      const w = row[2];
      const size = row[3];
      return html`
        <div class="row" style="cursor:default">
          <span class="t">${L.term("typography.role." + role, role)} · ${esc(fam)}</span>
          <span class="s">${w || ""} · ${px(size)}</span>
        </div>
        <div class="type-sample" style=${specimenCss(fam) + ";font-weight:" + (w || 400) + ";font-size:" + Math.min(24, Math.max(13, (size || 14000) / 1000)) + "px"}>${specTxt()}</div>
        <font-source .family=${fam} .stack=${""} .captureId=${null} .observationIndex=${null} .representative=${true}></font-source>`;
    }, 120);
  },
};

export function vBrowse(c, ctx) {
  const { idx, D } = ctx;
  const kind0 = c.id;
  let kind = kind0;
  let value = c.label;
  const pipe = String(kind0).indexOf("|");
  if (pipe > 0) {
    kind = kind0.slice(0, pipe);
    value = kind0.slice(pipe + 1);
  }
  if (kind === "filter") {
    const route = value.slice(0, value.lastIndexOf("|"));
    const dk = value.slice(value.lastIndexOf("|") + 1);
    const set = baseSet(store, route);
    const caps = [...set].sort((a, b) => (idx.cById.get(b) || [4])[4] - (idx.cById.get(a) || [4])[4]);
    const itemCount = dk === "families" || dk === "domains" || dk === "terms" || dk === "facets" ? derive(store, set, dk).size
      : dk === "text" ? aggregateTextStyles(idx, caps).length : caps.length;
    const title = dk === "captures" ? caps.length + " captures" : itemCount + " " + (dk === "text" ? "text styles" : dk);
    const desc = "Filtered " + dk + " from " + (route === "all" ? "the whole corpus" : route.split("|")[0] === "cap" ? "capture #" + route.split("|")[1] : route.split("|")[0] + " " + route.split("|").slice(1).join("|")) + ".";
    const body = html`
      <p class="prose">${desc}</p>
      ${section(dk.replace(/_/g, " "), FILTER_ROWS[dk] ? FILTER_ROWS[dk](ctx, caps) : html`<div class="empty">nothing in this filter</div>`, itemCount)}
      ${foot(ctx, c)}`;
    return { n: title, body };
  }
  if (kind === "fonts") {
    const catalogue = D.families.map((family) => ({ kind: "catalogue", name: family[1], family }));
    const observed = [...idx.capturedFontsByNorm.values()].map((uses) => ({
      kind: "observed",
      name: uses[0][2],
      uses,
    }));
    const rows = [...catalogue, ...observed].sort((a, b) => a.name.localeCompare(b.name) || a.kind.localeCompare(b.kind));
    const body = ctx.rows(rows.slice(0, 240), (row) => row.kind === "catalogue"
      ? html`
        <button class="row" data-hop-type="family" data-hop-id=${row.family[0]} data-hop-label=${row.name.slice(0, 34)}>
          <span class="t"><span class="font-highlight">${esc(row.name)}</span></span>
          <span class="s">catalogue family #${row.family[0]}</span>
        </button>`
      : html`
        <button class="row" data-hop-type="capturedFont" data-hop-id="${row.uses[0][0]}:${row.uses[0][1]}" data-hop-label=${row.name.slice(0, 34)}>
          <span class="t"><span class="font-highlight">${esc(row.name)}</span></span>
          <span class="s">${row.uses.length} captured observation${row.uses.length === 1 ? "" : "s"}</span>
        </button>`);
    return {
      n: rows.length + " entries",
      body: html`
        <p class="prose">Captured font observations and catalogue families are listed separately. A shared name is not treated as a confirmed match.</p>
        ${section("fonts", body, rows.length)}
        ${foot(ctx, c)}`,
    };
  }
  if (kind === "motion") {
    const list = (D.motion_assets || []).slice().sort((a, b) => b[4] - a[4]);
    return {
      n: list.length + " recordings",
      body: html`
        <p class="prose">All recorded WebM motion assets, longest first.</p>
        ${section("recordings", ctx.rows(list, (m) => capRow(idx.cById.get(m[0]), "\u25b6 " + Math.round(m[4] / 1000) + "s · " + (m[3] / 1048576).toFixed(1) + " MB"), 120), list.length)}
        ${foot(ctx, c)}`,
    };
  }
  if (kind === "video") {
    const list = (D.embedded_video_captures || []).slice().sort((a, b) => b.captured_at - a.captured_at);
    return {
      n: list.length + " captures",
      body: html`
        <p class="prose">Captures with measured video elements, newest first.</p>
        ${section("captures with video", ctx.rows(list, (v) => {
          const cp = idx.cById.get(v.id) || [v.id, v.origin, v.path, v.title, v.captured_at, v.image_url || "", 0, 0, 0];
          const rows = idx.videoByCap.get(v.id) || [];
          const maxCov = rows.length ? Math.max(...rows.map((r) => r[5])) : 0;
          return capRow(cp, rows.length + " element" + (rows.length === 1 ? "" : "s") + " · " + Math.round(maxCov / 10000) + "% max");
        }, 120), list.length)}
        ${foot(ctx, c)}`,
    };
  }
  if (kind === "captures") {
    const list = D.captures.slice().sort((a, b) => b[4] - a[4]).slice(0, 200);
    return {
      n: D.captures.length + " corpus",
      body: html`
        <p class="prose">All captures, newest first.</p>
        ${section("captures", ctx.rows(list, (cp) => capRow(cp)), list.length)}
        ${foot(ctx, c)}`,
    };
  }
  let caps = [];
  if (kind === "path") caps = idx.cByPath.get(value) || [];
  else if (kind === "theme") caps = idx.cByTheme.get(value) || [];
  else if (kind === "device") caps = idx.cByDevice.get(value) || [];
  else if (kind === "state") caps = idx.cByState.get(value) || [];
  const domains = new Set(caps.map((x) => x[1])).size;
  const list = caps.slice().sort((a, b) => b[4] - a[4]);
  const label = kind === "path" ? (value || "/") : kind + " · " + value;
  const prose = caps.length + " captures" + (kind === "path" ? " at path " + esc(value || "/") + " across " + domains + " domains" : " with " + kind + " \u201c" + esc(value) + "\u201d") + ".";
  return {
    n: caps.length + " captures",
    body: html`
      <p class="prose">${prose}</p>
      ${section("captures", ctx.rows(list, (cp) => capRow(cp), 60), caps.length)}
      ${foot(ctx, c)}`,
  };
}

export function vIndex(c, ctx) {
  const { idx, D } = ctx;
  const kind = c.id;
  if (kind === "facets") {
    const facets = [...new Set(Object.values(D.terms).map((t) => t[2]))].sort();
    return {
      n: facets.length + " facets",
      body: html`
        ${section("facets", facets.map((f) => {
          const n = Object.keys(D.terms).filter((t) => D.terms[t][2] === f).length;
          return html`<button class="chip" data-hop-type="facet" data-hop-id=${f} data-hop-label=${f}>${esc(f.replace(/_/g, " "))} · ${n}</button>`;
        }))}
        ${foot(ctx, c)}`,
    };
  }
  const rows = kind === "domains" ? [...idx.cByDomain.entries()].sort((a, b) => b[1].length - a[1].length)
    : [...D.families].sort((a, b) => (idx.relCount.get(b[0]) || 0) - (idx.relCount.get(a[0]) || 0));
  return {
    n: rows.length.toLocaleString() + " " + kind,
    body: html`
      ${section(kind, kind === "domains"
        ? ctx.rows(rows, ([origin, caps]) => html`
          <button class="row" data-hop-type="domain" data-hop-id=${origin} data-hop-label=${origin.replace("https://", "").slice(0, 34)}>
            <span class="t"><fudge-favicon .origin=${origin}></fudge-favicon> ${esc(origin.replace("https://", ""))}</span>
            <span class="s">${caps.length} caps</span>
          </button>`, 80)
        : ctx.rows(rows, (f) => html`
          <button class="row" data-hop-type="family" data-hop-id=${f[0]} data-hop-label=${f[1].slice(0, 34)}>
            <span class="t">${esc(f[1])}</span>
            <span class="s">${idx.relCount.get(f[0]) || 0} releases</span>
          </button>`, 80))}
      ${foot(ctx, c)}`,
  };
}
