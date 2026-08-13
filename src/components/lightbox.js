import { LitElement, html } from "lit";
import { store } from "../data/store.js";
import { fmtDate, esc } from "../data/util.js";

export class LightboxElement extends LitElement {
  createRenderRoot() {
    return this;
  }

  constructor() {
    super();
    this.ids = [];
    this.index = 0;
    this.openState = false;
    this.morph = false;
  }

  get open() {
    return this.openState;
  }

  connectedCallback() {
    super.connectedCallback();
    this.__keydown = (e) => {
      if (!this.openState) return;
      if (e.key === "Escape") {
        e.stopPropagation();
        this.close();
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        this.nav(-1);
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        this.nav(1);
      }
    };
    document.addEventListener("keydown", this.__keydown);
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    document.removeEventListener("keydown", this.__keydown);
  }

  get __stage() {
    return this.querySelector(".lb-stage");
  }
  get __img() {
    return this.querySelector(".lb-img");
  }
  get __vid() {
    return this.querySelector(".lb-video");
  }
  get __title() {
    return this.querySelector(".lb-title");
  }
  get __sub() {
    return this.querySelector(".lb-sub");
  }
  get __count() {
    return this.querySelector(".lb-count");
  }

  collect(el) {
    const root = el.closest(".col") || document;
    this.ids = [...new Set([...root.querySelectorAll("[data-capture]")].map((node) => String(node.dataset.capture)))];
  }

  finalRect(id, arOverride) {
    const m = store.idx.motionByCap.get(Number(id));
    const ar = arOverride || (m ? Math.max(0.3, m[5] / m[6]) : 1.6);
    const maxW = Math.min(innerWidth * 0.9, 1280);
    const maxH = innerHeight * 0.82;
    let w = maxW;
    let h = w / ar;
    if (h > maxH) {
      h = maxH;
      w = h * ar;
    }
    return { x: (innerWidth - w) / 2, y: (innerHeight - h) / 2, w, h };
  }

  applyRect(r) {
    const s = this.__stage.style;
    s.left = r.x + "px";
    s.top = r.y + "px";
    s.width = r.w + "px";
    s.height = r.h + "px";
  }

  load(id) {
    const cp = store.idx.cById.get(Number(id));
    const m = store.idx.motionByCap.get(Number(id));
    const img = this.__img;
    const vid = this.__vid;
    img.classList.remove("on");
    img.removeAttribute("src");
    vid.classList.remove("on");
    vid.pause();
    vid.removeAttribute("src");
    vid.load();
    if (m) {
      vid.poster = cp ? cp[5] : "";
      vid.src = m[1];
      img.src = cp ? cp[5] : "";
      vid.onloadedmetadata = () => {
        if (vid.classList.contains("on") && vid.videoWidth && vid.videoHeight) {
          this.applyRect(this.finalRect(id, vid.videoWidth / vid.videoHeight));
        }
      };
      vid.classList.add("on");
      vid.play().catch(() => {});
    } else {
      img.onload = () => {
        if (!img.classList.contains("on")) return;
        const ar = img.naturalWidth && img.naturalHeight ? img.naturalWidth / img.naturalHeight : 1.6;
        this.applyRect(this.finalRect(id, ar));
      };
      img.src = cp ? cp[5] : "";
      img.classList.add("on");
    }
    this.__title.textContent = cp ? cp[3] : "capture " + id;
    this.__sub.textContent = cp ? cp[1].replace("https://", "") + (cp[2] && cp[2] !== "/" ? " · " + cp[2] : "") + " · " + fmtDate(cp[4]) : "";
    this.__count.textContent = (this.index + 1) + " / " + this.ids.length;
  }

  openTrigger(el, id) {
    if (!store.idx.cById.has(Number(id))) return;
    this.collect(el);
    this.index = this.ids.indexOf(String(id));
    if (this.index < 0) {
      this.ids.unshift(String(id));
      this.index = 0;
    }
    this.openState = true;
    this.morph = true;
    this.requestUpdate();
    const r = el.getBoundingClientRect();
    const f = this.finalRect(id);
    const s = this.__stage;
    s.style.transition = "none";
    this.applyRect(f);
    const dx = r.left - f.x + (r.width - f.w) / 2;
    const dy = r.top - f.y + (r.height - f.h) / 2;
    const sx = r.width / f.w;
    const sy = r.height / f.h;
    s.style.transform = "translate(" + dx + "px," + dy + "px) scale(" + sx + "," + sy + ")";
    s.style.opacity = "0";
    s.offsetWidth;
    s.style.transition = "";
    s.style.transform = "none";
    s.style.opacity = "1";
    setTimeout(() => {
      this.morph = false;
      this.requestUpdate();
    }, 360);
    this.load(id);
  }

  nav(d) {
    if (!this.ids.length) return;
    this.index = (this.index + d + this.ids.length) % this.ids.length;
    const id = this.ids[this.index];
    const s = this.__stage;
    s.style.opacity = "0";
    setTimeout(() => {
      this.applyRect(this.finalRect(id));
      this.load(id);
      s.style.opacity = "1";
    }, 170);
  }

  close() {
    if (!this.openState) return;
    this.openState = false;
    const s = this.__stage;
    s.style.opacity = "0";
    setTimeout(() => {
      if (!this.openState) this.requestUpdate();
    }, 200);
    this.__vid.pause();
  }

  render() {
    return html`
      <div id="lb" class="${this.openState ? "on" : ""}${this.morph ? " lb-morph" : ""}">
        <div class="lb-backdrop" @click=${() => this.close()}></div>
        <span class="lb-count"></span>
        <button class="lb-close" aria-label="Close" @click=${() => this.close()}>✕</button>
        <button class="lb-nav lb-prev" aria-label="Previous" @click=${() => this.nav(-1)}>‹</button>
        <button class="lb-nav lb-next" aria-label="Next" @click=${() => this.nav(1)}>›</button>
        <div class="lb-stage">
          <img class="lb-media lb-img" alt="">
          <video class="lb-media lb-video" controls playsinline preload="metadata" muted loop></video>
        </div>
        <div class="lb-cap"><span class="lb-title"></span><span class="lb-sub"></span></div>
      </div>`;
  }
}
customElements.define("explorer-lightbox", LightboxElement);
