export type Axis = "x" | "y" | "z" | "r" | "0";
export type Material = "paper" | "wood" | "glass" | "string";

export type Impulse = {
  axis: Axis;
  d: number;
  v: number;
  inbound: boolean;
  transmit: boolean;
  material: Material;
  x: number;
  y: number;
  enter: number;
  leave: number;
};

type Listener = (impulse: Impulse) => void;

const listeners = new Set<Listener>();
let last: Impulse | null = null;
let pointer = { x: 0, y: 0 };

export function lastImpulse() {
  return last;
}

export function pointerAt() {
  return pointer;
}

export function trackPointer() {
  if (typeof window === "undefined") return;
  window.addEventListener(
    "pointermove",
    (event) => {
      pointer.x = event.clientX;
      pointer.y = event.clientY;
    },
    { passive: true },
  );
}

export function onImpulse(listener: Listener) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function strike(partial: Partial<Impulse> & Pick<Impulse, "transmit" | "axis">): Impulse {
  const impulse: Impulse = {
    d: 1,
    v: 1,
    inbound: true,
    material: "paper",
    x: pointer.x,
    y: pointer.y,
    enter: 0,
    leave: 0,
    ...partial,
  };
  last = impulse;
  listeners.forEach((listener) => listener(impulse));
  return impulse;
}

export function delayOf(rank: number, impulse: Impulse | null, count: number) {
  if (!impulse || !impulse.transmit) return 0;
  const step = 0.012 + (0.06 * Math.min(impulse.d, 3)) / Math.max(6, count);
  return Math.min(rank, 18) * step;
}

export function slideOf(axis: Axis, inbound: boolean) {
  if (axis === "x") return inbound ? "-16px, 0px" : "16px, 0px";
  if (axis === "y") return inbound ? "0px, -12px" : "0px, 12px";
  if (axis === "z") return inbound ? "0px, 14px" : "0px, -10px";
  if (axis === "r") return inbound ? "0px, 8px" : "0px, -8px";
  return "0px, 8px";
}
