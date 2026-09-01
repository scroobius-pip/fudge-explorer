import { transitionElement } from "../runtime/composition.ts";

export class FudgeDialog extends HTMLElement {
  static observedAttributes = ["open"];

  connectedCallback() {
    this.dataset.composeKind = "surface";
    this.dataset.state = this.hasAttribute("open") ? "focused" : "idle";
    this.setAttribute("role", "dialog");
    this.setAttribute("aria-modal", "true");
    this.addEventListener("click", this.#click);
    this.addEventListener("keydown", this.#keydown);
    this.#sync();
  }

  disconnectedCallback() {
    this.removeEventListener("click", this.#click);
    this.removeEventListener("keydown", this.#keydown);
  }

  attributeChangedCallback() {
    this.#sync();
  }

  #sync() {
    this.hidden = !this.hasAttribute("open");
    this.dataset.state = this.hasAttribute("open") ? "focused" : "idle";
  }

  #click = (event: Event) => {
    if (event.target === this) this.close();
  };

  #keydown = (event: KeyboardEvent) => {
    if (event.key === "Escape") {
      event.preventDefault();
      this.close();
    }
  };

  open() {
    this.setAttribute("open", "");
    transitionElement(this, "focused");
  }

  close() {
    this.removeAttribute("open");
    transitionElement(this, "idle");
    this.dispatchEvent(new Event("fudge-dialog-close", { bubbles: true }));
  }
}

customElements.define("fudge-dialog", FudgeDialog);
