export const RENDER_TARGET_FPS = 30;

export type RenderQualityTier = "low" | "balanced" | "high";

export type RenderQualityProfile = {
  dpr: number;
  textureEdge: number;
  focusedTextureEdge: number;
  anisotropy: number;
  blur: boolean;
  ambientVideo: boolean;
  focusedVideo: boolean;
};

export const RENDER_QUALITY_PROFILES: Record<
  RenderQualityTier,
  RenderQualityProfile
> = {
  low: {
    dpr: 1,
    textureEdge: 640,
    focusedTextureEdge: 1536,
    anisotropy: 2,
    blur: false,
    ambientVideo: false,
    focusedVideo: false,
  },
  balanced: {
    dpr: 1.5,
    textureEdge: 768,
    focusedTextureEdge: 1792,
    anisotropy: 4,
    blur: false,
    ambientVideo: false,
    focusedVideo: true,
  },
  high: {
    dpr: 2,
    textureEdge: 1024,
    focusedTextureEdge: 2048,
    anisotropy: 8,
    blur: true,
    ambientVideo: true,
    focusedVideo: true,
  },
};

const TIER_ORDER: readonly RenderQualityTier[] = ["low", "balanced", "high"];
const DECLINE_FPS = 28;
const INCLINE_FPS = 50;
const DECLINE_SECONDS = 0.8;
const INCLINE_SECONDS = 4;
const CHANGE_COOLDOWN_SECONDS = 4;

export type RenderDeviceCapabilities = {
  hardwareConcurrency?: number;
  deviceMemory?: number;
  devicePixelRatio?: number;
  coarsePointer?: boolean;
  saveData?: boolean;
};

export function selectInitialRenderQuality({
  hardwareConcurrency,
  deviceMemory,
  devicePixelRatio,
  coarsePointer,
  saveData,
}: RenderDeviceCapabilities): RenderQualityTier {
  if (
    saveData ||
    (hardwareConcurrency != null && hardwareConcurrency <= 2) ||
    (deviceMemory != null && deviceMemory <= 2)
  ) {
    return "low";
  }
  if (
    coarsePointer ||
    (hardwareConcurrency != null && hardwareConcurrency <= 6) ||
    (deviceMemory != null && deviceMemory <= 4) ||
    ((devicePixelRatio ?? 1) > 2.5 &&
      hardwareConcurrency != null &&
      hardwareConcurrency < 8)
  ) {
    return "balanced";
  }
  return "high";
}

export type RenderQualityGovernorState = {
  tier: RenderQualityTier;
  belowTargetSeconds: number;
  aboveTargetSeconds: number;
  cooldownSeconds: number;
};

export function createRenderQualityGovernor(
  tier: RenderQualityTier,
): RenderQualityGovernorState {
  return {
    tier,
    belowTargetSeconds: 0,
    aboveTargetSeconds: 0,
    cooldownSeconds: 0,
  };
}

export function advanceRenderQualityGovernor(
  state: RenderQualityGovernorState,
  fps: number,
  elapsedSeconds: number,
): RenderQualityGovernorState {
  if (!Number.isFinite(fps) || !Number.isFinite(elapsedSeconds)) return state;
  const elapsed = Math.max(0, Math.min(elapsedSeconds, 0.25));
  if (elapsed === 0) return state;

  if (state.cooldownSeconds > 0) {
    return {
      ...state,
      belowTargetSeconds: 0,
      aboveTargetSeconds: 0,
      cooldownSeconds: Math.max(0, state.cooldownSeconds - elapsed),
    };
  }

  const next = {
    ...state,
    belowTargetSeconds:
      fps < DECLINE_FPS ? state.belowTargetSeconds + elapsed : 0,
    aboveTargetSeconds:
      fps >= INCLINE_FPS ? state.aboveTargetSeconds + elapsed : 0,
  };
  const index = TIER_ORDER.indexOf(state.tier);

  if (next.belowTargetSeconds >= DECLINE_SECONDS && index > 0) {
    return {
      tier: TIER_ORDER[index - 1]!,
      belowTargetSeconds: 0,
      aboveTargetSeconds: 0,
      cooldownSeconds: CHANGE_COOLDOWN_SECONDS,
    };
  }
  if (
    next.aboveTargetSeconds >= INCLINE_SECONDS &&
    index < TIER_ORDER.length - 1
  ) {
    return {
      tier: TIER_ORDER[index + 1]!,
      belowTargetSeconds: 0,
      aboveTargetSeconds: 0,
      cooldownSeconds: CHANGE_COOLDOWN_SECONDS,
    };
  }
  return next;
}
