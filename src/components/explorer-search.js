import { html, nothing } from "lit";
import { FudgeElement } from "./base.js";
import { store } from "../data/store.js";
import { termLabel, termFacet } from "../data/indexes.js";
import { esc, fmtDate, norm } from "../data/util.js";
import "./favicon.js";

export class ExplorerSearchElement extends FudgeElement {
  constructor() {
    super();
    this.value = "";
    this.groups = [];
    this.openState = false;
    this.hlIndex = 0;
    this.hlFns = [];
    this.__gen = null;
  }

  updated() {
    if (this.__gen !== store.generation) {
      this.__gen = store.generation;
      this.reset();
    }
  }

  get input() {
    return this.querySelector("#q");
  }

  hasInputFocus() {
    return document.activeElement === this.input;
  }

  focusInput() {
    this.input?.focus();
    this.input?.select();
  }

  reset() {
    this.value = "";
    this.openState = false;
    this.groups = [];
    this.hlFns = [];
    this.hlIndex = 0;
    this.requestUpdate();
    if (this.input) this.input.value = "";
  }

  doSearch() {
    const s = this.input.value.trim().toLowerCase();
    if (!s) {
      this.reset();
      return;
    }
    const { idx } = store;
    const D = store.data;
    const groups = [];
    const doms = [...idx.cByDomain.keys()].filter((o) => o.includes(s)).slice(0, 6);
    const caps = D.captures.filter((cp) => cp[3].toLowerCase().includes(s) || cp[1].includes(s)).slice(0, 6);
    const fams = D.families.filter((f) => f[1].toLowerCase().includes(s)).slice(0, 6);
    const observedFonts = [...idx.capturedFontsByNorm.entries()]
      .filter(([name]) => name.includes(norm(s)))
      .flatMap(([, rows]) => rows)
      .slice(0, 8);
    const terms = Object.keys(D.terms).filter((t) => termLabel(D, t).toLowerCase().includes(s) || t.includes(s)).slice(0, 6);
    const facets = [...new Set(Object.values(D.terms).map((t) => t[2]))].filter((f) => f.includes(s) || f.replace(/_/g, " ").includes(s)).slice(0, 6);
    const paths = [...idx.cByPath.keys()].filter((p) => p.includes(s)).slice(0, 4);
    if (doms.length) groups.push({ g: "domains", items: doms.map((o) => ({ origin: o, t: o.replace("https://", ""), s: (idx.cByDomain.get(o) || []).length + " captures", c: "var(--entity-domain)", fn: () => store.fresh("domain", o, o.replace("https://", "")) })) });
    if (caps.length) groups.push({ g: "captures", items: caps.map((cp) => ({ t: cp[3], s: cp[1].replace("https://", "") + " · " + fmtDate(cp[4]), c: "var(--entity-capture)", fn: () => store.fresh("capture", cp[0], cp[3].slice(0, 40)) })) });
    if (fams.length) groups.push({ g: "font families", items: fams.map((f) => ({ t: f[1], s: "#" + f[0], c: "var(--entity-family)", fn: () => store.fresh("family", f[0], f[1].slice(0, 40)) })) });
    if (observedFonts.length) groups.push({ g: "captured fonts", items: observedFonts.map(([captureId, observationIndex, family]) => {
      const capture = idx.cById.get(captureId);
      return {
        t: family,
        s: capture ? `${capture[1].replace("https://", "")} · capture #${captureId}` : `capture #${captureId}`,
        c: "var(--entity-family)",
        fn: () => store.fresh("capturedFont", `${captureId}:${observationIndex}`, family.slice(0, 40)),
      };
    }) });
    if (terms.length) groups.push({ g: "terms", items: terms.map((t) => ({ t: termLabel(D, t), s: termFacet(D, t), c: "var(--entity-term)", fn: () => store.fresh("term", t, String(termLabel(D, t)).slice(0, 40)) })) });
    if (facets.length) groups.push({ g: "facets", items: facets.map((f) => ({ t: f.replace(/_/g, " "), s: "facet", c: "var(--entity-facet)", fn: () => store.fresh("facet", f, f) })) });
    if (paths.length) groups.push({ g: "paths", items: paths.map((p) => ({ t: p || "/", s: (idx.cByPath.get(p) || []).length + " captures", c: "var(--entity-neutral)", fn: () => store.fresh("browse", "path", p) })) });
    const designers = D.designers.filter((x) => x[1].toLowerCase().includes(s)).slice(0, 5);
    if (designers.length) groups.push({ g: "designers", items: designers.map((x) => ({ t: x[1], s: "designer", c: "var(--entity-designer)", fn: () => store.fresh("designer", x[0], x[1].slice(0, 40)) })) });
    const vendors = D.vendors.filter((x) => x[1].toLowerCase().includes(s)).slice(0, 5);
    if (vendors.length) groups.push({ g: "foundries", items: vendors.map((x) => ({ t: x[1], s: "vendor", c: "var(--entity-designer)", fn: () => store.fresh("vendor", x[0], x[1].slice(0, 40)) })) });
    const rels2 = store.relations.filter((r) => r.name.toLowerCase().includes(s)).slice(0, 6);
    if (rels2.length) groups.push({ g: "relations", items: rels2.map((r) => ({ t: r.name, s: (r.keys || 0) + "+" + (r.nonkeys || 0), c: "var(--entity-neutral)", fn: () => store.fresh("relation", r.name, r.name.slice(0, 40)) })) });
    const lookups = Object.keys(D.font_similarity_results || {}).filter((n) => n.toLowerCase().includes(s)).slice(0, 5);
    if (lookups.length) groups.push({ g: "similarity lookups", items: lookups.map((n) => ({ t: n, s: (D.font_similarity_results[n] || []).length + " results", c: "var(--entity-family)", fn: () => store.fresh("fontLookup", n, n.slice(0, 40)) })) });
    const systems = [];
    if (s.includes("motion") || s.includes("webm")) systems.push({ t: "Recorded motion", s: "all WebM captures", c: "var(--entity-motion)", fn: () => store.fresh("browse", "motion", "motion") });
    if (s.includes("video") || s.includes("media")) systems.push({ t: "Page video", s: "video-bearing captures", c: "var(--entity-video)", fn: () => store.fresh("browse", "video", "video") });
    if (s.includes("font") && s.includes("similar")) systems.push({ t: "Font similarity", s: "descriptor engine", c: "var(--entity-family)", fn: () => store.fresh("fontSim", "font-similarity", "Font similarity") });
    if (s.includes("embedding") || s.includes("similar capture")) systems.push({ t: "Embeddings", s: "visual similarity index", c: "var(--entity-color)", fn: () => store.fresh("embeddings", "embeddings", "Embeddings") });
    if (s.includes("schema") || s.includes("relation")) systems.push({ t: "Schema", s: "all relations", c: "var(--entity-neutral)", fn: () => store.fresh("relations", "relations", "Schema") });
    if (systems.length) groups.push({ g: "systems", items: systems });
    this.groups = groups;
    this.openState = true;
    this.hlIndex = 0;
    this.hlFns = groups.flatMap((g) => g.items.map((it) => it.fn));
    this.requestUpdate();
  }

  moveHl(d) {
    const items = this.groups.flatMap((g) => g.items);
    if (!items.length) return;
    this.hlIndex = (this.hlIndex + d + items.length) % items.length;
    this.requestUpdate();
    const buttons = [...this.querySelectorAll("#results .res")];
    if (buttons[this.hlIndex]) buttons[this.hlIndex].scrollIntoView({ block: "nearest" });
  }

  pick(index) {
    if (this.hlFns[index]) {
      this.hlFns[index]();
      this.reset();
    }
  }

  onInputKeydown(e) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      this.moveHl(1);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      this.moveHl(-1);
    } else if (e.key === "Enter") {
      if (this.hlFns[this.hlIndex]) {
        this.hlFns[this.hlIndex]();
        this.reset();
      }
    } else if (e.key === "Escape") {
      this.reset();
      this.input?.blur();
    }
  }

  render() {
    const items = this.groups.flatMap((g) => g.items);
    return html`
      <div class="wrap">
        <input class="search" id="q" type="search" placeholder="Search anything…  ↑↓ Enter · Esc closes column"
          autocomplete="off" spellcheck="false"
          @input=${() => this.doSearch()}
          @keydown=${(e) => this.onInputKeydown(e)}>
        <div id="results" class="${this.openState ? "on" : ""}">
          ${this.groups.map((g) => html`
            <div class="rg">${g.g}</div>
            ${g.items.map((it, i) => {
              const index = items.indexOf(it);
              return html`
                <button class="res${index === this.hlIndex ? " hl" : ""}" @click=${() => this.pick(index)}>
                  ${it.origin ? html`<fudge-favicon .origin=${it.origin} inline></fudge-favicon>` : html`<span class="sdot" style=${`background:${it.c}`}></span>`}
                  <span class="t">${esc(it.t)}</span><span class="s">${esc(it.s)}</span>
                </button>`;
            })}
          `)}
          ${!this.groups.length ? html`<div class="rg">no matches</div>` : nothing}
        </div>
      </div>`;
  }
}
customElements.define("explorer-search", ExplorerSearchElement);
