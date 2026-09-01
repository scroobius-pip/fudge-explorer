import { transitionElement } from "../runtime/composition.ts";

export type FudgeButtonVariant =
  "primary" | "secondary" | "tertiary" | "ghost" | "danger";

const BUTTON_TYPES = new Set(["button", "submit", "reset"]);

function buttonType(value: string | null): "button" | "submit" | "reset" {
  return BUTTON_TYPES.has(value || "")
    ? (value as "button" | "submit" | "reset")
    : "button";
}

export class FudgeButton extends HTMLElement {
  static observedAttributes = ["variant", "size", "disabled", "type"];
  #button: HTMLButtonElement | null = null;

  connectedCallback() {
    this.dataset.composeKind = "action";
    this.dataset.state ||= "idle";
    this.#button = document.createElement("button");
    this.#button.className = "fudge-button";
    this.#button.dataset.variant = this.getAttribute("variant") || "primary";
    this.#button.dataset.size = this.getAttribute("size") || "md";
    this.#button.disabled = this.hasAttribute("disabled");
    while (this.firstChild) this.#button.append(this.firstChild);
    this.#button.type = buttonType(this.getAttribute("type"));
    this.#button.addEventListener("focus", this.#focus);
    this.#button.addEventListener("blur", this.#blur);
    this.#button.addEventListener("click", this.#click);
    this.append(this.#button);
  }

  disconnectedCallback() {
    this.#button?.removeEventListener("focus", this.#focus);
    this.#button?.removeEventListener("blur", this.#blur);
    this.#button?.removeEventListener("click", this.#click);
  }

  attributeChangedCallback(
    name: string,
    _oldValue: string | null,
    newValue: string | null,
  ) {
    if (!this.#button) return;
    if (name === "disabled") this.#button.disabled = newValue !== null;
    if (name === "type") this.#button.type = buttonType(newValue);
    if (name === "variant") {
      this.#button.dataset.variant = newValue || "primary";
    }
    if (name === "size") this.#button.dataset.size = newValue || "md";
  }

  #focus = () => transitionElement(this, "focused");
  #blur = () => transitionElement(this, "idle");
  #click = () => {
    if (!this.#button?.disabled) transitionElement(this, "success");
  };
}

customElements.define("fudge-button", FudgeButton);
