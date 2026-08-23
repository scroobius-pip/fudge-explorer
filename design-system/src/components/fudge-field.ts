import { html } from "lit";
import { LightElement } from "./light-element.ts";
import { transitionElement } from "../runtime/composition.ts";

export class FudgeField extends LightElement {
  static properties = {
    name: { type: String },
    label: { type: String },
    type: { type: String },
    autocomplete: { type: String },
    required: { type: Boolean, reflect: true },
  };

  name = "";
  label = "";
  type = "text";
  autocomplete = "";
  required = false;
  #message = "";

  override connectedCallback() {
    super.connectedCallback();
    this.dataset.composeKind = "field";
    this.dataset.state ||= "idle";
  }

  protected override render() {
    const messageId = `${this.name || "field"}-message`;
    return html`
      <label class="fudge-field-label" for=${this.name}>
        <span>${this.label}</span>
      </label>
      <input
        id=${this.name}
        data-compose-kind="control"
        name=${this.name}
        type=${this.type}
        autocomplete=${this.autocomplete}
        ?required=${this.required}
        aria-describedby=${messageId}
        aria-invalid=${this.dataset.state === "invalid" ? "true" : "false"}
        @focus=${this.#focus}
        @blur=${this.#blur}
        @input=${this.#input}
        @invalid=${this.#invalid}
      />
      <small
        id=${messageId}
        data-compose-kind="message"
        class="fudge-field-message"
        aria-live="polite"
      >${this.#message}</small>
    `;
  }

  #focus = () => transitionElement(this, "focused");

  #blur = (event: FocusEvent) => {
    const input = event.currentTarget as HTMLInputElement;
    if (input.validity.valid) transitionElement(this, "idle");
    else this.#setInvalid(input.validationMessage);
  };

  #input = (event: InputEvent) => {
    const input = event.currentTarget as HTMLInputElement;
    if (input.validity.valid) {
      this.#message = "";
      transitionElement(this, document.activeElement === input ? "focused" : "idle");
      this.requestUpdate();
    }
  };

  #invalid = (event: Event) => {
    const input = event.currentTarget as HTMLInputElement;
    this.#setInvalid(input.validationMessage);
  };

  #setInvalid(message: string) {
    this.#message = message;
    transitionElement(this, "invalid");
    this.requestUpdate();
  }
}

customElements.define("fudge-field", FudgeField);
