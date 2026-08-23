import "./system.css";
import "./components/fudge-form.ts";
import "./components/fudge-heading.ts";
import "./components/fudge-field.ts";
import "./components/fudge-action.ts";

export * from "./algebra/types.ts";
export * from "./algebra/resolve.ts";
export * from "./runtime/composition.ts";
export type {
  FudgeSubmitDetail,
  SubmitResult,
} from "./components/fudge-form.ts";

import type { FudgeSubmitDetail } from "./components/fudge-form.ts";

const login = document.querySelector("#login-composition");
const status = document.querySelector<HTMLOutputElement>("#login-status");

login?.addEventListener("fudge-submit", (rawEvent) => {
  const event = rawEvent as CustomEvent<FudgeSubmitDetail>;
  event.preventDefault();
  if (status) status.value = "Checking your account…";
  window.setTimeout(() => {
    if (status) status.value = "Authentication handoff completed.";
    event.detail.complete("success");
  }, 650);
});
