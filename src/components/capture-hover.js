import { html, nothing } from "lit";
import { FudgeElement } from "./base.js";
import { store } from "../data/store.js";
import { captureFamilies, termLabel } from "../data/indexes.js";
import { esc, fmtDate, hex, intHex } from "../data/util.js";

export class CaptureHoverElement extends FudgeElement {
  constructor() {
    super();
    this.visible = false;
    this.overId = null;
    this.timer = 0;
    this.__resize = () => this.hide();
  }

  connectedCallback() {
    super.connectedCallback();
    window.addEventListener("resize", this.__resize);
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    window.removeEventListener("resize", this.__resize);
  }

  show(id, rect) {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.overId = id;
      this.visible = true;
      this.requestUpdate();
      const w = this.offsetWidth;
      const h = this.offsetHeight;
      let left = rect.right + 10;
      if (left + w > innerWidth - 10) left = rect.left - w - 10;
      if (left < 10) left = 10;
      let top = Math.max(10, Math.min(rect.top - 16, innerHeight - h - 10));
      this.style.left = left + "px";
      this.style.top = top + "px";
    }, 120);
  }

  hide() {
    clearTimeout(this.timer);
    this.visible = false;
    this.overId = null;
    this.requestUpdate();
  }

  render() {
    return html`
      <div id="cap-hover" class="${this.visible ? "open" : ""}">${this.overId != null ? this.markup(this.overId) : nothing}</div>`;
  }

  markup(id) {
    const idx = store.idx;
    const x = idx.cById.get(Number(id));
    if (!x) return nothing;
    const colors = idx.colorsByCap.get(Number(id)) || [];
    const legacyColors = idx.legacyColorsByCap.get(Number(id)) || [];
    const fonts = captureFamilies(idx, Number(id)).slice(0, 4);
    const terms = (idx.termsByCap.get(Number(id)) || []).slice(0, 4).map(([t]) => termLabel(store.data, t));
    const palette = colors.length
      ? colors.slice(0, 8).map((c) => hex(c[1], c[2], c[3]))
      : legacyColors.slice(0, 8).map((row) => intHex(Array.isArray(row) ? row[0] : row));
    const grad = palette.length
      ? "linear-gradient(90deg," + palette.map((color, i) => color + " " + Math.round(i * 100 / palette.length) + "% " + Math.round((i + 1) * 100 / palette.length) + "%").join(",") + ")"
      : "var(--soft)";
    const m = idx.motionByCap.get(Number(id));
    const media = m
      ? html`<div style="position:relative;width:100%;aspect-ratio:${m[5]}/${m[6]};background:#000">
          <img src=${x[5]} alt="" style="position:absolute;inset:0;width:100%;height:100%;object-fit:contain;z-index:1"
            @error=${(e) => { e.target.style.display = "none"; }}>
          <video autoplay muted loop playsinline preload="metadata" poster=${x[5]} src=${m[1]}
            @loadeddata=${(e) => { e.target.previousElementSibling.style.opacity = "0"; }}
            style="position:absolute;inset:0;width:100%;height:100%;object-fit:contain;background:#000"></video>
          <span style="position:absolute;right:6px;bottom:4px;z-index:2;font-size:9px;color:rgba(255,255,255,.9);background:rgba(0,0,0,.55);padding:1px 7px;border-radius:99px">▶ ${Math.round(m[4] / 1000)}s</span>
        </div>`
      : html`<img src=${x[5]} alt="" @error=${(e) => { e.target.style.display = "none"; }}>`;
    return html`
      <div class="imgw" style="position:relative;background:${grad}">${media}</div>
      <div class="hmeta">
        <div class="ht">${esc(x[3])}</div>
        <div class="hs">${esc(x[1].replace("https://", ""))}${x[2] ? " · " + esc(x[2]) : ""} · ${fmtDate(x[4])}</div>
        ${palette.length ? html`<div class="hp">${palette.map((color) => html`<span style=${`background:${color}`}></span>`)}</div>` : nothing}
        ${fonts.length || terms.length ? html`<div class="htags">${fonts.map(esc).join(" · ")}${fonts.length && terms.length ? "  /  " : ""}${terms.map(esc).join(" · ")}</div>` : nothing}
      </div>`;
  }
}
customElements.define("explorer-hover", CaptureHoverElement);
