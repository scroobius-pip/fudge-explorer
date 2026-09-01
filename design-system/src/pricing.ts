import "./index.ts";
import "./home.css";
import "./site.css";
import type { FudgeDialog } from "./components/fudge-dialog.ts";
import {
  bindPeriodControls,
  bindSite,
  PRICES,
  rememberPlan,
  takePlan,
  type Plan,
} from "./site.ts";

bindSite(document);
const selected = takePlan();
bindPeriodControls(document, selected.period);

const dialog = document.querySelector<FudgeDialog>("#purchase-dialog");
const copy = document.querySelector("#purchase-copy");

document.addEventListener("click", (event) => {
  const planButton = (event.target as HTMLElement).closest("[data-plan]");
  if (!(planButton instanceof HTMLElement)) return;
  const plan = planButton.dataset.plan;
  if (plan !== "pro" && plan !== "studio") return;
  const period = takePlan().period;
  rememberPlan(plan as Plan, period);
  const price = PRICES[period][plan];
  if (copy) {
    copy.textContent = `${plan === "pro" ? "Pro" : "Studio"} · ${price.note} Sign in if needed, then return to the prompt or reference you started with.`;
  }
  dialog?.open();
});
