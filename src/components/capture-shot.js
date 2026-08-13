import { html } from "lit";
import { FudgeElement } from "./base.js";
import { capFallback } from "../data/util.js";

export class CaptureShotElement extends FudgeElement {
  static properties = {
    capture: { attribute: false },
  };

  constructor() {
    super();
    this.capture = null;
    this.loaded = false;
    this.failed = false;
  }

  render() {
    const cp = this.capture;
    return html`
      <div class="shot-wrap" style=${`background-image:${capFallback(cp)}`}>
        <div class="shot-fallback" style=${this.failed ? "display:block" : ""}>preview unavailable</div>
        <img class="shot${this.loaded ? " loaded" : ""}" data-capture=${cp ? cp[0] : ""} loading="lazy" decoding="async"
          src=${cp ? cp[5] : ""} alt="" style=${this.failed ? "display:none" : ""}
          @load=${() => { this.loaded = true; this.requestUpdate(); }}
          @error=${() => { this.failed = true; this.requestUpdate(); }}>
      </div>`;
  }
}
customElements.define("capture-shot", CaptureShotElement);
