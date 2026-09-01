import type { FudgeComposer, FudgeComposerSubmitDetail } from "./components/fudge-composer.ts";
import type { FudgeDialog } from "./components/fudge-dialog.ts";

export const ROUTES = {
  home: "./index.html",
  explorer: "./explorer.html",
  chat: "./chat.html",
  pricing: "./pricing.html",
  mcp: "./mcp.html",
} as const;

const PROMPT_KEY = "fudge.prompt";
const PLAN_KEY = "fudge.plan";
const PERIOD_KEY = "fudge.period";
const CAPTURE_KEY = "fudge.capture";

export const PRICES = {
  quarterly: {
    pro: {
      charge: "$117",
      note: "$117 billed every 3 months · $39/month equivalent.",
    },
    studio: {
      charge: "$297",
      note: "$297 billed every 3 months · $99/month equivalent.",
    },
  },
  yearly: {
    pro: {
      charge: "$390",
      note: "$390 billed yearly · $32.50/month equivalent.",
    },
    studio: {
      charge: "$990",
      note: "$990 billed yearly · $82.50/month equivalent.",
    },
  },
} as const;

export type Period = keyof typeof PRICES;
export type Plan = "pro" | "studio";

export type CaptureRecord = {
  id: string;
  title: string;
  domain: string;
  aspect: string;
  video?: boolean;
  fonts?: string;
  palette?: string;
};

export const FIELD_CAPTURES: CaptureRecord[] = [
  { id: "3626", title: "Lando Norris", domain: "landonorris.com", aspect: "1.7", video: true },
  { id: "6143", title: "Overview | Claude", domain: "claude.com", aspect: "1.73", video: true },
  { id: "5530", title: "Midlife Engineering", domain: "midlife.engineering", aspect: "1.28", video: true },
  { id: "9798", title: "Besimple AI", domain: "besimple.ai", aspect: "1.3", video: true },
  { id: "9716", title: "Square", domain: "squareup.com", aspect: "1.72", video: true },
  { id: "10041", title: "Stripe", domain: "stripe.com", aspect: "1.72", video: true },
  {
    id: "8776",
    title: "Design That’s Crazy Good",
    domain: "crazycreative.design",
    aspect: "1.55",
    fonts: "Bricolage Grotesque · 96 pt · Regular",
    palette: "#131313,#e7f850,#85fdfe,#72c1fe,#6d6e6f,#a595f8,#fe66c7,#f0b9d9",
  },
  { id: "4647", title: "Fudge Explorer", domain: "fontofweb.com", aspect: "1.7" },
];

export function chatHref(prompt = "", captureId = "") {
  const url = new URL(ROUTES.chat, location.href);
  if (prompt) url.searchParams.set("q", prompt);
  if (captureId) url.searchParams.set("capture", captureId);
  return `${url.pathname}${url.search}`;
}

export function explorerHref(query = "") {
  const url = new URL(ROUTES.explorer, location.href);
  if (query) url.searchParams.set("q", query);
  return `${url.pathname}${url.search}`;
}

export function pricingHref(plan?: Plan, period?: Period) {
  const url = new URL(ROUTES.pricing, location.href);
  if (plan) url.searchParams.set("plan", plan);
  if (period) url.searchParams.set("period", period);
  return `${url.pathname}${url.search}`;
}

export function rememberPrompt(prompt: string) {
  sessionStorage.setItem(PROMPT_KEY, prompt);
}

export function takePrompt() {
  const fromQuery = new URLSearchParams(location.search).get("q");
  if (fromQuery) {
    sessionStorage.setItem(PROMPT_KEY, fromQuery);
    return fromQuery;
  }
  return sessionStorage.getItem(PROMPT_KEY) || "";
}

export function rememberCapture(id: string) {
  sessionStorage.setItem(CAPTURE_KEY, id);
}

export function takeCapture() {
  const fromQuery = new URLSearchParams(location.search).get("capture");
  if (fromQuery) {
    sessionStorage.setItem(CAPTURE_KEY, fromQuery);
    return fromQuery;
  }
  return sessionStorage.getItem(CAPTURE_KEY) || "";
}

export function rememberPlan(plan: Plan, period: Period) {
  sessionStorage.setItem(PLAN_KEY, plan);
  sessionStorage.setItem(PERIOD_KEY, period);
}

export function takePlan() {
  const params = new URLSearchParams(location.search);
  const plan = (params.get("plan") || sessionStorage.getItem(PLAN_KEY)) as Plan | null;
  const period = (params.get("period") || sessionStorage.getItem(PERIOD_KEY)) as Period | null;
  if (plan) sessionStorage.setItem(PLAN_KEY, plan);
  if (period) sessionStorage.setItem(PERIOD_KEY, period);
  return {
    plan: plan === "studio" ? "studio" : plan === "pro" ? "pro" : null,
    period: period === "yearly" ? "yearly" : "quarterly",
  };
}

export function captureById(id: string) {
  return FIELD_CAPTURES.find((capture) => capture.id === id);
}

const MARK = `<svg viewBox="49.354 164.332 293.006 328.011" aria-hidden="true"><path d="M314.788 336.851 L201.515 336.851 Q190.515 336.851 190.515 347.851 L190.515 464.771 Q190.515 474.771 180.515 474.771 L76.926 474.771 Q66.926 474.771 69.241 465.043 L88.417 384.453 Q90.732 374.725 99.212 369.425 L146.983 339.569 Q156.311 333.739 146.555 328.657 L113.001 311.179 Q104.132 306.559 99.636 297.627 L77.371 253.4 Q72.875 244.468 71.928 234.513 L67.879 191.955 Q66.932 182 76.932 182 L180.515 182 Q190.515 182 190.593 192 L191.153 263.294 Q191.239 274.294 196.721 264.758 L221.979 220.824 Q226.963 212.155 236.159 208.227 L283.997 187.793 Q293.193 183.865 303.174 183.246 L314.807 182.523 Q324.788 181.904 324.788 191.904 L324.788 326.851 Q324.788 336.851 314.788 336.851 Z"/></svg>`;

export function bindChrome(root: ParentNode = document) {
  root.querySelectorAll<HTMLElement>("[data-chrome='header']").forEach((node) => {
    const current = node.dataset.current || "";
    const here = (name: string) => (current === name ? ' aria-current="page"' : "");
    const header = document.createElement("header");
    header.className = "site-header";
    header.innerHTML = `
      <div class="site-header-inner">
        <a class="site-wordmark" data-home-link href="./index.html" aria-label="Fudge home">${MARK}</a>
        <nav class="site-nav" aria-label="Product">
          <a href="./index.html#how-it-works">How it works</a>
          <a data-explorer-link href="./explorer.html"${here("explorer")}>Explorer</a>
          <a data-pricing-link href="./pricing.html"${here("pricing")}>Pricing</a>
        </nav>
        <fudge-button variant="primary" data-chat-link>Open Fudge</fudge-button>
      </div>`;
    node.replaceWith(header);
  });
  root.querySelectorAll<HTMLElement>("[data-chrome='footer']").forEach((node) => {
    const footer = document.createElement("footer");
    footer.className = "site-footer";
    footer.innerHTML = `
      <div class="site-footer-inner">
        <div class="site-footer-col"><strong>Fudge</strong><p>Visual reference research and design work.</p></div>
        <div class="site-footer-col"><strong>Product</strong>
          <a data-explorer-link href="./explorer.html">Explorer</a>
          <a data-chat-link href="./chat.html">Chat</a>
          <a data-pricing-link href="./pricing.html">Pricing</a>
        </div>
        <div class="site-footer-col"><strong>Resources</strong>
          <a href="./index.html#how-it-works">How it works</a>
          <a data-explorer-link href="./explorer.html">Examples</a>
          <a href="./index.html#faq">Help</a>
          <a href="./index.html#faq">Privacy</a>
        </div>
        <div class="site-footer-col"><strong>Account</strong>
          <a data-chat-link href="./chat.html">Sign in</a>
          <a data-pricing-link href="./pricing.html">Billing</a>
          <a data-mcp-link href="./mcp.html">Connected tools</a>
        </div>
      </div>`;
    node.replaceWith(footer);
  });
}

export function bindSite(root: ParentNode = document) {
  bindChrome(root);
  const assign = (selector: string, href: string) => {
    root.querySelectorAll<HTMLElement>(selector).forEach((node) => {
      if (node instanceof HTMLAnchorElement) node.href = href;
      else node.dataset.href = href;
    });
  };
  assign("[data-home-link]", ROUTES.home);
  assign("[data-explorer-link]", ROUTES.explorer);
  assign("[data-chat-link]", ROUTES.chat);
  assign("[data-pricing-link]", ROUTES.pricing);
  assign("[data-mcp-link]", ROUTES.mcp);

  root.addEventListener("click", (event) => {
    const host = (event.target as HTMLElement).closest("[data-href]");
    if (!(host instanceof HTMLElement) || !host.dataset.href) return;
    if (host instanceof HTMLAnchorElement) return;
    event.preventDefault();
    location.assign(host.dataset.href);
  });

  bindCaptureDialog(root);
}

export function bindComposerToChat(composer: FudgeComposer | null) {
  composer?.addEventListener("fudge-submit", (rawEvent) => {
    const event = rawEvent as CustomEvent<FudgeComposerSubmitDetail>;
    event.preventDefault();
    rememberPrompt(event.detail.prompt);
    event.detail.complete("success");
    location.assign(chatHref(event.detail.prompt, takeCapture()));
  });
}

export function bindPeriodControls(root: ParentNode, initial: Period = "quarterly") {
  const buttons = [...root.querySelectorAll<HTMLElement>("[data-period]")];
  const apply = (period: Period) => {
    const prices = PRICES[period];
    root.querySelectorAll<HTMLElement>("[data-price='pro']").forEach((node) => {
      node.textContent = prices.pro.charge;
    });
    root.querySelectorAll<HTMLElement>("[data-price='studio']").forEach((node) => {
      node.textContent = prices.studio.charge;
    });
    root.querySelectorAll<HTMLElement>("[data-period-label='pro']").forEach((node) => {
      node.textContent = prices.pro.note;
    });
    root.querySelectorAll<HTMLElement>("[data-period-label='studio']").forEach((node) => {
      node.textContent = prices.studio.note;
    });
    buttons.forEach((button) => {
      const selected = button.dataset.period === period;
      const host = button.closest("fudge-button") ?? button;
      host.setAttribute("variant", selected ? "primary" : "secondary");
      host.querySelector("button")?.setAttribute("aria-pressed", String(selected));
    });
    rememberPlan((takePlan().plan || "pro") as Plan, period);
  };
  buttons.forEach((button) => {
    button.addEventListener("click", () => {
      const period = button.dataset.period;
      if (period === "quarterly" || period === "yearly") apply(period);
    });
  });
  apply(initial);
  return { apply };
}

function bindCaptureDialog(root: ParentNode) {
  const dialog = root.querySelector<FudgeDialog>("#capture-dialog");
  const details = root.querySelector<HTMLElement>("#capture-details");
  if (!dialog || !details) return;
  root.addEventListener("fudge-capture-open", (rawEvent) => {
    const event = rawEvent as CustomEvent<Record<string, string | boolean | null>>;
    const payload = event.detail;
    const assign = (name: string, value: string | boolean | null | undefined) => {
      if (value === true) details.setAttribute(name, "");
      else if (value) details.setAttribute(name, String(value));
      else details.removeAttribute(name);
    };
    assign("capture-id", payload.captureId as string);
    assign("title", payload.title as string);
    assign("domain", payload.domain as string);
    assign("src", payload.src as string);
    assign("aspect-ratio", payload.aspectRatio as string);
    assign("palette", payload.palette as string);
    assign("fonts", payload.fonts as string);
    assign("video", payload.video ? true : null);
    details.setAttribute("layout", "details");
    if (payload.captureId) rememberCapture(String(payload.captureId));
    dialog.open();
  });
}
