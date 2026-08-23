import assert from "node:assert/strict";
import test from "node:test";
import { resolveComposition } from "../src/algebra/resolve.ts";

const graph = {
  rootId: "form",
  nodes: [
    { id: "form", kind: "form", parentId: null, order: 0, state: "idle" },
    { id: "heading", kind: "heading", parentId: "form", order: 0, state: "idle" },
    { id: "email", kind: "field", parentId: "form", order: 1, state: "idle" },
    { id: "email-input", kind: "control", parentId: "email", order: 0, state: "idle" },
    { id: "email-message", kind: "message", parentId: "email", order: 1, state: "idle" },
    { id: "password", kind: "field", parentId: "form", order: 2, state: "idle" },
    { id: "submit", kind: "action", parentId: "form", order: 3, state: "idle" },
  ],
};

const context = {
  density: "comfortable",
  inputModality: "pointer",
  reducedMotion: false,
  soundEnabled: true,
  hapticsEnabled: true,
  userActivated: true,
};

test("derives form rhythm from containment and adjacency", () => {
  const plan = resolveComposition(graph, context);
  assert.equal(plan.nodes.heading.spaceBefore, "none");
  assert.equal(plan.nodes.email.spaceBefore, "section");
  assert.equal(plan.nodes["email-input"].spaceBefore, "none");
  assert.equal(plan.nodes["email-message"].spaceBefore, "support");
  assert.equal(plan.nodes.password.spaceBefore, "field");
  assert.equal(plan.nodes.submit.spaceBefore, "section");
  assert.equal(plan.nodes.email.reserveMessageSpace, true);
});

test("derives pointer submit feedback without component feedback props", () => {
  const plan = resolveComposition(graph, context, [
    { id: "form", kind: "form", from: "idle", to: "submitting" },
  ]);
  assert.deepEqual(plan.feedback[0], {
    event: "submit",
    sourceId: "form",
    visual: "pending",
    motion: "compress",
    sound: "contact",
    haptic: "selection",
  });
});

test("keeps routine keyboard focus silent", () => {
  const plan = resolveComposition(
    graph,
    { ...context, inputModality: "keyboard" },
    [{ id: "email", kind: "field", from: "idle", to: "focused" }],
  );
  assert.equal(plan.feedback[0].sound, "none");
  assert.equal(plan.feedback[0].haptic, "none");
  assert.equal(plan.feedback[0].motion, "lift");
});

test("derives restrained field errors and stronger form rejection", () => {
  const field = resolveComposition(graph, context, [
    { id: "email", kind: "field", from: "focused", to: "invalid" },
  ]).feedback[0];
  assert.equal(field.sound, "none");
  assert.equal(field.haptic, "boundary");

  const form = resolveComposition(graph, context, [
    { id: "form", kind: "form", from: "submitting", to: "failure" },
  ]).feedback[0];
  assert.equal(form.sound, "reject");
  assert.equal(form.haptic, "boundary");
});

test("context suppresses unavailable feedback channels", () => {
  const plan = resolveComposition(
    graph,
    {
      ...context,
      reducedMotion: true,
      soundEnabled: false,
      hapticsEnabled: false,
    },
    [{ id: "form", kind: "form", from: "submitting", to: "success" }],
  );
  assert.equal(plan.feedback[0].motion, "none");
  assert.equal(plan.feedback[0].sound, "none");
  assert.equal(plan.feedback[0].haptic, "none");
});

test("rejects invalid composition graphs", () => {
  assert.throws(
    () =>
      resolveComposition(
        {
          rootId: "missing",
          nodes: [
            { id: "field", kind: "field", parentId: null, order: 0, state: "idle" },
          ],
        },
        context,
      ),
    /root is missing/,
  );
});
