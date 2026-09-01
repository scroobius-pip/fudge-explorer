import "./index.ts";
import type { FudgeSubmitDetail } from "./components/fudge-form.ts";
import type { FudgeComposerSubmitDetail } from "./components/fudge-composer.ts";
import type { FudgeDialog } from "./components/fudge-dialog.ts";

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

const composer = document.querySelector("#composer-composition");
const composerStatus = document.querySelector("fudge-status#composer-status");
composer?.addEventListener("fudge-submit", (rawEvent) => {
  const event = rawEvent as CustomEvent<FudgeComposerSubmitDetail>;
  event.preventDefault();
  if (composerStatus) {
    composerStatus.textContent = event.detail.prompt
      ? `Sending “${event.detail.prompt}”.`
      : "Sending attachment.";
  }
  window.setTimeout(() => {
    if (composerStatus) composerStatus.textContent = "Handoff completed.";
    event.detail.complete("success");
  }, 650);
});

const dialog = document.querySelector<FudgeDialog>("#capture-dialog");
const details = document.querySelector<HTMLElement>("#capture-details");
document.addEventListener("fudge-capture-open", (rawEvent) => {
  const event = rawEvent as CustomEvent<Record<string, string | boolean | null>>;
  if (!details || !dialog) return;
  const payload = event.detail;
  details.setAttribute("capture-id", String(payload.captureId || ""));
  details.setAttribute("title", String(payload.title || ""));
  details.setAttribute("domain", String(payload.domain || ""));
  if (payload.src) details.setAttribute("src", String(payload.src));
  if (payload.aspectRatio) details.setAttribute("aspect-ratio", String(payload.aspectRatio));
  if (payload.palette) details.setAttribute("palette", String(payload.palette));
  if (payload.fonts) details.setAttribute("fonts", String(payload.fonts));
  details.toggleAttribute("video", Boolean(payload.video));
  details.setAttribute("layout", "details");
  dialog.open();
});
