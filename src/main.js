import "./views/index.js";
import "./components/explorer-app.js";
import { store } from "./data/store.js";

const app = document.querySelector("explorer-app") ?? document.createElement("explorer-app");
if (!app.isConnected) document.body.appendChild(app);

window.FudgeExplorer = {
  reload: () => store.reload(),
  configure(options = {}) {
    Object.assign(store.config, options);
    return store.reload();
  },
};

store.addEventListener("progress", () => updateSplashProgress(store.progress.value));
store.addEventListener("bootstrap-ready", () => dismissSplash(true));
store.addEventListener("bootstrap-error", () => dismissSplash(false));
store.reload();

function updateSplashProgress(value) {
  const splash = document.querySelector("#app-splash");
  const fill = document.querySelector("#app-splash-progress-fill");
  const output = document.querySelector("#app-splash-progress-value");
  if (!splash || !fill || !output) return;
  const next = Math.max(Number(splash.getAttribute("aria-valuenow")) || 0, Math.min(100, Math.round(value || 0)));
  splash.setAttribute("aria-valuenow", String(next));
  fill.style.width = next + "%";
  output.textContent = next + "%";
}

function dismissSplash(complete) {
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      const splash = document.querySelector("#app-splash");
      if (!splash) return;
      if (complete) updateSplashProgress(100);
      setTimeout(() => {
        splash.addEventListener("transitionend", () => splash.remove(), { once: true });
        splash.classList.add("app-splash--dismissing");
      }, complete ? 200 : 0);
    });
  });
}
