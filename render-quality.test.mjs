import assert from "node:assert/strict";
import test from "node:test";
import {
  FOCUSED_TEXTURE_EDGE,
  RENDER_TARGET_FPS,
  RENDER_QUALITY_PROFILES,
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
    "balanced",
  );
  assert.equal(
    selectInitialRenderQuality({
      hardwareConcurrency: 6,
      deviceMemory: 4,
      coarsePointer: true,
    }),
    "low",
  );
  assert.equal(
    selectInitialRenderQuality({
      hardwareConcurrency: 2,
      deviceMemory: 2,
      saveData: true,
    }),
    "minimal",
  );
});

test("holds quality at and above the 30 fps target", () => {
  assert.equal(RENDER_TARGET_FPS, 30);
  const state = sample(createRenderQualityGovernor("balanced"), 30, 8);
  assert.equal(state.tier, "balanced");
});

test("ignores a brief frame-rate dip", () => {
  const state = sample(createRenderQualityGovernor("high"), 20, 0.3);
  assert.equal(state.tier, "high");
});

test("drops one tier after sustained sub-target rendering", () => {
  const state = sample(createRenderQualityGovernor("high"), 20, 0.5);
  assert.equal(state.tier, "balanced");
  assert.ok(state.cooldownSeconds > 0);
});

test("cooldown prevents oscillation before another sustained decline", () => {
  let state = sample(createRenderQualityGovernor("high"), 20, 0.5);
  state = sample(state, 20, 0.5);
  assert.equal(state.tier, "balanced");
  state = sample(state, 20, 0.6);
  assert.equal(state.tier, "low");
});

test("restores one tier only after sustained headroom", () => {
  const state = sample(createRenderQualityGovernor("balanced"), 60, 2.1);
  assert.equal(state.tier, "high");
});

test("keeps focused captures crisp across adaptive quality tiers", () => {
  assert.equal(FOCUSED_TEXTURE_EDGE, 2_048);
});

test("uses five granular profiles without exceeding 4x anisotropy", () => {
  assert.deepEqual(Object.keys(RENDER_QUALITY_PROFILES), [
    "minimal",
    "low",
    "balanced",
    "high",
    "ultra",
  ]);
  assert.ok(
    Object.values(RENDER_QUALITY_PROFILES).every(
      (profile) => profile.anisotropy <= 4,
    ),
  );
  assert.ok(
    RENDER_QUALITY_PROFILES.balanced.dpr < RENDER_QUALITY_PROFILES.ultra.dpr,
  );
});
