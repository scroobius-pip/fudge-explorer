import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MutableRefObject,
} from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { Frame } from "@/components/frame";
import {
  VIEW_DEPTH_STEP,
  denseLayout,
  layoutBounds,
  type LayoutBounds,
  type Slot,
} from "@/lib/fudge/layout";
import type { Capture, FieldView } from "@/lib/fudge/types";
import { sfx } from "@/lib/sfx";
import {
  RENDER_QUALITY_PROFILES,
  RENDER_TARGET_FPS,
  advanceRenderQualityGovernor,
  createRenderQualityGovernor,
  selectInitialRenderQuality,
  type RenderQualityProfile,
  type RenderQualityTier,
} from "@/lib/render-quality";

export type FieldLayer = {
  view: FieldView;
  depth: number;
  captures: Capture[];
};

type WallProps = {
  layers: FieldLayer[];
  activeIndex: number;
  focused: Capture | null;
  reducedMotion: boolean;
  onFocus: (id: number | null) => void;
  onTraverse: (index: number) => void;
  onSwipeFocus: (dx: -1 | 0 | 1, dy: -1 | 0 | 1) => void;
  onTravelState: (pending: boolean) => void;
  onSlots: (slots: Slot[]) => void;
};

function initialRenderQuality(): RenderQualityTier {
  if (typeof window === "undefined") return "high";
  const navigatorWithMemory = window.navigator as Navigator & {
    deviceMemory?: number;
    connection?: { saveData?: boolean };
  };
  return selectInitialRenderQuality({
    hardwareConcurrency: navigatorWithMemory.hardwareConcurrency,
    deviceMemory: navigatorWithMemory.deviceMemory,
    devicePixelRatio: window.devicePixelRatio,
    coarsePointer: window.matchMedia("(pointer: coarse)").matches,
    saveData: navigatorWithMemory.connection?.saveData,
  });
}

export function Wall(props: WallProps) {
  const didDragRef = useRef(false);
  const skipMissRef = useRef(false);
  const [qualityTier, setQualityTier] =
    useState<RenderQualityTier>(initialRenderQuality);
  const quality = RENDER_QUALITY_PROFILES[qualityTier];
  const renderDpr =
    typeof window === "undefined"
      ? 1
      : Math.max(1, Math.min(quality.dpr, window.devicePixelRatio || 1));

  return (
    <Canvas
      frameloop="demand"
      className="absolute inset-0 h-full w-full touch-none"
      flat
      dpr={renderDpr}
      gl={{
        antialias: true,
        alpha: false,
        preserveDrawingBuffer: false,
        powerPreference: "high-performance",
      }}
      camera={{ fov: 58, near: 0.08, far: 2000, position: [0, 0, 6] }}
      onCreated={({ gl, scene, camera }) => {
        gl.setClearColor("#f2f0e9", 1);
        scene.background = new THREE.Color("#f2f0e9");
        gl.domElement.style.touchAction = "none";
        camera.lookAt(0, 0, 0);
      }}
      onPointerMissed={() => {
        if (skipMissRef.current) {
          skipMissRef.current = false;
          return;
        }
        if (!didDragRef.current) props.onFocus(null);
      }}
    >
      <AdaptiveQualityGovernor
        tier={qualityTier}
        dpr={renderDpr}
        onTierChange={setQualityTier}
      />
      <Scene
        {...props}
        quality={quality}
        didDragRef={didDragRef}
        onFocus={(id) => {
          skipMissRef.current = id !== null;
          props.onFocus(id);
        }}
      />
    </Canvas>
  );
}

const LAYOUT_CACHE_LIMIT = 32;

type ViewSnapshot = {
  key: string;
  depth: number;
  captures: Capture[];
  slots: Slot[];
  bounds: LayoutBounds;
};

function GridReady() {
  const fired = useRef(false);
  useFrame(() => {
    if (fired.current) return;
    fired.current = true;
    requestAnimationFrame(() => {
      window.dispatchEvent(new CustomEvent("fudge:grid-ready"));
    });
  });
  return null;
}

function AdaptiveQualityGovernor({
  tier,
  dpr,
  onTierChange,
}: {
  tier: RenderQualityTier;
  dpr: number;
  onTierChange: (tier: RenderQualityTier) => void;
}) {
  const { gl, invalidate } = useThree();
  const governor = useRef(createRenderQualityGovernor(tier));
  const requestedTier = useRef(tier);
  const averageFps = useRef(0);
  const sampleFrames = useRef(0);
  const lastFrameAt = useRef(0);
  const lastReportAt = useRef(0);

  useEffect(() => {
    if (governor.current.tier !== tier) {
      governor.current = createRenderQualityGovernor(tier);
    }
    requestedTier.current = tier;
    averageFps.current = 0;
    sampleFrames.current = 0;
    gl.domElement.dataset.qualityTier = tier;
    gl.domElement.dataset.qualityDpr = dpr.toFixed(2);
    gl.domElement.dataset.qualityTargetFps = String(RENDER_TARGET_FPS);
    invalidate();
  }, [dpr, gl, invalidate, tier]);

  useFrame((_, delta) => {
    const now = performance.now();
    const gap = lastFrameAt.current ? now - lastFrameAt.current : 0;
    lastFrameAt.current = now;
    if (delta <= 0 || delta > 0.2 || gap > 250) {
      averageFps.current = 0;
      sampleFrames.current = 0;
      governor.current = {
        ...governor.current,
        belowTargetSeconds: 0,
        aboveTargetSeconds: 0,
      };
      return;
    }

    const fps = Math.min(240, 1 / delta);
    const alpha = 1 - Math.exp(-delta * 3);
    averageFps.current =
      averageFps.current === 0
        ? fps
        : THREE.MathUtils.lerp(averageFps.current, fps, alpha);
    sampleFrames.current += 1;
    if (sampleFrames.current < 8) return;

    const next = advanceRenderQualityGovernor(
      governor.current,
      averageFps.current,
      delta,
    );
    governor.current = next;
    if (now - lastReportAt.current >= 500) {
      lastReportAt.current = now;
      gl.domElement.dataset.qualityFps = averageFps.current.toFixed(1);
    }
    if (next.tier !== requestedTier.current) {
      requestedTier.current = next.tier;
      onTierChange(next.tier);
    }
  });

  return null;
}

function viewKey(view: FieldView, depth: number) {
  return `${depth}:${JSON.stringify(view)}`;
}

function sameIds(a: Set<number>, b: Set<number>) {
  if (a.size !== b.size) return false;
  for (const id of a) if (!b.has(id)) return false;
  return true;
}

function sameWindows(a: Map<string, Set<number>>, b: Map<string, Set<number>>) {
  if (a.size !== b.size) return false;
  for (const [key, ids] of a) {
    const other = b.get(key);
    if (!other || !sameIds(ids, other)) return false;
  }
  return true;
}

function initialVisibleIds(snapshot: ViewSnapshot) {
  const { bounds, slots } = snapshot;
  const halfW = Math.min(bounds.halfW + 0.2, 5.6);
  const halfH = Math.min(bounds.halfH + 0.2, 4.2);
  const top = bounds.cy + bounds.halfH;
  const cy = Math.max(bounds.cy, top - halfH);
  const ids = new Set<number>();
  for (const slot of slots) {
    const [x, y] = slot.position;
    const [w, h] = slot.size;
    if (
      Math.abs(x - bounds.cx) <= halfW + w / 2 &&
      Math.abs(y - cy) <= halfH + h / 2
    ) {
      ids.add(slot.id);
    }
  }
  if (ids.size > 0) return ids;
  for (const slot of slots.slice(0, 24)) ids.add(slot.id);
  return ids;
}

function searchedCaptureSlot(capture: Capture, snapshot: ViewSnapshot): Slot {
  const width = 1.65;
  const aspect = Math.max(0.42, Math.min(4.6, capture.aspect || 1.45));
  return {
    id: capture.id,
    position: [
      snapshot.bounds.cx,
      snapshot.bounds.cy + Math.max(0, snapshot.bounds.halfH - 2.5),
      snapshot.bounds.cz,
    ],
    size: [width, width / aspect],
    layer: 0,
    rank: -1,
  };
}

function Scene({
  layers,
  activeIndex,
  focused,
  reducedMotion,
  onFocus,
  onTraverse,
  onSwipeFocus,
  onTravelState,
  onSlots,
  didDragRef,
  quality,
}: WallProps & {
  didDragRef: MutableRefObject<boolean>;
  quality: RenderQualityProfile;
}) {
  const cacheRef = useRef(
    new Map<
      string,
      { signature: string; slots: Slot[]; bounds: LayoutBounds }
    >(),
  );
  const snapshots = useMemo<ViewSnapshot[]>(() => {
    const materialized = layers.map((layer) => {
      const key = viewKey(layer.view, layer.depth);
      const signature = layer.captures
        .map((capture) => `${capture.id}:${capture.aspect.toFixed(4)}`)
        .join("|");
      const cached = cacheRef.current.get(key);
      if (cached?.signature === signature) {
        cacheRef.current.delete(key);
        cacheRef.current.set(key, cached);
        return {
          key,
          depth: layer.depth,
          captures: layer.captures,
          slots: cached.slots,
          bounds: cached.bounds,
        };
      }
      const slots = denseLayout(layer.captures, layer.depth);
      const bounds = layoutBounds(slots);
      cacheRef.current.set(key, { signature, slots, bounds });
      return {
        key,
        depth: layer.depth,
        captures: layer.captures,
        slots,
        bounds,
      };
    });
    while (cacheRef.current.size > LAYOUT_CACHE_LIMIT) {
      const oldest = cacheRef.current.keys().next().value as string | undefined;
      if (!oldest) break;
      cacheRef.current.delete(oldest);
    }
    return materialized;
  }, [layers]);

  const baseActive = snapshots[activeIndex] ?? snapshots[0];
  if (!baseActive) return null;
  const hasFocused =
    focused != null &&
    baseActive.captures.some((capture) => capture.id === focused.id);
  const focusOverlay =
    focused && !hasFocused ? searchedCaptureSlot(focused, baseActive) : null;
  const active: ViewSnapshot = focusOverlay
    ? {
        ...baseActive,
        captures: [...baseActive.captures, focused!],
        slots: [...baseActive.slots, focusOverlay],
      }
    : baseActive;
  const renderSnapshots = snapshots.map((snapshot, index) =>
    index === activeIndex ? active : snapshot,
  );
  const focusedSlot =
    focused == null
      ? null
      : (active.slots.find((slot) => slot.id === focused.id) ?? null);
  const hoveredCaptureRef = useRef<number | null>(null);
  const [renderWindows, setRenderWindows] = useState(
    () => new Map([[active.key, initialVisibleIds(active)]]),
  );
  const [traveling, setTraveling] = useState(false);

  useEffect(() => {
    onSlots(active.slots);
  }, [active.slots, onSlots]);

  const onVisibleWindows = useCallback((next: Map<string, Set<number>>) => {
    setRenderWindows((current) =>
      sameWindows(current, next) ? current : next,
    );
  }, []);

  const updateTravelState = useCallback(
    (pending: boolean) => {
      setTraveling(pending);
      onTravelState(pending);
    },
    [onTravelState],
  );

  return (
    <>
      <GridReady />
      <color attach="background" args={["#f2f0e9"]} />
      <CameraRig
        snapshots={renderSnapshots}
        active={active}
        activeIndex={activeIndex}
        focusedSlot={focusedSlot}
        hoveredCaptureRef={hoveredCaptureRef}
        reducedMotion={reducedMotion}
        didDragRef={didDragRef}
        onFocus={onFocus}
        onSwipeFocus={onSwipeFocus}
        onTraverse={onTraverse}
        onTravelState={updateTravelState}
        onVisibleWindows={onVisibleWindows}
      />
      {renderSnapshots.map((snapshot, index) => {
        const activeLayer = index === activeIndex;
        const visibleIds =
          renderWindows.get(snapshot.key) ??
          (activeLayer ? initialVisibleIds(snapshot) : new Set<number>());
        return (
          <LayerFrames
            key={snapshot.key}
            snapshot={snapshot}
            visibleIds={visibleIds}
            focusedId={activeLayer ? (focused?.id ?? null) : null}
            reducedMotion={reducedMotion}
            quality={quality}
            didDragRef={didDragRef}
            onFocus={onFocus}
            onHover={(id) => {
              hoveredCaptureRef.current = id;
            }}
            interactive={activeLayer}
            loadTextures={activeLayer && !traveling}
            playVideos={activeLayer && !traveling}
          />
        );
      })}
    </>
  );
}

function LayerFrames({
  snapshot,
  visibleIds,
  focusedId,
  reducedMotion,
  didDragRef,
  onFocus,
  onHover,
  interactive,
  loadTextures,
  playVideos,
  quality,
}: {
  snapshot: ViewSnapshot;
  visibleIds: Set<number>;
  focusedId: number | null;
  reducedMotion: boolean;
  didDragRef: MutableRefObject<boolean>;
  onFocus: (id: number | null) => void;
  onHover: (id: number | null) => void;
  interactive: boolean;
  loadTextures: boolean;
  playVideos: boolean;
  quality: RenderQualityProfile;
}) {
  const byId = useMemo(
    () => new Map(snapshot.captures.map((capture) => [capture.id, capture])),
    [snapshot.captures],
  );
  const focusPos =
    focusedId == null
      ? null
      : (snapshot.slots.find((slot) => slot.id === focusedId)?.position ??
        null);
  const renderedIds = new Set(visibleIds);
  if (focusedId != null) renderedIds.add(focusedId);
  const playVisibleVideos =
    quality.ambientVideo && interactive && playVideos && visibleIds.size <= 50;

  return snapshot.slots.map((slot, index) => {
    if (!renderedIds.has(slot.id)) return null;
    const capture = byId.get(slot.id);
    if (!capture) return null;
    return (
      <Frame
        key={`${snapshot.key}:${capture.id}`}
        capture={capture}
        slot={slot}
        index={index}
        count={snapshot.slots.length}
        focusedId={focusedId}
        focusPos={focusPos}
        reducedMotion={reducedMotion}
        quality={quality}
        interactive={interactive}
        loadTexture={loadTextures}
        playVideo={
          interactive &&
          playVideos &&
          ((focusedId === capture.id && quality.focusedVideo) ||
            playVisibleVideos)
        }
        didDragRef={didDragRef}
        onHover={onHover}
        onFocus={(id) => onFocus(id)}
      />
    );
  });
}

function fitDistance(
  bounds: LayoutBounds,
  camera: THREE.PerspectiveCamera,
  aspect: number,
) {
  const v = Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2);
  const distH = bounds.halfH / v;
  const distW = bounds.halfW / (v * Math.max(0.5, aspect));
  return Math.max(2.1, Math.max(distH, distW) * 1.14);
}

type FocusWindow = {
  x: number;
  y: number;
  width: number;
  height: number;
};

const FULL_FOCUS_WINDOW: FocusWindow = {
  x: 0,
  y: 0,
  width: 1,
  height: 1,
};

function fillDistance(
  slot: Slot,
  camera: THREE.PerspectiveCamera,
  aspect: number,
  focusWindow: FocusWindow = FULL_FOCUS_WINDOW,
) {
  const v = Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2);
  const usableHeight = Math.max(0.12, focusWindow.height) * 0.92;
  const usableWidth = Math.max(0.12, focusWindow.width) * 0.92;
  const distH = slot.size[1] / 2 / v / usableHeight;
  const distW = slot.size[0] / 2 / (v * Math.max(0.5, aspect)) / usableWidth;
  return Math.max(1.05, Math.max(distH, distW) + 0.28);
}

function focusTarget(
  slot: Slot,
  distance: number,
  camera: THREE.PerspectiveCamera,
  aspect: number,
  focusWindow: FocusWindow,
) {
  const v = Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2);
  const frameDistance = Math.max(0.1, distance - 0.28);
  const halfH = frameDistance * v;
  const halfW = halfH * Math.max(0.5, aspect);
  const ndcX = (focusWindow.x + focusWindow.width / 2) * 2 - 1;
  const ndcY = 1 - (focusWindow.y + focusWindow.height / 2) * 2;
  return {
    x: slot.position[0] - ndcX * halfW,
    y: slot.position[1] - ndcY * halfH,
  };
}

function initialCameraState(
  bounds: LayoutBounds,
  camera: THREE.PerspectiveCamera,
  aspect: number,
) {
  const v = Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2);
  const targetWidth = aspect >= 1.1 ? 9.8 : 4.8;
  const near = THREE.MathUtils.clamp(
    targetWidth / (2 * v * Math.max(0.5, aspect)),
    3.2,
    7,
  );
  const zoom = Math.min(near, fitDistance(bounds, camera, aspect));
  const viewportHalfH = zoom * v;
  const topY = bounds.cy + bounds.halfH;
  const minY = bounds.cy - bounds.halfH + viewportHalfH;
  const maxY = bounds.cy + bounds.halfH - viewportHalfH;
  const desiredY = topY - viewportHalfH - 0.18;
  const panY =
    minY > maxY ? bounds.cy : THREE.MathUtils.clamp(desiredY, minY, maxY);
  return { panX: bounds.cx, panY, zoom };
}

function dampVec(
  current: THREE.Vector3,
  target: THREE.Vector3,
  lambda: number,
  dt: number,
) {
  current.x = THREE.MathUtils.damp(current.x, target.x, lambda, dt);
  current.y = THREE.MathUtils.damp(current.y, target.y, lambda, dt);
  current.z = THREE.MathUtils.damp(current.z, target.z, lambda, dt);
}

function CameraRig({
  snapshots,
  active,
  activeIndex,
  focusedSlot,
  hoveredCaptureRef,
  reducedMotion,
  didDragRef,
  onFocus,
  onTraverse,
  onSwipeFocus,
  onTravelState,
  onVisibleWindows,
}: {
  snapshots: ViewSnapshot[];
  active: ViewSnapshot;
  activeIndex: number;
  focusedSlot: Slot | null;
  hoveredCaptureRef: MutableRefObject<number | null>;
  reducedMotion: boolean;
  didDragRef: MutableRefObject<boolean>;
  onFocus: (id: number | null) => void;
  onSwipeFocus: (dx: -1 | 0 | 1, dy: -1 | 0 | 1) => void;
  onTraverse: (index: number) => void;
  onTravelState: (pending: boolean) => void;
  onVisibleWindows: (windows: Map<string, Set<number>>) => void;
}) {
  const { camera, gl, invalidate, size } = useThree();
  const perspective = camera as THREE.PerspectiveCamera;
  const aspect = size.width / Math.max(1, size.height);
  const initial = initialCameraState(active.bounds, perspective, aspect);
  const panX = useRef(initial.panX);
  const panY = useRef(initial.panY);
  const zoom = useRef(initial.zoom);
  const zoomTo = useRef(initial.zoom);
  const dragging = useRef(false);
  const userUntil = useRef(0);
  const travelling = useRef(false);
  const pos = useRef(
    new THREE.Vector3(
      initial.panX,
      initial.panY,
      active.bounds.cz + initial.zoom,
    ),
  );
  const look = useRef(
    new THREE.Vector3(initial.panX, initial.panY, active.bounds.cz),
  );
  const desiredPos = useRef(pos.current.clone());
  const desiredLook = useRef(look.current.clone());
  const snapshotsRef = useRef(snapshots);
  const activeRef = useRef(active);
  const activeIndexRef = useRef(activeIndex);
  const focusRef = useRef(focusedSlot);
  const focusCaptureRef = useRef(onFocus);
  const traverseRef = useRef(onTraverse);
  const swipeFocusRef = useRef(onSwipeFocus);
  const travelStateRef = useRef(onTravelState);
  const visibleRef = useRef(onVisibleWindows);
  const sizeRef = useRef(size);
  const focusWindowRef = useRef<FocusWindow>(FULL_FOCUS_WINDOW);
  const viewKeyRef = useRef(active.key);
  const cameraStates = useRef(
    new Map<string, { panX: number; panY: number; zoom: number }>(),
  );
  const lastCull = useRef(0);
  const lastCullKey = useRef("");
  snapshotsRef.current = snapshots;
  activeRef.current = active;
  activeIndexRef.current = activeIndex;
  focusRef.current = focusedSlot;
  focusCaptureRef.current = onFocus;
  traverseRef.current = onTraverse;
  travelStateRef.current = onTravelState;
  swipeFocusRef.current = onSwipeFocus;
  visibleRef.current = onVisibleWindows;
  sizeRef.current = size;

  useEffect(() => {
    if (!focusedSlot) {
      focusWindowRef.current = FULL_FOCUS_WINDOW;
      delete gl.domElement.dataset.focusSafeRect;
      return;
    }
    const canvas = gl.domElement;
    const controls = [
      ".instrument",
      ".arm-x",
      ".arm-also",
      ".arm-voice",
      ".dock",
    ];
    const measure = () => {
      const canvasRect = canvas.getBoundingClientRect();
      let left = canvasRect.left;
      let right = canvasRect.right;
      let top = canvasRect.top;
      let bottom = canvasRect.bottom;
      const rectOf = (selector: string) => {
        const element = document.querySelector<HTMLElement>(selector);
        if (!element) return null;
        const style = window.getComputedStyle(element);
        if (
          style.display === "none" ||
          style.visibility === "hidden" ||
          style.opacity === "0"
        ) {
          return null;
        }
        const rect = element.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0 ? rect : null;
      };
      const instrument = rectOf(".instrument");
      const leftRail = rectOf(".arm-x");
      const rightRail = rectOf(".arm-also");
      const voiceRail = rectOf(".arm-voice");
      const dock = rectOf(".dock");
      if (instrument) top = Math.max(top, instrument.bottom);
      if (leftRail) left = Math.max(left, leftRail.right);
      if (rightRail) right = Math.min(right, rightRail.left);
      if (voiceRail) bottom = Math.min(bottom, voiceRail.top);
      if (dock) bottom = Math.min(bottom, dock.top);
      const padding = 12;
      left = Math.min(right - 120, left + padding);
      right = Math.max(left + 120, right - padding);
      top = Math.min(bottom - 120, top + padding);
      bottom = Math.max(top + 120, bottom - padding);
      const width = Math.max(1, canvasRect.width);
      const height = Math.max(1, canvasRect.height);
      const next = {
        x: (left - canvasRect.left) / width,
        y: (top - canvasRect.top) / height,
        width: (right - left) / width,
        height: (bottom - top) / height,
      };
      focusWindowRef.current = next;
      canvas.dataset.focusSafeRect = [
        Math.round(left - canvasRect.left),
        Math.round(top - canvasRect.top),
        Math.round(right - left),
        Math.round(bottom - top),
      ].join(",");
      invalidate();
    };
    measure();
    const resizeObserver = new ResizeObserver(measure);
    resizeObserver.observe(canvas);
    for (const selector of controls) {
      const element = document.querySelector<HTMLElement>(selector);
      if (element) resizeObserver.observe(element);
    }
    window.addEventListener("resize", measure);
    return () => {
      resizeObserver.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [focusedSlot, gl, invalidate]);

  useEffect(() => {
    const previousKey = viewKeyRef.current;
    if (previousKey !== active.key) {
      cameraStates.current.set(previousKey, {
        panX: panX.current,
        panY: panY.current,
        zoom: zoomTo.current,
      });
      const currentSize = sizeRef.current;
      const nextAspect = currentSize.width / Math.max(1, currentSize.height);
      const restored =
        cameraStates.current.get(active.key) ??
        initialCameraState(
          active.bounds,
          camera as THREE.PerspectiveCamera,
          nextAspect,
        );
      panX.current = restored.panX;
      panY.current = restored.panY;
      zoomTo.current = restored.zoom;
      userUntil.current = 0;
      viewKeyRef.current = active.key;
      lastCullKey.current = "";
      travelling.current = true;
      travelStateRef.current(true);
    }
    invalidate();
  }, [active.bounds, active.key, camera, invalidate]);

  useEffect(() => {
    const el = gl.domElement;
    const pointers = new Map<number, { x: number; y: number }>();
    let lastX = 0;
    let lastY = 0;
    let moved = 0;
    let pinch = 0;
    let gestureX = 0;
    let gestureY = 0;
    let gestureAt = 0;
    let pinched = false;
    let lockedId: number | null = null;
    let lockUntil = 0;

    const cam = () => camera as THREE.PerspectiveCamera;

    const wallPoint = (clientX: number, clientY: number, distance: number) => {
      const rect = el.getBoundingClientRect();
      const nx = ((clientX - rect.left) / Math.max(1, rect.width)) * 2 - 1;
      const ny = -((clientY - rect.top) / Math.max(1, rect.height)) * 2 + 1;
      const fov = THREE.MathUtils.degToRad(cam().fov);
      const h = 2 * distance * Math.tan(fov / 2);
      const w = h * (rect.width / Math.max(1, rect.height));
      return {
        x: panX.current + nx * (w / 2),
        y: panY.current + ny * (h / 2),
      };
    };

    const clampPan = () => {
      const wall = activeRef.current.bounds;
      const currentSize = sizeRef.current;
      const currentAspect = currentSize.width / Math.max(1, currentSize.height);
      const v = Math.tan(THREE.MathUtils.degToRad(cam().fov) / 2);
      const halfH = zoom.current * v;
      const halfW = halfH * currentAspect;
      const minX = wall.cx - wall.halfW + halfW;
      const maxX = wall.cx + wall.halfW - halfW;
      const minY = wall.cy - wall.halfH + halfH;
      const maxY = wall.cy + wall.halfH - halfH;
      panX.current =
        minX > maxX ? wall.cx : THREE.MathUtils.clamp(panX.current, minX, maxX);
      panY.current =
        minY > maxY ? wall.cy : THREE.MathUtils.clamp(panY.current, minY, maxY);
    };

    const standOf = (slot: Slot | null) => {
      const { width, height } = sizeRef.current;
      const currentAspect = width / Math.max(1, height);
      if (!slot) return 1.4;
      return fillDistance(slot, cam(), currentAspect, focusWindowRef.current);
    };

    const maxZoom = () => {
      const { width, height } = sizeRef.current;
      const currentAspect = width / Math.max(1, height);
      const fit =
        fitDistance(activeRef.current.bounds, cam(), currentAspect) * 1.04;
      return activeIndexRef.current > 0
        ? Math.max(fit, VIEW_DEPTH_STEP + 1.25)
        : fit;
    };

    const zoomToward = (
      nextZoom: number,
      clientX: number,
      clientY: number,
      deltaY: number,
    ) => {
      userUntil.current = performance.now() + 160;
      const before = Math.max(0.001, zoom.current);
      const now = performance.now();
      if (
        lockedId == null ||
        (hoveredCaptureRef.current != null && now > lockUntil)
      ) {
        lockedId = hoveredCaptureRef.current;
      }
      if (deltaY > 0 && !focusRef.current) lockedId = null;
      lockUntil = now + 900;

      const focused = focusRef.current;
      const lockedSlot =
        focused ??
        activeRef.current.slots.find((row) => row.id === lockedId) ??
        null;
      const stand = standOf(lockedSlot);
      const next = THREE.MathUtils.clamp(nextZoom, stand, maxZoom());
      const parentThreshold = VIEW_DEPTH_STEP + 0.9;
      if (deltaY > 0 && activeIndexRef.current > 0 && next >= parentThreshold) {
        lockedId = null;
        traverseRef.current(activeIndexRef.current - 1);
        return;
      }
      if (
        deltaY < 0 &&
        !lockedSlot &&
        activeIndexRef.current < snapshotsRef.current.length - 1 &&
        next <= 1.45
      ) {
        traverseRef.current(activeIndexRef.current + 1);
        return;
      }

      if (Math.abs(next - before) >= 0.0001) {
        if (lockedSlot) {
          panX.current = lockedSlot.position[0];
          panY.current = lockedSlot.position[1];
        } else {
          const point = wallPoint(clientX, clientY, before);
          const k = next / before;
          panX.current = point.x - (point.x - panX.current) * k;
          panY.current = point.y - (point.y - panY.current) * k;
        }
        zoom.current = next;
        zoomTo.current = next;
        clampPan();
        sfx.zoom(next - before);
        invalidate();
      }

      const arrived = next <= stand + 0.06;
      if (focused && next > stand + 0.22) {
        lockedId = null;
        focusCaptureRef.current(null);
        return;
      }
      if (!focused && lockedSlot && arrived) {
        focusCaptureRef.current(lockedSlot.id);
      }
    };

    const onDown = (event: PointerEvent) => {
      pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
      lastX = event.clientX;
      lastY = event.clientY;
      moved = 0;
      didDragRef.current = false;
      if (pointers.size === 1) {
        gestureX = event.clientX;
        gestureY = event.clientY;
        gestureAt = performance.now();
        pinched = false;
      } else {
        pinched = true;
      }
      invalidate();
      if (pointers.size === 1) dragging.current = true;
    };
    const onMove = (event: PointerEvent) => {
      if (!pointers.has(event.pointerId)) return;
      pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
      if (pointers.size === 2) {
        pinched = true;
        const pts = [...pointers.values()];
        const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
        if (pinch > 0) {
          zoomToward(
            zoom.current * (pinch / dist),
            event.clientX,
            event.clientY,
            pinch - dist,
          );
        }
        pinch = dist;
        return;
      }
      if (!dragging.current) return;
      const dx = event.clientX - lastX;
      const dy = event.clientY - lastY;
      lastX = event.clientX;
      lastY = event.clientY;
      moved += Math.abs(dx) + Math.abs(dy);
      if (moved > 6) didDragRef.current = true;
      const dist = zoom.current;
      const rect = el.getBoundingClientRect();
      const fov = THREE.MathUtils.degToRad(cam().fov);
      const worldH = 2 * dist * Math.tan(fov / 2);
      panX.current -= (dx / rect.width) * worldH * (rect.width / rect.height);
      panY.current += (dy / rect.height) * worldH;
      userUntil.current = performance.now() + 180;
      clampPan();
      sfx.friction(Math.hypot(dx, dy));
      invalidate();
    };
    const onUp = (event: PointerEvent) => {
      const dx = event.clientX - gestureX;
      const dy = event.clientY - gestureY;
      const elapsed = performance.now() - gestureAt;
      const horizontal =
        Math.abs(dx) >= 56 && Math.abs(dx) > Math.abs(dy) * 1.25;
      const vertical = Math.abs(dy) >= 56 && Math.abs(dy) > Math.abs(dx) * 1.25;
      if (
        pointers.size === 1 &&
        !pinched &&
        event.pointerType !== "mouse" &&
        focusRef.current &&
        elapsed <= 650 &&
        (horizontal || vertical)
      ) {
        didDragRef.current = true;
        swipeFocusRef.current(
          horizontal ? (dx < 0 ? 1 : -1) : 0,
          vertical ? (dy > 0 ? 1 : -1) : 0,
        );
      }
      pointers.delete(event.pointerId);
      if (pointers.size < 2) pinch = 0;
      if (pointers.size === 0) {
        dragging.current = false;
        sfx.friction(0);
      }
      invalidate();
    };
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const scale = event.deltaMode === 1 ? 0.06 : 0.0015;
      zoomToward(
        zoom.current * Math.exp(event.deltaY * scale),
        event.clientX,
        event.clientY,
        event.deltaY,
      );
    };

    el.addEventListener("pointerdown", onDown);
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      el.removeEventListener("pointerdown", onDown);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
      el.removeEventListener("wheel", onWheel);
    };
  }, [camera, didDragRef, gl, invalidate]);

  useFrame((_, delta) => {
    const dt = Math.min(delta, 0.05);
    const currentSize = sizeRef.current;
    const currentAspect = currentSize.width / Math.max(1, currentSize.height);
    const user = performance.now() < userUntil.current;
    zoom.current = THREE.MathUtils.damp(
      zoom.current,
      zoomTo.current,
      user || dragging.current ? 22 : 10,
      dt,
    );
    if (focusedSlot && !user) {
      const focusWindow = focusWindowRef.current;
      const stand = fillDistance(
        focusedSlot,
        camera as THREE.PerspectiveCamera,
        currentAspect,
        focusWindow,
      );
      const target = focusTarget(
        focusedSlot,
        stand,
        camera as THREE.PerspectiveCamera,
        currentAspect,
        focusWindow,
      );
      panX.current = THREE.MathUtils.damp(panX.current, target.x, 8, dt);
      panY.current = THREE.MathUtils.damp(panY.current, target.y, 8, dt);
      zoomTo.current = stand;
      zoom.current = THREE.MathUtils.damp(zoom.current, stand, 8, dt);
      desiredLook.current.set(target.x, target.y, focusedSlot.position[2]);
      desiredPos.current.set(
        target.x,
        target.y,
        focusedSlot.position[2] + zoom.current,
      );
    } else {
      desiredLook.current.set(panX.current, panY.current, active.bounds.cz);
      desiredPos.current.set(
        panX.current,
        panY.current,
        active.bounds.cz + zoom.current,
      );
    }
    const lambda = reducedMotion ? 24 : user || dragging.current ? 22 : 7;
    dampVec(pos.current, desiredPos.current, lambda, dt);
    dampVec(look.current, desiredLook.current, lambda, dt);
    camera.position.copy(pos.current);
    camera.up.set(0, 1, 0);
    camera.lookAt(look.current);

    const now = performance.now();
    if (now - lastCull.current > 70 || lastCullKey.current === "") {
      lastCull.current = now;
      const v = Math.tan(
        THREE.MathUtils.degToRad((camera as THREE.PerspectiveCamera).fov) / 2,
      );
      const windows = new Map<string, Set<number>>();
      const cullParts: string[] = [];
      for (const snapshot of snapshotsRef.current) {
        const distance = camera.position.z - snapshot.bounds.cz;
        if (distance <= 0.08) continue;
        const halfH = distance * v * 1.16 + 0.2;
        const halfW = halfH * currentAspect;
        const ids = new Set<number>();
        for (const slot of snapshot.slots) {
          const [x, y] = slot.position;
          const [w, h] = slot.size;
          if (
            Math.abs(x - camera.position.x) <= halfW + w / 2 &&
            Math.abs(y - camera.position.y) <= halfH + h / 2
          ) {
            ids.add(slot.id);
          }
        }
        if (snapshot.key === active.key && focusedSlot) ids.add(focusedSlot.id);
        if (ids.size > 0) windows.set(snapshot.key, ids);
        cullParts.push(`${snapshot.key}:${[...ids].join(",")}`);
      }
      const nextCullKey = cullParts.join("|");
      if (nextCullKey !== lastCullKey.current) {
        lastCullKey.current = nextCullKey;
        visibleRef.current(windows);
      }
      const activeRendered = windows.get(active.key)?.size ?? 0;
      gl.domElement.dataset.fieldView = active.key;
      gl.domElement.dataset.fieldRendered = String(activeRendered);
      gl.domElement.dataset.fieldTotal = String(active.slots.length);
      gl.domElement.dataset.fieldLayers = String(snapshotsRef.current.length);
      gl.domElement.dataset.fieldActiveIndex = String(activeIndexRef.current);
      gl.domElement.dataset.fieldZoom = zoom.current.toFixed(4);
      gl.domElement.dataset.fieldPanX = panX.current.toFixed(4);
      gl.domElement.dataset.fieldPanY = panY.current.toFixed(4);
      gl.domElement.dataset.fieldCameraZ = camera.position.z.toFixed(4);
    }

    const moving =
      pos.current.distanceToSquared(desiredPos.current) > 0.000001 ||
      look.current.distanceToSquared(desiredLook.current) > 0.000001 ||
      Math.abs(zoom.current - zoomTo.current) > 0.0001;
    if (travelling.current && !moving) {
      travelling.current = false;
      travelStateRef.current(false);
    }
    if (moving || dragging.current || performance.now() < userUntil.current) {
      invalidate();
    }
  });

  return null;
}
