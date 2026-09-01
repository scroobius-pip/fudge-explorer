class FudgeAlert extends HTMLElement {
  static observedAttributes = ["variant"];

  connectedCallback() {
    this.dataset.composeKind = "message";
    this.dataset.variant = this.getAttribute("variant") || "neutral";
    this.setAttribute("role", "alert");
  }

  attributeChangedCallback(
    name: string,
    _oldValue: string | null,
    value: string | null,
  ) {
    if (name === "variant") this.dataset.variant = value || "neutral";
  }
}

class FudgeStatus extends HTMLElement {
  connectedCallback() {
    this.dataset.composeKind = "message";
    this.setAttribute("role", "status");
    this.setAttribute("aria-live", "polite");
  }
}

customElements.define("fudge-alert", FudgeAlert);
customElements.define("fudge-status", FudgeStatus);

export { FudgeAlert, FudgeStatus };
