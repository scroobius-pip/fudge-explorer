import assert from "node:assert/strict";
import test from "node:test";
import { denseLayout, layoutBounds } from "./src/lib/fudge/layout.ts";

const FULL_CORPUS_SIZE = 11_306;

test("lays out every capture without collapsing the corpus into a tall strip", () => {
  const captures = Array.from({ length: FULL_CORPUS_SIZE }, (_, index) => ({
    id: index + 1,
    aspect: 0.8 + (index % 9) * 0.17,
  }));
  const slots = denseLayout(captures);
  const bounds = layoutBounds(slots);
  const columns = new Set(slots.map((slot) => slot.position[0])).size;
  const wallAspect = bounds.halfW / bounds.halfH;

  assert.equal(slots.length, FULL_CORPUS_SIZE);
  assert.equal(new Set(slots.map((slot) => slot.id)).size, FULL_CORPUS_SIZE);
  assert.ok(columns >= 100);
  assert.ok(wallAspect > 1 && wallAspect < 2.5);
});
