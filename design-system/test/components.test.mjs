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

  form.dispatchEvent(new SubmitEvent("submit", { bubbles: true, cancelable: true }));
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
