import { html, nothing } from "lit";
import { FudgeElement } from "./base.js";
import { store } from "../data/store.js";
import { loadVerifiedReleaseFont } from "../data/fonts.js";
import { esc, specTxt } from "../data/util.js";

function previewErrorLabel(code) {
  if (!code) return "preview unavailable";
  if (code.includes("timeout")) return "render timed out";
  if (code.includes("busy") || code.includes("rate_limited")) return "retry shortly";
  if (code.includes("invalid")) return "invalid preview";
  if (code.includes("archive")) return "archive unavailable";
  if (code.includes("candidate") || code.includes("body")) return "font unavailable";
  return "preview unavailable";
}

export class FontPreviewElement extends FudgeElement {
  static properties = {
    result: { attribute: false },
    releaseFallback: { type: Boolean },
  };

  constructor() {
    super();
    this.result = null;
    this.releaseFallback = false;
    this.stateText = "rendering specimen";
    this.failed = false;
    this.loaded = false;
    this.releaseEntry = null;
    this.releaseSource = null;
    this.fallbackComplete = false;
    this.loadSeq = 0;
  }

  get stateLabel() {
    return this.failed ? this.stateText : "rendering specimen";
  }

  willUpdate(changed) {
    if (changed.has("result")) {
      this.loadSeq++;
      this.stateText = "rendering specimen";
      this.failed = false;
      this.loaded = false;
      this.releaseEntry = null;
      this.releaseSource = null;
      this.fallbackComplete = false;
    }
  }

  async onError(img) {
    const seq = this.loadSeq;
    this.failed = true;
    this.loaded = false;
    this.stateText = "preview unavailable";
    try {
      const response = await fetch(img.src, { headers: { accept: "application/json" } });
      if (response.ok) return;
      const body = await response.json();
      const code = typeof body?.error === "string" ? body.error : typeof body?.code === "string" ? body.code : "";
      const reason = typeof body?.message === "string" ? body.message : typeof body?.reason === "string" ? body.reason : "";
      this.stateText = previewErrorLabel(code) + (reason ? " · " + reason.slice(0, 160) : "");
    } catch (_) {
      // Keep the generic archive error when its JSON diagnostic is unavailable.
    }
    if (seq !== this.loadSeq) return;
    this.requestUpdate();
    if (this.releaseFallback) await this.loadReleaseFallback(seq);
  }

  async loadReleaseFallback(seq) {
    const familyId = Number(this.result?.familyId);
    if (!Number.isSafeInteger(familyId) || familyId < 1) return;
    this.stateText = "loading verified pinned release";
    this.requestUpdate();
    try {
      const payload = await store.loadSimilarity(
        "font-source:" + familyId,
        "/v1/family-font-source",
        { familyId },
      );
      if (seq !== this.loadSeq) return;
      if (!payload.source) {
        this.fallbackComplete = true;
        this.requestUpdate();
        return;
      }
      const entry = await loadVerifiedReleaseFont(payload.source, familyId);
      if (seq !== this.loadSeq) return;
      if (!entry || entry.state !== "loaded") {
        this.fallbackComplete = true;
        this.requestUpdate();
        return;
      }
      this.releaseEntry = entry;
      this.releaseSource = payload.source;
      this.failed = false;
      this.loaded = true;
      this.requestUpdate();
    } catch (_) {
      if (seq !== this.loadSeq) return;
      this.fallbackComplete = true;
      this.requestUpdate();
    }
  }

  render() {
    const result = this.result;
    if (!result || !result.previewUrl) {
      return html`<div class="font-preview failed"><div class="font-preview-state">preview unavailable · exact specimen identity was not returned</div></div>`;
    }
    if (this.releaseFallback && this.fallbackComplete) {
      return html`<div class="font-preview-unavailable">No verified font file for catalogue family #${result.familyId}</div>`;
    }
    if (this.releaseEntry) {
      return html`
        <div class="font-preview loaded release" title="verified pinned release specimen">
          <div class="font-preview-live" style=${`font-family:'${this.releaseEntry.face}', sans-serif`}>${specTxt()}</div>
        </div>`;
    }
    return html`
      <div class="font-preview${this.failed ? " failed" : ""}${this.loaded ? " loaded" : ""}" title=${this.loaded ? "server specimen" : nothing}>
        <div class="font-preview-state">${this.stateLabel}</div>
        <img loading="lazy" decoding="async" src=${result.previewUrl} alt="${esc(result.familyName || "")} specimen"
          @load=${() => { this.failed = false; this.loaded = true; this.requestUpdate(); }}
          @error=${(e) => this.onError(e.target)}>
      </div>`;
  }
}
customElements.define("font-preview", FontPreviewElement);
