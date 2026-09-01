import { transitionElement } from "../runtime/composition.ts";
import type { SubmitResult } from "./fudge-form.ts";

export type FudgeComposerSubmitDetail = {
  prompt: string;
  files: File[];
  data: FormData;
  complete(result: SubmitResult): void;
};

const CLIP_ICON = `<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8" d="M8 12.5 15.2 5.3a3.2 3.2 0 1 1 4.5 4.5l-8.4 8.4a4.5 4.5 0 0 1-6.4-6.4l8-8"/></svg>`;
const SEND_ICON = `<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8" d="M5 12h14M13 6l6 6-6 6"/></svg>`;

export class FudgeComposer extends HTMLElement {
  static observedAttributes = ["placeholder", "disabled"];
  #form: HTMLFormElement | null = null;
  #textarea: HTMLTextAreaElement | null = null;
  #send: HTMLButtonElement | null = null;
  #fileInput: HTMLInputElement | null = null;
  #filesEl: HTMLDivElement | null = null;
  #files: File[] = [];
  #submitting = false;

  get prompt() {
    return this.#textarea?.value.trim() ?? "";
  }

  setPrompt(value: string) {
    if (!this.#textarea) return;
    this.#textarea.value = value;
    this.#sync();
    this.#textarea.focus();
  }

  get files() {
    return [...this.#files];
  }

  connectedCallback() {
    if (this.#form) return;
    this.dataset.composeKind = "form";
    this.dataset.state ||= "idle";

    const form = document.createElement("form");
    form.className = "fudge-composer-form";
    form.noValidate = true;

    const filesEl = document.createElement("div");
    filesEl.className = "fudge-composer-files";
    filesEl.hidden = true;

    const grid = document.createElement("div");
    grid.className = "fudge-composer-grid";

    const attach = document.createElement("button");
    attach.type = "button";
    attach.className = "fudge-composer-icon";
    attach.setAttribute("aria-label", "Add an image");
    attach.innerHTML = CLIP_ICON;
    attach.addEventListener("click", () => this.#fileInput?.click());

    const textarea = document.createElement("textarea");
    textarea.className = "fudge-composer-input";
    textarea.name = "prompt";
    textarea.rows = 1;
    textarea.placeholder =
      this.getAttribute("placeholder") ||
      "Paste a website, drop a screenshot, or describe what you need";
    textarea.setAttribute("aria-label", "Message Fudge");
    textarea.addEventListener("input", this.#sync);
    textarea.addEventListener("focus", () => transitionElement(this, "focused"));
    textarea.addEventListener("blur", () =>
      transitionElement(this, this.#submitting ? "submitting" : "idle"),
    );
    textarea.addEventListener("keydown", this.#keydown);

    const send = document.createElement("button");
    send.type = "submit";
    send.className = "fudge-composer-icon fudge-composer-send";
    send.setAttribute("aria-label", "Send message");
    send.innerHTML = SEND_ICON;
    send.disabled = true;

    const fileInput = document.createElement("input");
    fileInput.type = "file";
    fileInput.accept = "image/jpeg,image/png";
    fileInput.multiple = true;
    fileInput.hidden = true;
    fileInput.addEventListener("change", this.#onFiles);

    grid.append(attach, textarea, send);
    form.append(filesEl, grid);
    form.addEventListener("submit", this.#submit);
    this.append(form, fileInput);

    this.#form = form;
    this.#textarea = textarea;
    this.#send = send;
    this.#fileInput = fileInput;
    this.#filesEl = filesEl;
    this.addEventListener("dragover", this.#dragOver);
    this.addEventListener("drop", this.#drop);
    this.#sync();
  }

  disconnectedCallback() {
    this.removeEventListener("dragover", this.#dragOver);
    this.removeEventListener("drop", this.#drop);
  }

  attributeChangedCallback(name: string, _old: string | null, value: string | null) {
    if (!this.#textarea || !this.#send) return;
    if (name === "placeholder" && value) this.#textarea.placeholder = value;
    if (name === "disabled") {
      const disabled = value !== null;
      this.#textarea.disabled = disabled;
      this.#send.disabled = disabled || !this.#canSend();
    }
  }

  #canSend() {
    return Boolean(this.prompt || this.#files.length);
  }

  #sync = () => {
    const textarea = this.#textarea;
    if (!textarea) return;
    textarea.style.height = "auto";
    textarea.style.height = `${Math.min(textarea.scrollHeight, 160)}px`;
    const expanded =
      this.#files.length > 0 ||
      textarea.value.includes("\n") ||
      textarea.value.trim().length > 32 ||
      textarea.scrollHeight > 44;
    this.toggleAttribute("data-expanded", expanded);
    if (this.#send) this.#send.disabled = this.hasAttribute("disabled") || !this.#canSend();
    if (this.#filesEl) {
      this.#filesEl.hidden = this.#files.length === 0;
    }
  };

  #keydown = (event: KeyboardEvent) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      this.#form?.requestSubmit();
    }
  };

  #dragOver = (event: DragEvent) => {
    event.preventDefault();
  };

  #drop = (event: DragEvent) => {
    event.preventDefault();
    const files = [...(event.dataTransfer?.files ?? [])].filter((file) =>
      /image\/(jpeg|png)/.test(file.type),
    );
    if (files.length) this.#addFiles(files);
  };

  #onFiles = () => {
    const files = [...(this.#fileInput?.files ?? [])];
    if (this.#fileInput) this.#fileInput.value = "";
    if (files.length) this.#addFiles(files);
  };

  #addFiles(files: File[]) {
    this.#files = [...this.#files, ...files].slice(0, 4);
    this.#renderFiles();
    this.#sync();
    transitionElement(this, "focused");
  }

  #renderFiles() {
    if (!this.#filesEl) return;
    this.#filesEl.replaceChildren();
    this.#files.forEach((file, index) => {
      const chip = document.createElement("button");
      chip.type = "button";
      chip.className = "fudge-composer-file";
      chip.textContent = file.name;
      chip.setAttribute("aria-label", `Remove ${file.name}`);
      chip.addEventListener("click", () => {
        this.#files.splice(index, 1);
        this.#renderFiles();
        this.#sync();
      });
      this.#filesEl?.append(chip);
    });
  }

  #submit = async (event: SubmitEvent) => {
    event.preventDefault();
    if (this.#submitting || !this.#canSend()) return;
    this.#submitting = true;
    this.dataset.state = "submitting";
    if (this.#send) this.#send.disabled = true;
    const data = new FormData();
    data.set("prompt", this.prompt);
    data.set("task", this.prompt);
    for (const file of this.#files) data.append("image", file);
    const { promise, resolve } = Promise.withResolvers<SubmitResult>();
    const request = new CustomEvent<FudgeComposerSubmitDetail>("fudge-submit", {
      bubbles: true,
      cancelable: true,
      detail: {
        prompt: this.prompt,
        files: [...this.#files],
        data,
        complete: resolve,
      },
    });
    this.dispatchEvent(request);
    if (!request.defaultPrevented) {
      this.#submitting = false;
      this.#sync();
      transitionElement(this, "idle");
      return;
    }
    const result = await promise;
    this.#submitting = false;
    this.#sync();
    transitionElement(this, result);
  };
}

customElements.define("fudge-composer", FudgeComposer);
