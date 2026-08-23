import type { FeedbackPlan } from "../algebra/types.ts";

const HAPTICS: Record<
  Exclude<FeedbackPlan["haptic"], "none">,
  number | number[]
> = {
  selection: 7,
  confirm: [8, 24, 12],
  boundary: [10, 28, 10],
};

export class FeedbackRuntime {
  #context: AudioContext | null = null;
  #master: GainNode | null = null;

  play(root: HTMLElement, plans: FeedbackPlan[]) {
    for (const plan of plans) {
      const source = root.querySelector<HTMLElement>(
        `[data-compose-id="${CSS.escape(plan.sourceId)}"]`,
      );
      if (source && plan.motion !== "none") {
        source.dataset.feedbackMotion = plan.motion;
        source.addEventListener(
          "animationend",
          () => delete source.dataset.feedbackMotion,
          { once: true },
        );
      }
      if (plan.sound !== "none") this.#sound(plan.sound);
      if (plan.haptic !== "none") this.#haptic(plan.haptic);
    }
  }

  #sound(kind: Exclude<FeedbackPlan["sound"], "none">) {
    const context = this.#ensureAudio();
    if (!context || !navigator.userActivation?.hasBeenActive) return;
    if (context.state === "suspended") void context.resume();
    const now = context.currentTime;
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    const config =
      kind === "confirm"
        ? { from: 480, to: 720, duration: 0.14, level: 0.026 }
        : kind === "reject"
          ? { from: 190, to: 125, duration: 0.12, level: 0.022 }
          : { from: 360, to: 300, duration: 0.055, level: 0.014 };
    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(config.from, now);
    oscillator.frequency.exponentialRampToValueAtTime(
      config.to,
      now + config.duration,
    );
    gain.gain.setValueAtTime(0.000001, now);
    gain.gain.exponentialRampToValueAtTime(config.level, now + 0.008);
    gain.gain.exponentialRampToValueAtTime(
      0.000001,
      now + config.duration,
    );
    gain.gain.setValueAtTime(0, now + config.duration + 0.015);
    oscillator.connect(gain);
    gain.connect(this.#master!);
    oscillator.start(now);
    oscillator.stop(now + config.duration + 0.02);
  }

  #haptic(kind: Exclude<FeedbackPlan["haptic"], "none">) {
    if (
      typeof navigator.vibrate !== "function" ||
      !navigator.userActivation?.hasBeenActive ||
      document.visibilityState !== "visible"
    ) {
      return;
    }
    navigator.vibrate(HAPTICS[kind]);
  }

  #ensureAudio() {
    if (!this.#context) {
      this.#context = new AudioContext();
      this.#master = this.#context.createGain();
      this.#master.gain.value = 0.32;
      this.#master.connect(this.#context.destination);
    }
    return this.#context;
  }
}
