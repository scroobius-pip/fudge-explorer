import { html, nothing } from "lit";
import { render } from "lit";
import { FudgeElement } from "./base.js";
import { store } from "../data/store.js";
import { TYPE } from "../data/indexes.js";
import "./favicon.js";

export class ExplorerColumnElement extends FudgeElement {
  static properties = {
    column: { attribute: false },
    index: { type: Number },
    generation: { type: Number },
  };

  constructor() {
    super();
    this.column = null;
    this.index = 0;
    this.generation = 0;
    this.__more = new Map();
    this.__moreSeq = 0;
    this.__body = nothing;
    this.__n = null;
    this.__loading = false;
    this.__error = null;
    this.__resolveSeq = 0;
  }

  get ctx() {
    return {
      store,
      idx: store.idx,
      D: store.data,
      rows: (list, fn, limit) => this.rowsList(list, fn, limit),
      raw: (obj) => store.raw(obj),
      view: this.column,
    };
  }

  rowsList(list, fn, limit) {
    const cut = limit ? list.slice(0, limit) : list;
    let more = nothing;
    if (limit && list.length > limit) {
      const id = ++this.__moreSeq;
      this.__more.set(id, { list, fn, limit, next: limit });
      more = html`<button class="more" data-more-id=${id}>+ ${list.length - limit} more</button>`;
    }
    return html`${cut.map(fn)}${more}`;
  }

  loadMore(id) {
    const state = this.__more.get(id);
    const button = this.querySelector(`[data-more-id="${id}"]`);
    if (!state || !button) return;
    const start = state.next;
    const end = Math.min(start + state.limit, state.list.length);
    const holder = document.createElement("div");
    holder.className = "more-rows";
    button.before(holder);
    render(html`${state.list.slice(start, end).map((value, index) => state.fn(value, start + index))}`, holder);
    state.next = end;
    const remaining = state.list.length - end;
    if (remaining) button.textContent = "+ " + remaining + " more";
    else {
      this.__more.delete(id);
      button.remove();
    }
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this.__more.clear();
  }

  resolve() {
    const seq = ++this.__resolveSeq;
    this.__loading = false;
    this.__error = null;
    if (!store.data) {
      this.__loading = true;
      this.__body = nothing;
      this.__n = null;
      this.__label = null;
      this.requestUpdate();
      return;
    }
    const view = store.VIEWS[this.column.type];
    if (!view) {
      this.__body = html`<div class="empty">unknown column</div>`;
      this.__n = null;
      this.requestUpdate();
      return;
    }
    let result;
    try {
      result = view(this.column, this.ctx);
    } catch (error) {
      this.__error = String(error);
      this.__body = nothing;
      this.__n = null;
      this.requestUpdate();
      return;
    }
    if (result && typeof result.then === "function") {
      this.__loading = true;
      this.__body = nothing;
      this.__n = null;
      this.requestUpdate();
      result.then((resolved) => {
        if (seq !== this.__resolveSeq) return;
        this.__loading = false;
        this.__body = resolved?.body ?? resolved;
        this.__n = resolved?.n ?? null;
        this.__label = resolved?.label ?? null;
        this.requestUpdate();
      }, (error) => {
        if (seq !== this.__resolveSeq) return;
        this.__loading = false;
        this.__error = String(error);
        this.__body = nothing;
        this.requestUpdate();
      });
    } else {
      this.__body = result?.body ?? result;
      this.__n = result?.n ?? null;
      this.__label = result?.label ?? null;
      this.requestUpdate();
    }
  }

  updated(changed) {
    if (changed.has("column") || (changed.has("generation") && this.column)) {
      this.__more = new Map();
      this.__moreSeq = 0;
      this.resolve();
    }
  }

  __retract() {
    store.retractTo(this.index - 1);
  }

  __close(e) {
    e.stopPropagation();
    store.closeCol(this.index);
  }

  render() {
    const c = this.column;
    if (!c) return nothing;
    const t = TYPE[c.type] || TYPE.browse;
    const lead = c.type === "domain"
      ? html`<fudge-favicon .origin=${c.id}></fudge-favicon>`
      : html`<span class="dot" style=${`background:${t.color}`}></span>`;
    return html`
      <div class="chead" @click=${() => this.__retract()}>
        ${lead}
        <span class="t">${this.__label ?? c.label}</span>
        ${this.__n ? html`<span class="n">${this.__n}</span>` : nothing}
        ${c.type !== "home" ? html`<span class="x" @click=${(e) => this.__close(e)}>✕</span>` : nothing}
      </div>
      <div class="cbody">
        ${this.__loading ? html`<div class="empty">loading…</div>`
        : this.__error ? html`<div class="empty">${this.__error}</div>`
        : this.__body}
      </div>`;
  }
}
customElements.define("explorer-column", ExplorerColumnElement);
