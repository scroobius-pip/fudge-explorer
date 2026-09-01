import { transitionElement } from "../runtime/composition.ts";

class FudgePopover extends HTMLElement {
  static observedAttributes = ["open"];
  #content: HTMLElement | null = null;

  connectedCallback() {
    this.dataset.composeKind = "surface";
    this.dataset.state = this.hasAttribute("open") ? "focused" : "idle";
    this.#content = this.querySelector("fudge-popover-content");
    this.#sync();
    this.addEventListener("click", this.#click);
    this.addEventListener("keydown", this.#keydown);
  }

  disconnectedCallback() {
    this.removeEventListener("click", this.#click);
    this.removeEventListener("keydown", this.#keydown);
  }

  attributeChangedCallback() {
    this.#sync();
  }

  #sync() {
    if (!this.#content) return;
    this.#content.hidden = !this.hasAttribute("open");
  }

  #click = (event: Event) => {
    const trigger = (event.target as HTMLElement).closest(
      "fudge-popover-trigger",
    );
    if (!trigger) return;
    const open = !this.hasAttribute("open");
    this.toggleAttribute("open", open);
    transitionElement(this, open ? "focused" : "idle");
  };

  #keydown = (event: KeyboardEvent) => {
    if (event.key !== "Escape") return;
    this.removeAttribute("open");
    transitionElement(this, "idle");
  };
}

class FudgePopoverTrigger extends HTMLElement {
  connectedCallback() {
    this.dataset.composeKind = "action";
  }
}

class FudgePopoverContent extends HTMLElement {
  connectedCallback() {
    this.dataset.composeKind = "surface";
  }
}

class FudgeTooltip extends HTMLElement {
  #content: HTMLElement | null = null;

  connectedCallback() {
    this.dataset.composeKind = "surface";
    this.#content = this.querySelector("fudge-tooltip-content");
    this.#content?.setAttribute("role", "tooltip");
    this.#content?.setAttribute("hidden", "");
    this.addEventListener("pointerenter", this.#show);
    this.addEventListener("pointerleave", this.#hide);
    this.addEventListener("focusin", this.#show);
    this.addEventListener("focusout", this.#hide);
  }

  disconnectedCallback() {
    this.removeEventListener("pointerenter", this.#show);
    this.removeEventListener("pointerleave", this.#hide);
    this.removeEventListener("focusin", this.#show);
    this.removeEventListener("focusout", this.#hide);
  }

  #show = () => {
    if (this.#content) this.#content.hidden = false;
  };

  #hide = () => {
    if (this.#content) this.#content.hidden = true;
  };
}

class FudgeTooltipContent extends HTMLElement {
  connectedCallback() {
    this.dataset.composeKind = "message";
  }
}

customElements.define("fudge-popover", FudgePopover);
customElements.define("fudge-popover-trigger", FudgePopoverTrigger);
customElements.define("fudge-popover-content", FudgePopoverContent);
customElements.define("fudge-tooltip", FudgeTooltip);
customElements.define("fudge-tooltip-content", FudgeTooltipContent);

export {
  FudgePopover,
  FudgePopoverTrigger,
  FudgePopoverContent,
  FudgeTooltip,
  FudgeTooltipContent,
};
