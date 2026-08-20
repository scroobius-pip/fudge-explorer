import { html } from "lit";
import { FudgeElement } from "./base.js";
import { sourceEntry, sourceUrlDisplay, safeFontStack } from "../data/fonts.js";
import { esc } from "../data/util.js";

export class FontSourceElement extends FudgeElement {
  static properties = {
    family: { type: String },
    stack: { type: String },
    captureId: { type: Number },
    observationIndex: { type: Number },
    representative: { type: Boolean },
    inline: { type: Boolean },
  };

  constructor() {
    super();
    this.family = "";
    this.stack = "";
    this.captureId = null;
    this.observationIndex = null;
    this.representative = false;
    this.inline = false;
    this.__entry = null;
    this.__notify = () => this.requestUpdate();
  }

  updated() {
    const entry = sourceEntry(this.family, this.captureId, this.observationIndex);
    if (entry !== this.__entry) {
      if (this.__entry) this.__entry.listeners.delete(this.__notify);
      this.__entry = entry;
      if (entry) entry.listeners.add(this.__notify);
      this.requestUpdate();
    }
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    if (this.__entry) this.__entry.listeners.delete(this.__notify);
    this.__entry = null;
  }

  render() {
    const entry = this.__entry;
    if (!entry) {
      return html`<div class="font-src"><b>browser source unavailable</b> · ${esc(safeFontStack(this.stack, this.family))}</div>`;
    }
    const label = entry.state === "loading" ? "loading source"
      : entry.state === "loaded" ? "src loaded"
      : entry.state === "error" ? "load failed"
      : this.representative ? "representative source"
      : "source";
    const suffix = entry.state === "loaded" ? "" : " · showing fallback";
    const content = html`<b>${label}</b> ${esc(sourceUrlDisplay(entry.url))} · ${esc(entry.format || "")}${suffix}`;
    if (this.inline) {
      return html`<span class="font-src" data-font-load-state=${entry.state} title=${sourceUrlDisplay(entry.url)} style="margin:0;display:inline">${content}</span>`;
    }
    return html`<div class="font-src" data-font-load-state=${entry.state} title=${sourceUrlDisplay(entry.url)}>${content}</div>`;
  }
}
customElements.define("font-source", FontSourceElement);
