import { html } from "lit";
import { LightElement } from "./light-element.ts";

export class FudgeAction extends LightElement {
  static properties = {
    label: { type: String },
    disabled: { type: Boolean, reflect: true },
  };

  label = "Continue";
  disabled = false;

  override connectedCallback() {
    super.connectedCallback();
    this.dataset.composeKind = "action";
    this.dataset.state ||= "idle";
  }

  protected override render() {
    return html`
      <button type="submit" ?disabled=${this.disabled}>
        <span>${this.label}</span>
        <span class="fudge-action-progress" aria-hidden="true"></span>
      </button>
    `;
  }
}

customElements.define("fudge-action", FudgeAction);
