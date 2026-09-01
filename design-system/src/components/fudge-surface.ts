class FudgeSurface extends HTMLElement {
  static observedAttributes = ["variant"];

  connectedCallback() {
    this.dataset.composeKind = "surface";
    this.dataset.variant = this.getAttribute("variant") || "default";
  }

  attributeChangedCallback(
    name: string,
    _oldValue: string | null,
    value: string | null,
  ) {
    if (name === "variant") this.dataset.variant = value || "default";
  }
}

class FudgeCard extends HTMLElement {
  static observedAttributes = ["variant"];

  connectedCallback() {
    this.dataset.composeKind = "card";
    this.dataset.variant = this.getAttribute("variant") || "default";
  }

  attributeChangedCallback(
    name: string,
    _oldValue: string | null,
    value: string | null,
  ) {
    if (name === "variant") this.dataset.variant = value || "default";
  }
}

class FudgeCardHeader extends HTMLElement {
  connectedCallback() {
    this.dataset.composeKind = "group";
  }
}

class FudgeCardTitle extends HTMLElement {
  connectedCallback() {
    this.dataset.composeKind = "heading";
  }
}

class FudgeCardDescription extends HTMLElement {
  connectedCallback() {
    this.dataset.composeKind = "message";
  }
}

class FudgeCardContent extends HTMLElement {
  connectedCallback() {
    this.dataset.composeKind = "group";
  }
}

class FudgeCardFooter extends HTMLElement {
  connectedCallback() {
    this.dataset.composeKind = "group";
  }
}

customElements.define("fudge-surface", FudgeSurface);
customElements.define("fudge-card", FudgeCard);
customElements.define("fudge-card-header", FudgeCardHeader);
customElements.define("fudge-card-title", FudgeCardTitle);
customElements.define("fudge-card-description", FudgeCardDescription);
customElements.define("fudge-card-content", FudgeCardContent);
customElements.define("fudge-card-footer", FudgeCardFooter);

export {
  FudgeSurface,
  FudgeCard,
  FudgeCardHeader,
  FudgeCardTitle,
  FudgeCardDescription,
  FudgeCardContent,
  FudgeCardFooter,
};
