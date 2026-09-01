import assert from "node:assert/strict";
import test from "node:test";
import { Window } from "happy-dom";

const browser = new Window({ url: "https://design-system.test/" });
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
  "HTMLTextAreaElement",
  "HTMLButtonElement",
  "customElements",
  "navigator",
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

await import("../src/components/fudge-heading.ts");
await import("../src/components/fudge-field.ts");
await import("../src/components/fudge-action.ts");
await import("../src/components/fudge-form.ts");
await import("../src/components/fudge-button.ts");
await import("../src/components/fudge-surface.ts");
await import("../src/components/fudge-menu.ts");
await import("../src/components/fudge-textarea.ts");
await import("../src/components/fudge-selection.ts");
await import("../src/components/fudge-structure.ts");
await import("../src/components/fudge-feedback.ts");
await import("../src/components/fudge-overlay.ts");
await import("../src/components/fudge-composer.ts");
await import("../src/components/fudge-capture.ts");

const settle = (ms = 0) => {
  const { promise, resolve } = Promise.withResolvers();
  setTimeout(resolve, ms);
  return promise;
};

function loginFixture() {
  const root = document.createElement("fudge-form");
  root.innerHTML = `
    <form novalidate>
      <fudge-heading text="Sign in"></fudge-heading>
      <fudge-field name="email" label="Email" type="email" required></fudge-field>
      <fudge-field name="password" label="Password" type="password" required></fudge-field>
      <fudge-action label="Continue"></fudge-action>
    </form>
  `;
  document.body.append(root);
  return root;
}

test("Lit components render into light DOM and derive spacing from structure", async () => {
  const root = loginFixture();
  await settle();
  await settle();
  const fields = [...root.querySelectorAll("fudge-field")];
  const action = root.querySelector("fudge-action");

  assert.equal(root.shadowRoot, null);
  assert.equal(fields[0].shadowRoot, null);
  assert.ok(fields[0].querySelector("input"));
  assert.equal(fields[0].dataset.spaceBefore, "section");
  assert.equal(fields[1].dataset.spaceBefore, "field");
  assert.equal(action.dataset.spaceBefore, "section");
  assert.equal(fields[0].hasAttribute("data-reserve-message"), true);
  root.remove();
});

test("form state transitions emerge from native validation and submit completion", async () => {
  const root = loginFixture();
  await settle();
  await settle();
  const form = root.querySelector("form");

  form.dispatchEvent(
    new SubmitEvent("submit", { bubbles: true, cancelable: true }),
  );
  await settle();
  assert.equal(root.dataset.state, "failure");

  root.querySelector('input[name="email"]').value = "person@example.com";
  root.querySelector('input[name="password"]').value =
    "correct horse battery staple";
  assert.deepEqual(
    [...form.elements].map((element) => ({
      name: element.name,
      value: element.value,
      valid: element.validity.valid,
    })),
    [
      { name: "email", value: "person@example.com", valid: true },
      {
        name: "password",
        value: "correct horse battery staple",
        valid: true,
      },
      { name: "", value: "", valid: true },
    ],
  );
  let submitObserved = false;
  root.addEventListener(
    "fudge-submit",
    (event) => {
      submitObserved = true;
      event.preventDefault();
      event.detail.complete("success");
    },
    { once: true },
  );
  form.requestSubmit();
  await settle(20);
  assert.equal(submitObserved, true);
  assert.equal(root.dataset.state, "success");
  assert.equal(root.querySelector("fudge-action button").disabled, false);
  root.remove();
});

test("surface, card, button, and menu primitives stay light DOM", async () => {
  const root = document.createElement("div");
  root.innerHTML = `
    <fudge-surface variant="accent">Surface</fudge-surface>
    <fudge-card>
      <fudge-card-header>
        <fudge-card-title>Card</fudge-card-title>
        <fudge-card-description>Details</fudge-card-description>
      </fudge-card-header>
      <fudge-card-content><fudge-button variant="tertiary">Save</fudge-button></fudge-card-content>
    </fudge-card>
    <fudge-menu>
      <fudge-menu-trigger>Open</fudge-menu-trigger>
      <fudge-menu-item>First</fudge-menu-item>
    </fudge-menu>
  `;
  document.body.append(root);
  await settle();
  assert.equal(root.querySelector("fudge-card")?.shadowRoot, null);
  assert.equal(
    root.querySelector(".fudge-button")?.dataset.variant,
    "tertiary",
  );
  const menu = root.querySelector("fudge-menu");
  assert.equal(menu?.querySelector(".fudge-menu-panel")?.hidden, true);
  menu?.querySelector(".fudge-menu-trigger")?.click();
  assert.equal(menu?.querySelector(".fudge-menu-panel")?.hidden, false);
  root.remove();
});

test("input, feedback, and structure primitives preserve native semantics", async () => {
  const root = document.createElement("div");
  root.innerHTML = `
    <fudge-fieldset legend="Preferences">
      <fudge-textarea label="Notes" name="notes" rows="3"></fudge-textarea>
      <fudge-checkbox label="Remember this device" name="remember"></fudge-checkbox>
      <fudge-switch label="Use compact view" name="compact"></fudge-switch>
      <fudge-separator></fudge-separator>
      <fudge-alert variant="accent">Saved.</fudge-alert>
      <fudge-status>Ready.</fudge-status>
    </fudge-fieldset>
  `;
  document.body.append(root);
  await settle();
  assert.ok(root.querySelector("fieldset"));
  assert.ok(root.querySelector("textarea"));
  assert.equal(root.querySelector('input[name="remember"]')?.type, "checkbox");
  assert.equal(
    root.querySelector('input[name="compact"]')?.getAttribute("role"),
    "switch",
  );
  assert.equal(
    root.querySelector("fudge-alert")?.getAttribute("role"),
    "alert",
  );
  assert.equal(
    root.querySelector("fudge-status")?.getAttribute("role"),
    "status",
  );
  assert.equal(
    root.querySelector("fudge-separator")?.getAttribute("role"),
    "separator",
  );
  root.remove();
});

test("popover and tooltip primitives derive open and hover state", async () => {
  const root = document.createElement("div");
  root.innerHTML = `
    <fudge-popover>
      <fudge-popover-trigger><button type="button">More</button></fudge-popover-trigger>
      <fudge-popover-content>More details</fudge-popover-content>
    </fudge-popover>
    <fudge-tooltip>
      <button type="button">Info</button>
      <fudge-tooltip-content>Information</fudge-tooltip-content>
    </fudge-tooltip>
  `;
  document.body.append(root);
  await settle();
  const popover = root.querySelector("fudge-popover");
  const content = root.querySelector("fudge-popover-content");
  assert.equal(content?.hidden, true);
  popover?.querySelector("button")?.click();
  assert.equal(content?.hidden, false);
  const tooltip = root.querySelector("fudge-tooltip");
  const tooltipContent = root.querySelector("fudge-tooltip-content");
  tooltip?.dispatchEvent(new Event("pointerenter", { bubbles: true }));
  assert.equal(tooltipContent?.hidden, false);
  tooltip?.dispatchEvent(new Event("pointerleave", { bubbles: true }));
  assert.equal(tooltipContent?.hidden, true);
  root.remove();
});

test("composer is a native form with attach, prompt, and send", async () => {
  const root = document.createElement("fudge-composer");
  root.setAttribute("placeholder", "Ask Fudge");
  document.body.append(root);
  await settle();
  const textarea = root.querySelector("textarea");
  const send = root.querySelector(".fudge-composer-send");
  assert.equal(root.shadowRoot, null);
  assert.equal(textarea?.placeholder, "Ask Fudge");
  assert.equal(send?.disabled, true);
  if (textarea) textarea.value = "Review stripe.com";
  textarea?.dispatchEvent(new Event("input", { bubbles: true }));
  assert.equal(send?.disabled, false);
  root.remove();
});

test("capture card renders media and details layouts", async () => {
  const root = document.createElement("fudge-capture");
  root.setAttribute("capture-id", "8776");
  root.setAttribute("title", "Crazy Creative");
  root.setAttribute("domain", "crazycreative.design");
  root.setAttribute("aspect-ratio", "1.7");
  root.setAttribute("palette", "#131313,#e7f850");
  document.body.append(root);
  await settle();
  assert.equal(root.shadowRoot, null);
  assert.ok(root.querySelector(".fudge-capture-media img"));
  root.setAttribute("layout", "details");
  await settle();
  assert.equal(
    root.querySelector(".fudge-capture-title")?.textContent?.includes("Crazy Creative"),
    true,
  );
  assert.equal(root.querySelectorAll(".fudge-capture-palette span").length, 2);
  root.remove();
});
