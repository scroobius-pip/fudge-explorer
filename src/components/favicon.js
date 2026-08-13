import { LitElement, html, nothing } from "lit";
import { esc } from "../data/util.js";

export class FaviconElement extends LitElement {
  static properties = {
    origin: { type: String },
    inline: { type: Boolean },
  };

  createRenderRoot() {
    return this;
  }

  constructor() {
    super();
    this.origin = "";
    this.inline = false;
    this.loaded = false;
    this.failed = false;
  }

  render() {
    const label = String(this.origin || "").replace(/^https?:\/\//, "").replace(/\/$/, "").charAt(0).toUpperCase() || "·";
    const url = "https://www.google.com/s2/favicons?domain_url=" + encodeURIComponent(this.origin || "") + "&sz=64";
    return html`
      <span class="favicon${this.inline ? " inline" : ""}">
        <span class="fl" ?hidden=${this.loaded}>${esc(label)}</span>
        ${this.failed ? nothing : html`
          <img loading="lazy" decoding="async" referrerpolicy="no-referrer" src=${url} alt=""
            @load=${() => { this.loaded = true; }}
            @error=${() => { this.failed = true; this.requestUpdate(); }}>
        `}
      </span>`;
  }
}
customElements.define("fudge-favicon", FaviconElement);
