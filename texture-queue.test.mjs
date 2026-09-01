import assert from "node:assert/strict";
import test from "node:test";

import {
  acquireSlot,
  releaseSlot,
} from "./src/lib/fudge/texture-queue.ts";

test("starts nearer queued texture work first and drops cancelled work", async () => {
  await Promise.all([acquireSlot(0), acquireSlot(1)]);

  const farController = new AbortController();
  let farStarted = false;
  const far = acquireSlot(20, farController.signal).then(() => {
    farStarted = true;
  });
  let nearStarted = false;
  const near = acquireSlot(2).then(() => {
    nearStarted = true;
  });

  releaseSlot();
  await near;
  assert.equal(nearStarted, true);
  assert.equal(farStarted, false);

  farController.abort();
  await assert.rejects(far, { name: "AbortError" });

  releaseSlot();
  releaseSlot();
});
