import { noChange } from "lit";
import { LightElement } from "./light-element.ts";
import {
  CompositionController,
  transitionElement,
} from "../runtime/composition.ts";

export type SubmitResult = "success" | "failure";
export type FudgeSubmitDetail = {
  data: FormData;
  complete(result: SubmitResult): void;
};

export class FudgeForm extends LightElement {
  static properties = {
    density: { type: String, reflect: true },
    sound: { type: String, reflect: true },
    haptics: { type: String, reflect: true },
  };

  density: "compact" | "comfortable" = "comfortable";
  sound: "on" | "off" = "on";
  haptics: "on" | "off" = "on";
  #controller: CompositionController | null = null;
  #form: HTMLFormElement | null = null;
  #submitting = false;

  override connectedCallback() {
    super.connectedCallback();
    this.dataset.composeKind = "form";
    this.dataset.state ||= "idle";
  }

  override disconnectedCallback() {
    this.#controller?.disconnect();
    this.#form?.removeEventListener("submit", this.#submit);
    super.disconnectedCallback();
  }

  protected override firstUpdated() {
    this.dataset.density = this.density;
    this.dataset.sound = this.sound;
    this.dataset.haptics = this.haptics;
    this.#form = this.querySelector("form");
    if (!this.#form) throw new Error("fudge-form requires a native form child");
    this.#form.addEventListener("submit", this.#submit);
    this.#controller = new CompositionController(this);
  }

  protected override render() {
    return noChange;
  }

  #submit = async (event: SubmitEvent) => {
    event.preventDefault();
    if (!this.#form || this.#submitting) return;
    if (!this.#form.checkValidity()) {
      transitionElement(this, "failure");
      return;
    }

    this.#submitting = true;
    this.#setActionDisabled(true);
    transitionElement(this, "submitting");
    const { promise, resolve } = Promise.withResolvers<SubmitResult>();
    const request = new CustomEvent<FudgeSubmitDetail>("fudge-submit", {
      bubbles: true,
      cancelable: true,
      detail: { data: new FormData(this.#form), complete: resolve },
    });
    this.dispatchEvent(request);
    if (!request.defaultPrevented) {
      this.#submitting = false;
      this.#setActionDisabled(false);
      transitionElement(this, "idle");
      return;
    }

    const result = await promise;
    this.#submitting = false;
    this.#setActionDisabled(false);
    transitionElement(this, result);
  };

  #setActionDisabled(disabled: boolean) {
    const action = this.querySelector<HTMLElement>("fudge-action");
    action?.toggleAttribute("disabled", disabled);
    action?.querySelector("button")?.toggleAttribute("disabled", disabled);
  }
}

customElements.define("fudge-form", FudgeForm);
