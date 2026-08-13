import { LitElement } from "lit";
import { store } from "../data/store.js";

export class FudgeElement extends LitElement {
  createRenderRoot() {
    return this;
  }

  connectedCallback() {
    super.connectedCallback();
    store.addEventListener("change", this.__onStoreChange);
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    store.removeEventListener("change", this.__onStoreChange);
  }

  __onStoreChange = () => this.requestUpdate();
}
