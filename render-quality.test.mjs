import assert from "node:assert/strict";
import test from "node:test";
import {
  RENDER_TARGET_FPS,
  advanceRenderQualityGovernor,
  createRenderQualityGovernor,
  selectInitialRenderQuality,
} from "./src/lib/render-quality.ts";

function sample(state, fps, seconds, step = 0.1) {
  let current = state;
  for (let elapsed = 0; elapsed < seconds; elapsed += step) {
    current = advanceRenderQualityGovernor(current, fps, step);
  }
  return current;
}

test("selects a conservative initial tier only when the device reports constraints", () => {
  assert.equal(
    selectInitialRenderQuality({
      hardwareConcurrency: 10,
      deviceMemory: 16,
      devicePixelRatio: 2,
    }),
    "high",
  );
  assert.equal(
    selectInitialRenderQuality({
      hardwareConcurrency: 6,
      deviceMemory: 4,
      coarsePointer: true,
    }),
    "balanced",
  );
  assert.equal(
    selectInitialRenderQuality({
      hardwareConcurrency: 2,
      deviceMemory: 2,
      saveData: true,
    }),
    "low",
  );
});

test("holds quality at and above the 30 fps target", () => {
  assert.equal(RENDER_TARGET_FPS, 30);
  const state = sample(createRenderQualityGovernor("high"), 30, 8);
  assert.equal(state.tier, "high");
});

test("ignores a brief frame-rate dip", () => {
  const state = sample(createRenderQualityGovernor("high"), 20, 0.5);
  assert.equal(state.tier, "high");
});

test("drops one tier after sustained sub-target rendering", () => {
  const state = sample(createRenderQualityGovernor("high"), 20, 1);
  assert.equal(state.tier, "balanced");
  assert.ok(state.cooldownSeconds > 0);
});

test("cooldown prevents oscillation before another sustained decline", () => {
  let state = sample(createRenderQualityGovernor("high"), 20, 1);
  state = sample(state, 20, 4.1);
  assert.equal(state.tier, "balanced");
  state = sample(state, 20, 1);
  assert.equal(state.tier, "low");
});

test("restores one tier only after sustained headroom", () => {
  const state = sample(createRenderQualityGovernor("balanced"), 60, 4.2);
  assert.equal(state.tier, "high");
});
