import { useEffect, useRef, useState, type MutableRefObject } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { Image } from "@react-three/drei";
import * as THREE from "three";
import { mediaUrl, motionOf } from "@/lib/fudge/catalog";
import type { Slot } from "@/lib/fudge/layout";
import { loadCaptureTexture, peekTexture } from "@/lib/fudge/texture-queue";
import { sfx } from "@/lib/sfx";
import type { Capture } from "@/lib/fudge/types";
import {
  FOCUSED_TEXTURE_EDGE,
  type RenderQualityProfile,
} from "@/lib/render-quality";

const PLANE_GEOMETRY = new THREE.PlaneGeometry(1, 1);
const PLACEHOLDER_MATERIAL = new THREE.ShaderMaterial({
  uniforms: {
    uTime: { value: 0 },
  },
  transparent: true,
  depthWrite: false,
  vertexShader: `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: `
    uniform float uTime;
    varying vec2 vUv;

    float roundedBox(vec2 point, vec2 halfSize, float radius) {
      vec2 edge = abs(point) - halfSize + radius;
      return length(max(edge, 0.0)) + min(max(edge.x, edge.y), 0.0) - radius;
    }

    void main() {
      float edge = roundedBox(vUv - 0.5, vec2(0.5), 0.045);
      float mask = 1.0 - smoothstep(-0.004, 0.004, edge);
      float blink = 0.08 + 0.72 * (0.5 + 0.5 * sin(uTime * 3.8));
      if (mask < 0.001) discard;
      gl_FragColor = vec4(vec3(0.867, 0.851, 0.816), blink * mask);
    }
  `,
});

export type FrameTransition = {
  role: "incoming" | "outgoing";
  direction: "in" | "out" | "cross";
  startedAt: number;
  duration: number;
};

function transitionOffset(transition?: FrameTransition) {
  if (!transition) return 0;
  if (transition.role === "incoming") {
    return transition.direction === "in"
      ? -0.8
      : transition.direction === "out"
        ? 0.8
        : -0.25;
  }
  return -0.65;
}

type FrameProps = {
  capture: Capture;
  slot: Slot;
  index: number;
  count: number;
  focusedId: number | null;
  focusPos: [number, number, number] | null;
  reducedMotion: boolean;
  quality: RenderQualityProfile;
  transition?: FrameTransition;
  interactive?: boolean;
  loadTexture?: boolean;
  loadPriority?: number;
  playVideo?: boolean;
  didDragRef: MutableRefObject<boolean>;
  onFocus: (id: number) => void;
  onHover: (id: number | null) => void;
};

function patchPresence(mat: THREE.ShaderMaterial) {
  if (mat.userData.presence) return;
  mat.uniforms.blur = { value: 0 };
  mat.uniforms.blurDir = { value: new THREE.Vector2(0, 0) };
  mat.fragmentShader = mat.fragmentShader
    .replace(
      "uniform float grayscale;",
      "uniform float grayscale;\n  uniform float blur;\n  uniform vec2 blurDir;",
    )
    .replace(
      "gl_FragColor = toGrayscale(texture2D(map, zUv) * vec4(color, opacity * a), grayscale);",
      `vec4 texColor = texture2D(map, zUv);
    if (blur > 0.001) {
      vec2 iso = vec2(0.012, 0.012) * blur;
      vec2 mot = blurDir * blur;
      texColor = texColor * 0.30
        + texture2D(map, zUv + vec2(iso.x, 0.0)) * 0.11
        + texture2D(map, zUv - vec2(iso.x, 0.0)) * 0.11
        + texture2D(map, zUv + vec2(0.0, iso.y)) * 0.11
        + texture2D(map, zUv - vec2(0.0, iso.y)) * 0.11
        + texture2D(map, zUv + mot) * 0.13
        + texture2D(map, zUv - mot) * 0.13;
    }
    gl_FragColor = toGrayscale(texColor * vec4(color, opacity * a), grayscale);`,
    );
  mat.userData.presence = true;
  mat.needsUpdate = true;
}

export function Frame({
  capture,
  slot,
  focusedId,
  focusPos,
  reducedMotion,
  quality,
  transition,
  interactive = true,
  loadTexture = true,
  loadPriority = Number.MAX_SAFE_INTEGER,
  playVideo = false,
  didDragRef,
  onFocus,
  onHover,
}: FrameProps) {
  const { gl, invalidate, pointer } = useThree();
  const groupRef = useRef<THREE.Group>(null);
  const imageRef = useRef<THREE.Mesh>(null);
  const videoMeshRef = useRef<THREE.Mesh>(null);
  const videoEl = useRef<HTMLVideoElement | null>(null);
  const isFocused = focusedId === capture.id;
  const requestedEdge = isFocused ? FOCUSED_TEXTURE_EDGE : quality.textureEdge;
  const [texture, setTexture] = useState<THREE.Texture | null>(() =>
    peekTexture(mediaUrl(capture.id)),
  );
  const [videoTexture, setVideoTexture] = useState<THREE.VideoTexture | null>(
    null,
  );
  const [w, h] = slot.size;
  const hovered = useRef(false);
  const animationActive = useRef(true);
  const scaleCurrent = useRef(
    transition && !reducedMotion
      ? transition.role === "incoming"
        ? 0.001
        : 1
      : 0.86,
  );
  const textureEntered = useRef(false);
  const px = useRef(slot.position[0]);
  const py = useRef(slot.position[1]);
  const pz = useRef(slot.position[2] + transitionOffset(transition));
  const qTarget = useRef(new THREE.Quaternion());
  const euler = useRef(new THREE.Euler());
  const src = mediaUrl(capture.id);
  const clip = motionOf(capture.id);

  useEffect(() => {
    if (transition?.role === "outgoing" || !loadTexture) return;
    const ready = peekTexture(src, requestedEdge);
    if (ready) {
      setTexture(ready);
      return;
    }
    let alive = true;
    let request: ReturnType<typeof loadCaptureTexture> | null = null;
    const timer = window.setTimeout(() => {
      request = loadCaptureTexture(
        src,
        requestedEdge,
        isFocused ? -1 : loadPriority,
      );
      void request.promise
        .then((tex) => {
          if (!alive) return;
          tex.needsUpdate = true;
          animationActive.current = true;
          setTexture(tex);
        })
        .catch(() => undefined);
    }, 70);
    return () => {
      alive = false;
      window.clearTimeout(timer);
      request?.cancel();
    };
  }, [
    isFocused,
    loadTexture,
    requestedEdge,
    src,
    transition?.role,
  ]);

  useEffect(() => {
    if (!texture) return;
    const anisotropy = Math.min(
      quality.anisotropy,
      gl.capabilities.getMaxAnisotropy(),
    );
    if (texture.anisotropy === anisotropy) return;
    texture.anisotropy = anisotropy;
    texture.needsUpdate = true;
    invalidate();
  }, [gl, invalidate, quality.anisotropy, texture]);

  useEffect(() => {
    if (focusedId === capture.id && texture) {
      gl.domElement.dataset.focusedCaptureId = String(capture.id);
      gl.domElement.dataset.focusedTextureEdge = String(
        Number(texture.userData.maxEdge) || 0,
      );
    } else if (gl.domElement.dataset.focusedCaptureId === String(capture.id)) {
      delete gl.domElement.dataset.focusedCaptureId;
      delete gl.domElement.dataset.focusedTextureEdge;
    }
  }, [capture.id, focusedId, gl, texture]);
  useEffect(() => {
    if (!interactive || reducedMotion || !clip || !playVideo) return;
    let disposed = false;
    const video = document.createElement("video");
    video.muted = true;
    video.defaultMuted = true;
    video.loop = true;
    video.playsInline = true;
    video.preload = "auto";
    video.crossOrigin = "anonymous";
    video.setAttribute("playsinline", "true");
    video.setAttribute("muted", "");
    video.src = mediaUrl(capture.id, true);
    const videoSrc = video.src;
    if (focusedId === capture.id) {
      gl.domElement.dataset.focusedVideoSrc = videoSrc;
    }
    const tex = new THREE.VideoTexture(video);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.minFilter = THREE.LinearFilter;
    tex.magFilter = THREE.LinearFilter;
    tex.generateMipmaps = false;
    tex.anisotropy = Math.min(
      quality.anisotropy,
      gl.capabilities.getMaxAnisotropy(),
    );
    videoEl.current = video;
    const arm = () => {
      if (disposed || video.videoWidth < 2) return;
      setVideoTexture(tex);
      if (focusedId === capture.id) {
        gl.domElement.dataset.focusedVideoActive = "true";
      }
      void video.play().catch(() => undefined);
    };
    video.addEventListener("playing", arm);
    void video.play().catch(() => undefined);
    return () => {
      disposed = true;
      video.pause();
      video.removeAttribute("src");
      video.load();
      tex.dispose();
      videoEl.current = null;
      setVideoTexture(null);
      if (gl.domElement.dataset.focusedVideoSrc === videoSrc) {
        delete gl.domElement.dataset.focusedVideoSrc;
        delete gl.domElement.dataset.focusedVideoActive;
      }
    };
  }, [
    capture.id,
    clip,
    focusedId,
    gl,
    interactive,
    playVideo,
    quality.anisotropy,
    reducedMotion,
  ]);

  useEffect(() => {
    const video = videoEl.current;
    if (!video) return;
    const dimmed = Boolean(focusedId) && focusedId !== capture.id;
    if (dimmed || reducedMotion) {
      video.pause();
      return;
    }
    void video.play().catch(() => undefined);
  }, [capture.id, focusedId, reducedMotion]);

  useEffect(() => {
    animationActive.current = true;
    invalidate();
  }, [focusedId, invalidate, quality.blur, slot, transition]);
  useFrame((_, delta) => {
    const dt = Math.min(delta, 0.1);
    const group = groupRef.current;
    if (!group) return;
    if (!animationActive.current && !videoTexture) return;
    const isFocused = focusedId === capture.id;
    const dimmed = Boolean(focusedId) && !isFocused;
    const rest = slot.position;
    const idleZ = rest[2];
    const nx = reducedMotion || !isFocused ? 0 : pointer.x;
    const ny = reducedMotion || !isFocused ? 0 : pointer.y;

    let tx = rest[0];
    let ty = rest[1];
    let tz = idleZ;
    let rotX = 0;
    let rotY = 0;
    let targetScale = hovered.current && !isFocused && !dimmed ? 1.08 : 1;
    const transitionDelay =
      transition?.role === "incoming" && !reducedMotion
        ? (transition.direction === "out" ? 110 : 0) +
          Math.min(slot.rank, 24) * 7
        : 0;
    const transitionWaiting = Boolean(
      transition && performance.now() < transition.startedAt + transitionDelay,
    );
    const transitionScale = transition
      ? transition.role === "outgoing" || transitionWaiting
        ? 0.001
        : 1
      : 1;
    if (transition?.role === "outgoing") {
      tz = rest[2] + transitionOffset(transition);
    }
    let targetOpacity = 1;

    if (isFocused) {
      tx = rest[0] + nx * 0.07;
      ty = rest[1] + ny * 0.05;
      tz = rest[2] + 0.28;
      rotY = nx * 0.28;
      rotX = -ny * 0.18;
      targetScale = 1;
      targetOpacity = 1;
    } else if (dimmed) {
      const fx = focusPos?.[0] ?? rest[0];
      const fy = focusPos?.[1] ?? rest[1];
      const dist = Math.hypot(rest[0] - fx, rest[1] - fy);
      const recede = 0.85 + Math.min(2.4, dist * 0.32);
      tz = rest[2] - recede;
      targetScale = 0.9;
      targetOpacity = THREE.MathUtils.clamp(0.28 - dist * 0.03, 0.12, 0.32);
    } else if (hovered.current) {
      tz = idleZ + 0.18;
    }
    targetScale *= transitionScale;

    const follow = isFocused ? 10 : dimmed ? 7 : hovered.current ? 14 : 8;
    px.current = THREE.MathUtils.damp(px.current, tx, follow, dt);
    py.current = THREE.MathUtils.damp(py.current, ty, follow, dt);
    pz.current = THREE.MathUtils.damp(pz.current, tz, follow, dt);
    group.position.set(px.current, py.current, pz.current);

    euler.current.set(rotX, rotY, 0);
    qTarget.current.setFromEuler(euler.current);
    group.quaternion.slerp(
      qTarget.current,
      1 - Math.exp(-(isFocused ? 9 : 6) * dt),
    );

    const scaleFollow =
      transition?.role === "outgoing"
        ? transition.direction === "in"
          ? 28
          : 12
        : transition?.role === "incoming"
          ? 12
          : hovered.current || isFocused
            ? 14
            : 9;
    scaleCurrent.current = THREE.MathUtils.damp(
      scaleCurrent.current,
      targetScale,
      scaleFollow,
      dt,
    );
    group.scale.setScalar(scaleCurrent.current);

    const image = imageRef.current;
    const mat = image?.material as THREE.ShaderMaterial | undefined;
    if (mat && !mat.userData.presence) patchPresence(mat);
    if (mat?.uniforms?.opacity && !textureEntered.current) {
      mat.uniforms.opacity.value = 0;
      textureEntered.current = true;
    }
    if (mat?.uniforms?.opacity) {
      mat.uniforms.opacity.value = THREE.MathUtils.damp(
        mat.uniforms.opacity.value,
        targetOpacity,
        10,
        dt,
      );
    }
    if (mat?.uniforms?.grayscale) {
      mat.uniforms.grayscale.value = THREE.MathUtils.damp(
        mat.uniforms.grayscale.value,
        dimmed ? 0.22 : 0,
        8,
        dt,
      );
    }
    if (mat?.uniforms?.blur) {
      mat.uniforms.blur.value = THREE.MathUtils.damp(
        mat.uniforms.blur.value,
        quality.blur && dimmed && !reducedMotion ? 1 : 0,
        7,
        dt,
      );
    }
    if (mat?.uniforms?.blurDir && dimmed && focusPos) {
      const dx = rest[0] - focusPos[0];
      const dy = rest[1] - focusPos[1];
      const len = Math.hypot(dx, dy) || 1;
      mat.uniforms.blurDir.value.set((dx / len) * 0.028, (dy / len) * 0.02);
    }
    const videoMesh = videoMeshRef.current;
    const videoMat = videoMesh?.material as THREE.MeshBasicMaterial | undefined;
    if (videoMat) {
      videoMat.opacity = THREE.MathUtils.damp(
        videoMat.opacity,
        dimmed ? targetOpacity : videoTexture ? 1 : 0,
        10,
        dt,
      );
    }
    const positionMoving =
      Math.abs(px.current - tx) +
        Math.abs(py.current - ty) +
        Math.abs(pz.current - tz) >
      0.001;
    const scaleMoving = Math.abs(scaleCurrent.current - targetScale) > 0.001;
    const rotationMoving = group.quaternion.angleTo(qTarget.current) > 0.001;
    const opacityMoving = Boolean(
      mat?.uniforms?.opacity &&
      Math.abs(mat.uniforms.opacity.value - targetOpacity) > 0.002,
    );
    if (
      positionMoving ||
      scaleMoving ||
      rotationMoving ||
      opacityMoving ||
      videoTexture ||
      transitionWaiting
    ) {
      invalidate();
    } else {
      animationActive.current = false;
    }
  });

  return (
    <group
      ref={groupRef}
      scale={scaleCurrent.current}
      position={slot.position}
      onPointerOver={
        interactive
          ? (event) => {
              event.stopPropagation();
              hovered.current = true;
              animationActive.current = true;
              gl.domElement.style.cursor = "pointer";
              sfx.contact("paper");
              invalidate();
              onHover(capture.id);
              gl.domElement.dataset.hoveredCaptureId = String(capture.id);
            }
          : undefined
      }
      onPointerOut={
        interactive
          ? () => {
              hovered.current = false;
              animationActive.current = true;
              gl.domElement.style.cursor = "auto";
              onHover(null);
              if (
                gl.domElement.dataset.hoveredCaptureId === String(capture.id)
              ) {
                delete gl.domElement.dataset.hoveredCaptureId;
              }
              invalidate();
            }
          : undefined
      }
      onPointerMove={
        interactive
          ? () => {
              if (focusedId !== capture.id) return;
              animationActive.current = true;
              invalidate();
            }
          : undefined
      }
      onPointerDown={interactive ? () => sfx.press("paper") : undefined}
      onClick={
        interactive
          ? (event) => {
              event.stopPropagation();
              if (didDragRef.current) return;
              onFocus(capture.id);
            }
          : undefined
      }
    >
      {!texture && (
        <mesh
          geometry={PLANE_GEOMETRY}
          material={PLACEHOLDER_MATERIAL}
          scale={[w, h, 1]}
          position={[0, 0, -0.01]}
          dispose={null}
        />
      )}
      {texture && (
        <Image
          ref={imageRef}
          texture={texture}
          scale={[w, h]}
          toneMapped={false}
          transparent
          side={THREE.DoubleSide}
        />
      )}
      {videoTexture && (
        <mesh
          ref={videoMeshRef}
          geometry={PLANE_GEOMETRY}
          dispose={null}
          scale={[w, h, 1]}
          position={[0, 0, 0.01]}
        >
          <meshBasicMaterial
            map={videoTexture}
            toneMapped={false}
            transparent
            opacity={0}
            side={THREE.DoubleSide}
          />
        </mesh>
      )}
    </group>
  );
}
