import { resolveComposition } from "../algebra/resolve.ts";
import type {
  CompositionContext,
  CompositionGraph,
  CompositionKind,
  CompositionNode,
  CompositionState,
  InputModality,
  StateTransition,
} from "../algebra/types.ts";
import { FeedbackRuntime } from "./feedback.ts";

export const TRANSITION_EVENT = "fudge-composition-transition";

export class CompositionController {
  #root: HTMLElement;
  #feedback = new FeedbackRuntime();
  #observer: MutationObserver;
  #inputModality: InputModality = "programmatic";

  constructor(root: HTMLElement) {
    this.#root = root;
    this.#observer = new MutationObserver(() => this.resolve());
    this.#observer.observe(root, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ["data-state", "required", "disabled"],
    });
    root.addEventListener(TRANSITION_EVENT, this.#onTransition as EventListener);
    root.addEventListener("pointerdown", this.#onPointer, true);
    root.addEventListener("keydown", this.#onKeyboard, true);
    this.resolve();
  }

  disconnect() {
    this.#observer.disconnect();
    this.#root.removeEventListener(
      TRANSITION_EVENT,
      this.#onTransition as EventListener,
    );
    this.#root.removeEventListener("pointerdown", this.#onPointer, true);
    this.#root.removeEventListener("keydown", this.#onKeyboard, true);
  }

  resolve(transitions: StateTransition[] = []) {
    const graph = collectCompositionGraph(this.#root);
    const plan = resolveComposition(graph, this.#context(), transitions);
    for (const node of Object.values(plan.nodes)) {
      const element = this.#root.querySelector<HTMLElement>(
        `[data-compose-id="${CSS.escape(node.id)}"]`,
      );
      if (!element) continue;
      element.dataset.spaceBefore = node.spaceBefore;
      element.dataset.visualState = node.visualState;
      element.toggleAttribute("data-reserve-message", node.reserveMessageSpace);
    }
    this.#feedback.play(this.#root, plan.feedback);
  }

  #context(): CompositionContext {
    return {
      density:
        this.#root.dataset.density === "compact" ? "compact" : "comfortable",
      inputModality: this.#inputModality,
      reducedMotion: matchMedia("(prefers-reduced-motion: reduce)").matches,
      soundEnabled: this.#root.dataset.sound !== "off",
      hapticsEnabled: this.#root.dataset.haptics !== "off",
      userActivated: navigator.userActivation?.hasBeenActive ?? false,
    };
  }

  #onTransition = (event: CustomEvent<StateTransition>) => {
    this.resolve([event.detail]);
  };

  #onPointer = (event: PointerEvent) => {
    this.#inputModality = event.pointerType === "touch" ? "touch" : "pointer";
  };

  #onKeyboard = () => {
    this.#inputModality = "keyboard";
  };
}

export function transitionElement(
  element: HTMLElement,
  to: CompositionState,
) {
  const from = readState(element);
  if (from === to) return;
  element.dataset.state = to;
  element.dispatchEvent(
    new CustomEvent<StateTransition>(TRANSITION_EVENT, {
      bubbles: true,
      composed: true,
      detail: {
        id: ensureId(element),
        kind: readKind(element),
        from,
        to,
      },
    }),
  );
}

export function collectCompositionGraph(root: HTMLElement): CompositionGraph {
  const elements = [
    root,
    ...root.querySelectorAll<HTMLElement>("[data-compose-kind]"),
  ].filter(
    (element, index, all) =>
      element.hasAttribute("data-compose-kind") && all.indexOf(element) === index,
  );
  for (const element of elements) ensureId(element);
  const nodes: CompositionNode[] = elements.map((element) => {
    const parent = element.parentElement?.closest<HTMLElement>(
      "[data-compose-kind]",
    );
    const siblings = elements.filter(
      (candidate) =>
        candidate !== root &&
        candidate.parentElement?.closest("[data-compose-kind]") === parent,
    );
    return {
      id: ensureId(element),
      kind: readKind(element),
      parentId: element === root ? null : parent ? ensureId(parent) : ensureId(root),
      order: element === root ? 0 : Math.max(0, siblings.indexOf(element)),
      state: readState(element),
      required: element.hasAttribute("required"),
    };
  });
  return { rootId: ensureId(root), nodes };
}

let nextId = 0;

function ensureId(element: HTMLElement) {
  element.dataset.composeId ||= `fudge-${++nextId}`;
  return element.dataset.composeId;
}

function readKind(element: HTMLElement): CompositionKind {
  return (element.dataset.composeKind || "control") as CompositionKind;
}

function readState(element: HTMLElement): CompositionState {
  return (element.dataset.state || "idle") as CompositionState;
}
