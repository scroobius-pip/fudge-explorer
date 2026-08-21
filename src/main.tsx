import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";

const rootElement = document.getElementById("root");
if (!rootElement) throw new Error("Explorer root element is missing");

const splash = document.getElementById("app-splash");
const dismissSplash = () => {
  if (!splash || splash.classList.contains("is-dismissing")) return;
  splash.classList.add("is-dismissing");
  window.setTimeout(() => splash.remove(), 360);
};
window.addEventListener("fudge:grid-ready", dismissSplash, { once: true });

type LoadProgress = {
  value: number;
  label: string;
};

window.addEventListener("fudge:load-progress", (event) => {
  const { value, label } = (event as CustomEvent<LoadProgress>).detail;
  const progress = document.querySelector<HTMLElement>(".boot-progress-track");
  const fill = document.querySelector<HTMLElement>("[data-load-fill]");
  const output = document.querySelector<HTMLOutputElement>("[data-load-value]");
  const copy = document.querySelector<HTMLElement>("[data-load-label]");
  progress?.setAttribute("aria-valuenow", String(value));
  if (fill) fill.style.width = `${value}%`;
  if (output) output.value = `${value}%`;
  if (copy) copy.textContent = label;
});

const root = createRoot(rootElement);

import("@/components/experience")
  .then(({ FieldExperience }) => {
    root.render(
      <StrictMode>
        <FieldExperience />
      </StrictMode>,
    );
  })
  .catch((error: unknown) => {
    dismissSplash();
    const detail =
      error instanceof Error ? error.message : "Unknown loading error";
    root.render(
      <main className="grid min-h-dvh place-items-center bg-bg px-6 text-fg">
        <section className="max-w-lg text-center">
          <p className="font-display text-5xl tracking-tight">Fudge</p>
          <h1 className="mt-8 text-lg font-medium">
            The Explorer could not load
          </h1>
          <p className="mt-2 text-sm leading-6 text-muted">{detail}</p>
          <button
            type="button"
            className="mt-6 min-h-11 rounded-full border border-line px-5 text-sm hover:bg-fg/10"
            onClick={() => window.location.reload()}
          >
            Try again
          </button>
        </section>
      </main>,
    );
  });
