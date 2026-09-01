export const RENDER_TARGET_FPS = 30;
export const FOCUSED_TEXTURE_EDGE = 2048;

export type RenderQualityTier =
  "minimal" | "low" | "balanced" | "high" | "ultra";

export type RenderQualityProfile = {
  dpr: number;
  textureEdge: number;
  anisotropy: number;
  blur: boolean;
  ambientVideoLimit: number;
  focusedVideo: boolean;
};

export const RENDER_QUALITY_PROFILES: Record<
  RenderQualityTier,
  RenderQualityProfile
> = {
  minimal: {
    dpr: 1,
    textureEdge: 512,
    anisotropy: 1,
    blur: false,
    ambientVideoLimit: 0,
    focusedVideo: false,
  },
  low: {
    dpr: 1.15,
    textureEdge: 640,
    anisotropy: 1,
    blur: false,
    ambientVideoLimit: 0,
    focusedVideo: false,
  },
  balanced: {
    dpr: 1.35,
    textureEdge: 768,
    anisotropy: 2,
    blur: false,
    ambientVideoLimit: 0,
    focusedVideo: true,
  },
  high: {
    dpr: 1.65,
    textureEdge: 896,
    anisotropy: 4,
    blur: false,
    ambientVideoLimit: 1,
    focusedVideo: true,
  },
  ultra: {
    dpr: 2,
    textureEdge: 1024,
    anisotropy: 4,
    blur: true,
    ambientVideoLimit: 2,
    focusedVideo: true,
  },
};

const TIER_ORDER: readonly RenderQualityTier[] = [
  "minimal",
  "low",
  "balanced",
  "high",
  "ultra",
];
const DECLINE_FPS = 29;
const INCLINE_FPS = 56;
const DECLINE_SECONDS = 0.4;
const INCLINE_SECONDS = 2;
const CHANGE_COOLDOWN_SECONDS = 0.75;

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
  coarsePointer,
  saveData,
}: RenderDeviceCapabilities): RenderQualityTier {
  if (
    saveData ||
    (hardwareConcurrency != null && hardwareConcurrency <= 2) ||
    (deviceMemory != null && deviceMemory <= 2)
  ) {
    return "minimal";
  }
  if (
    coarsePointer ||
    (hardwareConcurrency != null && hardwareConcurrency <= 4) ||
    (deviceMemory != null && deviceMemory <= 4)
  ) {
    return "low";
  }
  return "balanced";
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
  const elapsed = Math.max(0, Math.min(elapsedSeconds, 0.2));
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
