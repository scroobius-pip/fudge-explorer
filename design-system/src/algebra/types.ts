export type CompositionKind =
  | "form"
  | "heading"
  | "field"
  | "control"
  | "message"
  | "action"
  | "surface"
  | "card"
  | "group"
  | "menu"
  | "item";
export type CompositionState =
  | "idle"
  | "focused"
  | "invalid"
  | "submitting"
  | "success"
  | "failure"
  | "disabled";

export type CompositionNode = {
  id: string;
  kind: CompositionKind;
  parentId: string | null;
  order: number;
  state: CompositionState;
  required?: boolean;
};

export type CompositionGraph = {
  rootId: string;
  nodes: CompositionNode[];
};

export type InputModality = "pointer" | "keyboard" | "touch" | "programmatic";

export type CompositionContext = {
  density: "compact" | "comfortable";
  inputModality: InputModality;
  reducedMotion: boolean;
  soundEnabled: boolean;
  hapticsEnabled: boolean;
  userActivated: boolean;
};

export type SpaceRole = "none" | "support" | "control" | "field" | "section";

export type NodePlan = {
  id: string;
  spaceBefore: SpaceRole;
  visualState: CompositionState;
  reserveMessageSpace: boolean;
};

export type FeedbackEvent =
  "focus" | "submit" | "confirm" | "reject" | "disable";

export type FeedbackPlan = {
  event: FeedbackEvent;
  sourceId: string;
  visual: "focus" | "pending" | "success" | "error" | "muted";
  motion: "none" | "lift" | "compress" | "advance" | "boundary";
  sound: "none" | "contact" | "confirm" | "reject";
  haptic: "none" | "selection" | "confirm" | "boundary";
};

export type CompositionPlan = {
  nodes: Record<string, NodePlan>;
  feedback: FeedbackPlan[];
};

export type StateTransition = {
  id: string;
  kind: CompositionKind;
  from: CompositionState;
  to: CompositionState;
};
