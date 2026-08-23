import type {
  CompositionContext,
  CompositionGraph,
  CompositionKind,
  CompositionNode,
  CompositionPlan,
  FeedbackEvent,
  FeedbackPlan,
  SpaceRole,
  StateTransition,
} from "./types.ts";

export function resolveComposition(
  graph: CompositionGraph,
  context: CompositionContext,
  transitions: StateTransition[] = [],
): CompositionPlan {
  validateGraph(graph);
  const byId = new Map(graph.nodes.map((node) => [node.id, node]));
  const children = groupChildren(graph.nodes);
  const nodes = Object.fromEntries(
    graph.nodes.map((node) => {
      const siblings = children.get(node.parentId) ?? [];
      const index = siblings.findIndex((sibling) => sibling.id === node.id);
      return [
        node.id,
        {
          id: node.id,
          spaceBefore: deriveSpace(node, siblings[index - 1], byId),
          visualState: node.state,
          reserveMessageSpace: node.kind === "field",
        },
      ];
    }),
  );
  return {
    nodes,
    feedback: transitions.flatMap((transition) =>
      deriveFeedback(transition, context),
    ),
  };
}

function deriveSpace(
  node: CompositionNode,
  previous: CompositionNode | undefined,
  byId: Map<string, CompositionNode>,
): SpaceRole {
  if (!previous) return "none";
  const parent = node.parentId ? byId.get(node.parentId) : undefined;
  if (node.kind === "message") return "support";
  if (parent?.kind === "field") return "control";
  if (node.kind === "action") return "section";
  if (node.kind === "field") {
    return previous.kind === "heading" ? "section" : "field";
  }
  if (node.kind === "heading") return "section";
  return "control";
}

function deriveFeedback(
  transition: StateTransition,
  context: CompositionContext,
): FeedbackPlan[] {
  const event = transitionEvent(transition);
  if (!event) return [];
  const active = context.userActivated;
  const pointerLike =
    context.inputModality === "pointer" || context.inputModality === "touch";
  const formFailure = transition.kind === "form" && event === "reject";
  const motion = context.reducedMotion
    ? "none"
    : event === "focus"
      ? "lift"
      : event === "submit"
        ? "compress"
        : event === "confirm"
          ? "advance"
          : event === "reject"
            ? "boundary"
            : "none";
  return [
    {
      event,
      sourceId: transition.id,
      visual:
        event === "focus"
          ? "focus"
          : event === "submit"
            ? "pending"
            : event === "confirm"
              ? "success"
              : event === "reject"
                ? "error"
                : "muted",
      motion,
      sound:
        !context.soundEnabled || !active
          ? "none"
          : event === "submit" && pointerLike
            ? "contact"
            : event === "confirm"
              ? "confirm"
              : formFailure
                ? "reject"
                : "none",
      haptic:
        !context.hapticsEnabled || !active
          ? "none"
          : event === "submit" && pointerLike
            ? "selection"
            : event === "confirm"
              ? "confirm"
              : event === "reject"
                ? "boundary"
                : "none",
    },
  ];
}

function transitionEvent(transition: StateTransition): FeedbackEvent | null {
  if (transition.to === transition.from) return null;
  if (transition.to === "focused") return "focus";
  if (transition.to === "submitting") return "submit";
  if (transition.to === "success") return "confirm";
  if (transition.to === "invalid" || transition.to === "failure") {
    return "reject";
  }
  if (transition.to === "disabled") return "disable";
  return null;
}

function groupChildren(nodes: CompositionNode[]) {
  const grouped = new Map<string | null, CompositionNode[]>();
  for (const node of nodes) {
    const siblings = grouped.get(node.parentId) ?? [];
    siblings.push(node);
    grouped.set(node.parentId, siblings);
  }
  for (const siblings of grouped.values()) {
    siblings.sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));
  }
  return grouped;
}

function validateGraph(graph: CompositionGraph) {
  const ids = new Set<string>();
  for (const node of graph.nodes) {
    if (ids.has(node.id)) throw new Error(`Duplicate composition id: ${node.id}`);
    ids.add(node.id);
  }
  if (!ids.has(graph.rootId)) throw new Error("Composition root is missing");
  const byId = new Map(graph.nodes.map((node) => [node.id, node]));
  for (const node of graph.nodes) {
    if (node.parentId != null && !byId.has(node.parentId)) {
      throw new Error(`Missing composition parent: ${node.parentId}`);
    }
    const seen = new Set([node.id]);
    let parentId = node.parentId;
    while (parentId != null) {
      if (seen.has(parentId)) throw new Error(`Composition cycle at: ${node.id}`);
      seen.add(parentId);
      parentId = byId.get(parentId)?.parentId ?? null;
    }
  }
}
