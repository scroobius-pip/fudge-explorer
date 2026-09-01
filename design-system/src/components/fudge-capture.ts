export class FudgeCapture extends HTMLElement {
  static observedAttributes = [
    "capture-id",
    "title",
    "domain",
    "src",
    "video",
    "aspect-ratio",
    "layout",
    "palette",
    "fonts",
  ];

  #media: HTMLElement | null = null;
  #video: HTMLVideoElement | null = null;

  connectedCallback() {
    this.dataset.composeKind = "card";
    if (!this.hasAttribute("layout")) this.setAttribute("layout", "media");
    this.#render();
    this.addEventListener("pointerenter", this.#preview);
    this.addEventListener("pointerleave", this.#stopPreview);
    this.addEventListener("click", this.#open);
  }

  disconnectedCallback() {
    this.removeEventListener("pointerenter", this.#preview);
    this.removeEventListener("pointerleave", this.#stopPreview);
    this.removeEventListener("click", this.#open);
  }

  attributeChangedCallback() {
    if (this.isConnected) this.#render();
  }

  #src() {
    return (
      this.getAttribute("src") ||
      (this.getAttribute("capture-id")
        ? `https://pin.fontofweb.com/${this.getAttribute("capture-id")}`
        : "")
    );
  }

  #render() {
    const title = this.getAttribute("title") || "Capture";
    const domain = this.getAttribute("domain") || "";
    const src = this.#src();
    const ratio = this.getAttribute("aspect-ratio") || "1.6";
    const layout = this.getAttribute("layout") || "media";
    const fonts = this.getAttribute("fonts") || "";
    const palette = (this.getAttribute("palette") || "")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean);
    const hasVideo = this.hasAttribute("video");

    const media = document.createElement("div");
    media.className = "fudge-capture-media";
    media.style.aspectRatio = ratio;

    const image = document.createElement("img");
    image.src = src;
    image.alt = domain ? `${title} from ${domain}` : title;
    media.append(image);

    if (hasVideo && src) {
      const video = document.createElement("video");
      video.muted = true;
      video.loop = true;
      video.playsInline = true;
      video.preload = "none";
      video.poster = src;
      video.src = `${src}.webm`;
      media.append(video);
      this.#video = video;
    } else {
      this.#video = null;
    }

    const body = document.createElement("div");
    body.className = "fudge-capture-body";
    const heading = document.createElement("div");
    heading.className = "fudge-capture-heading";
    const name = document.createElement("p");
    name.className = "fudge-capture-title";
    if (domain) {
      const favicon = document.createElement("img");
      favicon.alt = "";
      favicon.width = 16;
      favicon.height = 16;
      favicon.src = `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=32`;
      name.append(favicon, document.createTextNode(` ${title}`));
    } else {
      name.textContent = title;
    }
    const source = document.createElement("span");
    source.className = "fudge-capture-domain";
    source.textContent = domain;
    heading.append(name, source);
    body.append(heading);
    if (fonts) {
      const fontLine = document.createElement("p");
      fontLine.className = "fudge-capture-fonts";
      fontLine.textContent = fonts;
      body.append(fontLine);
    }
    if (palette.length) {
      const strip = document.createElement("div");
      strip.className = "fudge-capture-palette";
      strip.setAttribute("aria-label", "Screenshot palette");
      for (const color of palette) {
        const swatch = document.createElement("span");
        swatch.style.background = color;
        swatch.title = color;
        strip.append(swatch);
      }
      body.append(strip);
    }

    this.replaceChildren(media, body);
    this.dataset.layout = layout;
    this.#media = media;
    if (layout === "details") this.removeAttribute("tabindex");
    else this.tabIndex = 0;
  }

  #preview = () => {
    void this.#video?.play().catch(() => {});
  };

  #stopPreview = () => {
    if (!this.#video) return;
    this.#video.pause();
    this.#video.currentTime = 0;
  };

  #open = () => {
    if (this.getAttribute("layout") === "details") return;
    this.dispatchEvent(
      new CustomEvent("fudge-capture-open", {
        bubbles: true,
        detail: {
          captureId: this.getAttribute("capture-id"),
          title: this.getAttribute("title"),
          domain: this.getAttribute("domain"),
          src: this.#src(),
          video: this.hasAttribute("video"),
          aspectRatio: this.getAttribute("aspect-ratio"),
          palette: this.getAttribute("palette"),
          fonts: this.getAttribute("fonts"),
        },
      }),
    );
  };
}

customElements.define("fudge-capture", FudgeCapture);
