import { noChange, LitElement } from "lit";
export abstract class LightElement extends LitElement {
  protected override createRenderRoot(): HTMLElement {
    return this;
  }

  protected override render(): unknown {
    return noChange;
  }
}
