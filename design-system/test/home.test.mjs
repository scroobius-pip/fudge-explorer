import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { Window } from "happy-dom";

const html = await readFile(new URL("../index.html", import.meta.url), "utf8");
const body = html.replace(/^[\s\S]*<body[^>]*>/i, "").replace(/<\/body>[\s\S]*$/i, "");

const browser = new Window({ url: "http://localhost:8790/" });
for (const key of [
  "window",
  "document",
  "HTMLElement",
  "Element",
  "Node",
  "MutationObserver",
  "CustomEvent",
  "Event",
  "SubmitEvent",
  "FocusEvent",
  "InputEvent",
  "FormData",
  "HTMLInputElement",
  "HTMLFormElement",
  "HTMLButtonElement",
  "HTMLAnchorElement",
  "HTMLTextAreaElement",
  "customElements",
  "navigator",
  "location",
]) {
  Object.defineProperty(globalThis, key, {
    configurable: true,
    value: key === "window" ? browser : browser[key],
  });
}
Object.defineProperty(globalThis, "matchMedia", {
  configurable: true,
  value: () => ({ matches: false }),
});
Object.defineProperty(globalThis, "CSS", {
  configurable: true,
  value: { escape: (value) => String(value) },
});

document.body.innerHTML = body.replace(/<script[\s\S]*<\/script>/i, "");
await import("../src/components/fudge-button.ts");
await import("../src/components/fudge-surface.ts");
await import("../src/components/fudge-menu.ts");
await import("../src/components/fudge-feedback.ts");
await import("../src/components/fudge-dialog.ts");
await import("../src/components/fudge-composer.ts");
await import("../src/components/fudge-capture.ts");
await new Promise((resolve) => setTimeout(resolve, 20));
const { bindHome } = await import("../src/home-page.ts");
bindHome(document);

test("home page renders atlas sections with design-system primitives", () => {
  assert.ok(document.querySelector("#start-hero fudge-composer"));
  assert.ok(document.querySelector("#start-hero .home-float-card"));
  assert.ok(document.querySelector("#start-hero .home-try"));
  assert.ok(document.querySelector("#how-it-works"));
  assert.ok(document.querySelector("#continuity .home-palette"));
  assert.ok(document.querySelector("#pricing"));
  assert.ok(document.querySelector("#free-entry fudge-alert"));
  assert.ok(document.querySelector("#faq details"));
  assert.equal(document.querySelector("#capabilities"), null);
  assert.equal(document.querySelectorAll("[data-explorer-link]").length > 0, true);
});

test("billing period updates charged totals on both plan cards", () => {
  const yearly = document.querySelector("[data-period='yearly']");
  yearly?.querySelector("button")?.click();
  assert.equal(document.querySelector("[data-price='pro']")?.textContent, "$390");
  assert.equal(document.querySelector("[data-price='studio']")?.textContent, "$990");
  assert.match(
    document.querySelector("[data-period-label='pro']")?.textContent || "",
    /\$32\.50\/month/,
  );
});

test("example tasks fill the composer", () => {
  const example = document.querySelector("[data-example='editorial landing pages']");
  example?.click();
  assert.equal(
    document.querySelector("fudge-composer textarea")?.value,
    "editorial landing pages",
  );
});
