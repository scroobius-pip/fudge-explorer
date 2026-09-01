class FudgeFieldset extends HTMLElement {
  static observedAttributes = ["legend", "disabled"];

  connectedCallback() {
    this.dataset.composeKind = "group";
    const fieldset = document.createElement("fieldset");
    fieldset.className = "fudge-fieldset-control";
    fieldset.disabled = this.hasAttribute("disabled");
    const legendText = this.getAttribute("legend");
    if (legendText) {
      const legend = document.createElement("legend");
      legend.textContent = legendText;
      fieldset.append(legend);
    }
    while (this.firstChild) fieldset.append(this.firstChild);
    this.append(fieldset);
  }
}

class FudgeSeparator extends HTMLElement {
  connectedCallback() {
    this.dataset.composeKind = "group";
    this.setAttribute("role", "separator");
  }
}

customElements.define("fudge-fieldset", FudgeFieldset);
customElements.define("fudge-separator", FudgeSeparator);

export { FudgeFieldset, FudgeSeparator };
