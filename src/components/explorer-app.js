import { html, nothing } from "lit";
import { repeat } from "lit/directives/repeat.js";
import { FudgeElement } from "./base.js";
import { store, columnKey } from "../data/store.js";
import { downloadText } from "../data/util.js";
import { fontFaceCount } from "../data/fonts.js";
import "./explorer-search.js";
import "./explorer-column.js";
import "./lightbox.js";
import "./capture-hover.js";
import "./favicon.js";

export class ExplorerAppElement extends FudgeElement {
  constructor() {
    super();
    this.__prevLength = 0;
    this.__gen = null;
    this.__restore = () => store.restoreRoute();
  }

  __onStoreChange = () => {
    if (this.__gen !== store.generation) {
      this.__gen = store.generation;
      this.querySelector("explorer-hover")?.hide();
      this.querySelector("explorer-lightbox")?.close();
    }
    this.requestUpdate();
  };

  connectedCallback() {
    super.connectedCallback();
    window.addEventListener("hashchange", this.__restore);
    window.addEventListener("popstate", this.__restore);
    document.addEventListener("keydown", this.__onKeydown);
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    window.removeEventListener("hashchange", this.__restore);
    window.removeEventListener("popstate", this.__restore);
    document.removeEventListener("keydown", this.__onKeydown);
  }

  __onKeydown = (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
      e.preventDefault();
      this.querySelector("explorer-search")?.focusInput();
    }
    if (e.key === "Escape") {
      const search = this.querySelector("explorer-search");
      const lightbox = this.querySelector("explorer-lightbox");
      if (search?.hasInputFocus() === false && !lightbox?.open && store.columns.length > 1) {
        store.setColumns(store.columns.slice(0, -1));
      }
    }
  };

  firstUpdated() {
    this.__cols = this.querySelector("#cols");
    this.__cols.addEventListener("pointerover", this.__onPointerOver);
    this.__cols.addEventListener("pointerout", this.__onPointerOut);
    this.__cols.addEventListener("scroll", this.__onScroll, true);
    window.FudgeThemeManager?.mount?.(this.querySelector("#theme-picker"));
  }

  __onPointerOver = (e) => {
    const b = e.target.closest(".row, .capture-row");
    if (!b) return;
    if (b.dataset.hopType !== "capture") return;
    const id = Number(b.dataset.hopId);
    if (!store.idx.cById.has(id)) return;
    this.querySelector("explorer-hover")?.show(id, b.getBoundingClientRect());
  };

  __onPointerOut = (e) => {
    if (e.target.closest(".row, .capture-row")) this.querySelector("explorer-hover")?.hide();
  };

  __onScroll = () => {
    this.querySelector("explorer-hover")?.hide();
  };

  __onClick = (e) => {
    const target = e.composedPath()[0];
    if (!(target instanceof Element)) return;
    const capture = target.closest("[data-capture]");
    if (capture) {
      e.stopPropagation();
      const id = Number(capture.dataset.capture);
      if (store.idx.cById.has(id)) this.querySelector("explorer-lightbox")?.openTrigger(capture, id);
      return;
    }
    const download = target.closest("[data-download]");
    if (download) {
      const obj = store.rawCache.get(Number(download.dataset.download));
      if (obj != null) downloadText(download.dataset.filename || "data.json", JSON.stringify(obj));
      return;
    }
    const more = target.closest("[data-more-id]");
    if (more) {
      more.closest("explorer-column")?.loadMore(Number(more.dataset.moreId));
      return;
    }
    const hop = target.closest("[data-hop-type]");
    if (hop) store.hop(hop.dataset.hopType, hop.dataset.hopId, hop.dataset.hopLabel || "");
  };

  get metaTitle() {
    const d = store.data;
    if (!d) return "";
    const g = store.gradients;
    const fs = store.fontSources;
    const legacyColorCount = Object.values(store.legacyColors).reduce((sum, rows) => sum + rows.length, 0);
    return d.domains.length.toLocaleString() + " domains · " + d.captures.length.toLocaleString() + " captures · "
      + d.families.length.toLocaleString() + " families · " + Object.keys(d.terms).length + " terms · "
      + d.color_roles.length.toLocaleString() + " measured colors · " + legacyColorCount.toLocaleString() + " legacy palette colors · "
      + d.font_obs.length.toLocaleString() + " font observations · " + (d.ann ? Object.keys(d.ann).length : 0) + " ANN pivots · "
      + (d.motion_assets || []).length.toLocaleString() + " motion · "
      + (d.font_similarity_results ? Object.keys(d.font_similarity_results).length : 0) + " font-sim"
      + (d.text_styles ? " · " + d.text_styles.length.toLocaleString() + " text styles" : "")
      + (d.hist_fonts ? " · " + d.hist_fonts.length.toLocaleString() + " legacy attributions" : "")
      + (Object.keys(g).length ? " · " + Object.keys(g).length + " gradient captures" : "")
      + (Object.keys(fs).length ? " · " + fontFaceCount() + " font preview faces" : "")
      + (store.relations.length ? " · " + store.relations.length + " relations" : "");
  }

  get metaText() {
    const d = store.data;
    if (store.loading && !d) return store.progress.label;
    if (store.error) return "load failed";
    return d.captures.length.toLocaleString() + " captures · " + d.domains.length.toLocaleString() + " domains"
      + (store.detailsLoading ? " · loading details" : store.detailsError ? " · details unavailable" : "");
  }

  columnClass(i) {
    const last = store.columns.length - 1;
    return "col" + (store.animateColumns && i === last ? " enter" : "") + (i === last ? " active" : "");
  }

  updated() {
    if (store.columns.length !== this.__prevLength && this.__cols) {
      this.__prevLength = store.columns.length;
      this.__cols.scrollTo({ left: this.__cols.scrollWidth, behavior: "smooth" });
    }
  }

  render() {
    const d = store.data;
    return html`
      <header ?inert=${store.loading && !d}>
        <div class="brand-block">
          <div class="title">Fudge <span>Explorer</span></div>
          <div class="meta" id="meta" title=${this.metaTitle}>${this.metaText}</div>
        </div>
        <explorer-search></explorer-search>
        <div class="top-actions">
          <label class="theme-control" title="Theme">
            <span class="theme-icon" aria-hidden="true">◐</span>
            <select id="theme-picker" class="theme-select" aria-label="Theme"></select>
          </label>
          <a class="design-cta" href="https://design.withfudge.com">Design with Fudge ↗</a>
        </div>
      </header>
      <main id="cols" aria-busy=${store.loading || store.detailsLoading ? "true" : "false"} @click=${this.__onClick}>
        ${store.error && !d ? html`<div class="col"><div class="cbody"><div class="empty">Failed to load explorer data.<br>${store.error}</div></div></div>` : nothing}
        ${repeat(store.columns, (c) => columnKey(c), (c, i) => html`
          <explorer-column class=${this.columnClass(i)} .column=${c} .index=${i} .generation=${store.revision}></explorer-column>
        `)}
      </main>
      <explorer-lightbox></explorer-lightbox>
      <explorer-hover></explorer-hover>`;
  }
}
customElements.define("explorer-app", ExplorerAppElement);
