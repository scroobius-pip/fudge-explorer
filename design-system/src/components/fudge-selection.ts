import { transitionElement } from "../runtime/composition.ts";

class FudgeCheckbox extends HTMLElement {
  static observedAttributes = [
    "name",
    "label",
    "checked",
    "disabled",
    "required",
  ];
  #input: HTMLInputElement | null = null;

  connectedCallback() {
    this.dataset.composeKind = "control";
    this.dataset.state ||= "idle";
    const input = document.createElement("input");
    input.type = "checkbox";
    input.className = "fudge-selection-control";
    input.name = this.getAttribute("name") || "";
    input.checked = this.hasAttribute("checked");
    input.disabled = this.hasAttribute("disabled");
    input.required = this.hasAttribute("required");
    const label = document.createElement("label");
    label.className = "fudge-selection-label";
    const box = document.createElement("span");
    box.className = "fudge-selection-box";
    const text = this.getAttribute("label") || this.textContent?.trim() || "";
    label.append(input, box, document.createTextNode(text));
    this.replaceChildren(label);
    this.#input = input;
    input.addEventListener("change", this.#change);
    input.addEventListener("focus", () => transitionElement(this, "focused"));
    input.addEventListener("blur", () => transitionElement(this, "idle"));
  }

  disconnectedCallback() {
    this.#input?.removeEventListener("change", this.#change);
  }

  #change = () => transitionElement(this, "success");
}

class FudgeSwitch extends FudgeCheckbox {
  connectedCallback() {
    super.connectedCallback();
    this.dataset.composeKind = "control";
    this.querySelector("input")?.setAttribute("role", "switch");
  }
}

customElements.define("fudge-checkbox", FudgeCheckbox);
customElements.define("fudge-switch", FudgeSwitch);

export { FudgeCheckbox, FudgeSwitch };
