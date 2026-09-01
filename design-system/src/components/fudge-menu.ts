import { transitionElement } from "../runtime/composition.ts";

class FudgeMenu extends HTMLElement {
  static observedAttributes = ["open"];
  #panel: HTMLDivElement | null = null;

  connectedCallback() {
    this.dataset.composeKind = "menu";
    this.dataset.state = this.hasAttribute("open") ? "focused" : "idle";
    this.#panel = document.createElement("div");
    this.#panel.className = "fudge-menu-panel";
    for (const item of [...this.children]) {
      if (item.localName === "fudge-menu-item") this.#panel.append(item);
    }
    this.append(this.#panel);
    this.#sync();
    this.addEventListener("click", this.#click);
  }

  disconnectedCallback() {
    this.removeEventListener("click", this.#click);
  }

  attributeChangedCallback() {
    this.#sync();
  }

  #sync() {
    if (!this.#panel) return;
    this.#panel.hidden = !this.hasAttribute("open");
  }

  #click = (event: Event) => {
    const trigger = (event.target as HTMLElement).closest("fudge-menu-trigger");
    if (!trigger || !this.contains(trigger)) return;
    const open = !this.hasAttribute("open");
    this.toggleAttribute("open", open);
    transitionElement(this, open ? "focused" : "idle");
  };
}

class FudgeMenuTrigger extends HTMLElement {
  #button: HTMLButtonElement | null = null;

  connectedCallback() {
    this.dataset.composeKind = "action";
    this.#button = document.createElement("button");
    this.#button.type = "button";
    this.#button.className = "fudge-menu-trigger";
    while (this.firstChild) this.#button.append(this.firstChild);
    this.append(this.#button);
  }
}

class FudgeMenuItem extends HTMLElement {
  #button: HTMLButtonElement | null = null;

  connectedCallback() {
    this.dataset.composeKind = "item";
    this.#button = document.createElement("button");
    this.#button.type = "button";
    this.#button.className = "fudge-menu-item";
    while (this.firstChild) this.#button.append(this.firstChild);
    this.append(this.#button);
    this.#button.addEventListener("focus", () =>
      transitionElement(this, "focused"),
    );
    this.#button.addEventListener("blur", () =>
      transitionElement(this, "idle"),
    );
  }
}

customElements.define("fudge-menu", FudgeMenu);
customElements.define("fudge-menu-trigger", FudgeMenuTrigger);
customElements.define("fudge-menu-item", FudgeMenuItem);

export { FudgeMenu, FudgeMenuTrigger, FudgeMenuItem };
