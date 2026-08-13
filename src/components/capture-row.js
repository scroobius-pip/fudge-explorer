import { html, nothing } from "lit";
import { FudgeElement } from "./base.js";
import { store } from "../data/store.js";
import { captureFamilies } from "../data/indexes.js";
import { esc, fmtDate, capFallback } from "../data/util.js";

export class CaptureRowElement extends FudgeElement {
  static properties = {
    capture: { attribute: false },
    meta: { attribute: false },
    note: { type: String },
    evidence: { attribute: false },
  };

  constructor() {
    super();
    this.capture = null;
    this.meta = "";
    this.note = "";
    this.evidence = null;
    this.thumbLoaded = false;
    this.thumbMissing = false;
  }

  render() {
    const cp = this.capture;
    if (!cp) return nothing;
    const id = cp[0];
    const idx = store.idx;
    const note = this.note ? this.note + " " : "";
    const sub = note + esc(cp[1].replace("https://", "")) + (cp[2] && cp[2] !== "/" ? " · " + esc(cp[2]) : "");
    const measuredColors = (idx.colorsByCap.get(id) || []).length;
    const legacyColors = (idx.legacyColorsByCap.get(id) || []).length;
    const colorMeta = [measuredColors ? measuredColors + " measured" : "", legacyColors ? legacyColors + " legacy" : ""].filter(Boolean).join("+") || "0";
    const familyCount = captureFamilies(idx, id).length;
    const m = this.meta || fmtDate(cp[4]) + " · " + colorMeta + " colors · " + familyCount + " families · " + (idx.termsByCap.get(id) || []).length + " terms";
    return html`
      <button class="capture-row" data-hop-type="capture" data-hop-id=${id} data-hop-label=${String(cp[3] || "").slice(0, 34)}>
        <span class="capture-thumb" data-capture=${id} style=${`background-image:${capFallback(cp)}`}>
          <img loading="lazy" decoding="async" src=${cp[5]} alt=""
            class=${this.thumbLoaded ? "loaded" : ""}
            ?hidden=${this.thumbMissing}
            @load=${() => { this.thumbLoaded = true; this.requestUpdate(); }}
            @error=${() => { this.thumbMissing = true; this.requestUpdate(); }}>
          ${idx.videoByCap.has(id) ? html`<span class="video-badge">V</span>` : nothing}
          ${idx.motionByCap.has(id) ? html`<span class="motion-badge">▶</span>` : nothing}
        </span>
        <span class="capture-copy">
          <span class="capture-title">${esc(cp[3])}</span>
          <span class="capture-sub">${sub}</span>
          ${this.evidence ? html`<span class="capture-evidence">${this.evidence}</span>` : nothing}
          <span class="capture-meta">${m}</span>
        </span>
        <span class="row-arrow">›</span>
      </button>`;
  }
}
customElements.define("capture-row", CaptureRowElement);
