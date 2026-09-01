import { html } from "lit";
import { LightElement } from "./light-element.ts";

export class FudgeHeading extends LightElement {
  static properties = {
    text: { type: String },
    description: { type: String },
  };

  text = "";
  description = "";

  override connectedCallback() {
    super.connectedCallback();
    this.dataset.composeKind = "heading";
    this.dataset.state ||= "idle";
  }

  protected override render() {
    return html`
      <svg
        class="fudge-mark"
        role="img"
        aria-label="Fudge"
        viewBox="49.354 164.332 293.006 328.011"
      >
        <path
          d="M314.788 336.851 L201.515 336.851 Q190.515 336.851 190.515 347.851 L190.515 464.771 Q190.515 474.771 180.515 474.771 L76.926 474.771 Q66.926 474.771 69.241 465.043 L88.417 384.453 Q90.732 374.725 99.212 369.425 L146.983 339.569 Q156.311 333.739 146.555 328.657 L113.001 311.179 Q104.132 306.559 99.636 297.627 L77.371 253.4 Q72.875 244.468 71.928 234.513 L67.879 191.955 Q66.932 182 76.932 182 L180.515 182 Q190.515 182 190.593 192 L191.153 263.294 Q191.239 274.294 196.721 264.758 L221.979 220.824 Q226.963 212.155 236.159 208.227 L283.997 187.793 Q293.193 183.865 303.174 183.246 L314.807 182.523 Q324.788 181.904 324.788 191.904 L324.788 326.851 Q324.788 336.851 314.788 336.851 Z"
        />
      </svg>
      <h1>${this.text}</h1>
      ${this.description ? html`<p>${this.description}</p>` : null}
    `;
  }
}

customElements.define("fudge-heading", FudgeHeading);
