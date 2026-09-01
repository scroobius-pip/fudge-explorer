import "./index.ts";
import "./site.css";
import { bindSite } from "./site.ts";

bindSite(document);

const title = document.querySelector("#mcp-title");
const status = document.querySelector("#mcp-status");
const success = document.querySelector("#mcp-success");
const successTitle = document.querySelector("#mcp-success-title");
const copy = document.querySelector("#mcp-copy");
const connect = document.querySelector("#mcp-connect");
const code = document.querySelector("#mcp-code");

document.addEventListener("click", (event) => {
  const client = (event.target as HTMLElement).closest("[data-client]");
  if (!(client instanceof HTMLElement) || !client.dataset.client) return;
  document.querySelectorAll("[data-client]").forEach((node) => {
    node.setAttribute("variant", node === client ? "primary" : "secondary");
  });
  const name = client.dataset.client;
  if (title) title.textContent = `Install Fudge in ${name}`;
  if (status) status.textContent = `${name} stays selected through account or plan work.`;
  if (successTitle) successTitle.textContent = `${name} connected.`;
});

copy?.addEventListener("click", () => {
  const text = code?.textContent || "";
  void navigator.clipboard?.writeText(text);
  if (status) status.textContent = "Configuration copied.";
});

connect?.addEventListener("click", () => {
  success?.removeAttribute("hidden");
  if (status) status.textContent = "Connection confirmed. Ask a real question next.";
  success?.scrollIntoView({ block: "start" });
});
