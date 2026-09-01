import { transitionElement } from "../runtime/composition.ts";

export class FudgeTextarea extends HTMLElement {
  static observedAttributes = [
    "name",
    "label",
    "placeholder",
    "rows",
    "required",
  ];
  #textarea: HTMLTextAreaElement | null = null;

  connectedCallback() {
    this.dataset.composeKind = "field";
    this.dataset.state ||= "idle";
    const content = [...this.childNodes];
    const label = this.getAttribute("label") || "";
    const name = this.getAttribute("name") || "textarea";
    const textarea = document.createElement("textarea");
    textarea.className = "fudge-textarea-control";
    textarea.name = name;
    textarea.placeholder = this.getAttribute("placeholder") || "";
    textarea.rows = Number(this.getAttribute("rows") || 4);
    textarea.required = this.hasAttribute("required");
    if (label) {
      const labelElement = document.createElement("label");
      labelElement.className = "fudge-field-label";
      labelElement.textContent = label;
      this.append(labelElement);
    }
    for (const child of content) textarea.append(child);
    this.append(textarea);
    this.#textarea = textarea;
    textarea.addEventListener("focus", () =>
      transitionElement(this, "focused"),
    );
    textarea.addEventListener("blur", () =>
      transitionElement(this, textarea.validity.valid ? "idle" : "invalid"),
    );
  }
}

customElements.define("fudge-textarea", FudgeTextarea);
