import { onImpulse } from "@/lib/impulse";

export type HapticKind = "selection" | "impact" | "boundary";

type Listener = (enabled: boolean) => void;

const STORAGE_KEY = "fudge-explorer:haptics";
const PATTERNS: Record<HapticKind, number | number[]> = {
  selection: 7,
  impact: 12,
  boundary: [10, 32, 10],
};

class HapticFeedback {
  private enabled = readEnabled();
  private wired = false;
  private lastPulse = 0;
  private listeners = new Set<Listener>();

  supported() {
    return (
      typeof navigator !== "undefined" &&
      typeof navigator.vibrate === "function"
    );
  }

  getEnabled() {
    return this.enabled;
  }

  subscribe(listener: Listener) {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  setEnabled(enabled: boolean) {
    this.enabled = enabled;
    try {
      window.localStorage.setItem(STORAGE_KEY, enabled ? "on" : "off");
    } catch {
      // The control still works when storage is unavailable.
    }
    for (const listener of this.listeners) listener(enabled);
    if (enabled) this.selection();
    else this.cancel();
  }

  unlock() {
    if (this.wired) return;
    this.wired = true;
    onImpulse((impulse) => {
      this.pulse(impulse.transmit ? "impact" : "boundary");
    });
  }

  selection() {
    this.pulse("selection");
  }

  private pulse(kind: HapticKind) {
    if (
      !this.enabled ||
      !this.supported() ||
      document.visibilityState !== "visible"
    ) {
      return;
    }
    const now = performance.now();
    if (now - this.lastPulse < 45) return;
    this.lastPulse = now;
    try {
      navigator.vibrate(PATTERNS[kind]);
    } catch {
      // Browsers may expose Vibration API while denying it at runtime.
    }
  }

  private cancel() {
    if (!this.supported()) return;
    try {
      navigator.vibrate(0);
    } catch {
      // Browsers may expose Vibration API while denying it at runtime.
    }
  }
}

function readEnabled() {
  if (typeof window === "undefined") return true;
  try {
    return window.localStorage.getItem(STORAGE_KEY) !== "off";
  } catch {
    return true;
  }
}

export const haptics = new HapticFeedback();
