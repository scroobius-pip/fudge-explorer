import "./index.ts";
import "./site.css";
import type { FudgeComposer, FudgeComposerSubmitDetail } from "./components/fudge-composer.ts";
import {
  bindSite,
  captureById,
  FIELD_CAPTURES,
  rememberPrompt,
  takeCapture,
  takePrompt,
} from "./site.ts";

bindSite(document);

const stream = document.querySelector("#chat-stream");
const title = document.querySelector("#chat-title");
const composer = document.querySelector<FudgeComposer>("fudge-composer");
const starters = document.querySelector(".chat-starters");

function append(role: "user" | "assistant", html: string) {
  const article = document.createElement("article");
  article.className = "chat-message";
  article.dataset.role = role;
  article.dataset.composeKind = role === "user" ? "message" : "surface";
  article.innerHTML = html;
  stream?.append(article);
  article.scrollIntoView({ block: "end" });
}

function answer(prompt: string) {
  const capture = captureById(takeCapture()) || FIELD_CAPTURES[6];
  const refs = FIELD_CAPTURES.slice(0, 3)
    .map(
      (item) =>
        `<fudge-capture capture-id="${item.id}" title="${item.title}" domain="${item.domain}" aspect-ratio="${item.aspect}" ${item.video ? "video" : ""}></fudge-capture>`,
    )
    .join("");
  append(
    "assistant",
    `<fudge-status>Opening the page · Checking the screenshot · Comparing references</fudge-status>
     <fudge-card>
       <fudge-card-header>
         <fudge-card-title>Use one billing control above two equal paid-plan cards.</fudge-card-title>
         <fudge-card-description>${prompt}</fudge-card-description>
       </fudge-card-header>
       <fudge-card-content>
         <p class="site-copy">${capture.title} from ${capture.domain} stays attached as evidence.</p>
         <div class="chat-refs">${refs}</div>
         <div class="chat-starters" style="margin-top:0.75rem">
           <fudge-button variant="ghost" data-explorer-link>Open focused reference in Explorer</fudge-button>
         </div>
       </fudge-card-content>
     </fudge-card>`,
  );
}

function ask(prompt: string) {
  rememberPrompt(prompt);
  starters?.remove();
  if (title) title.textContent = prompt.slice(0, 48);
  append("user", `<fudge-surface>${prompt}</fudge-surface>`);
  answer(prompt);
}

document.querySelector("[data-new-chat]")?.addEventListener("click", () => {
  sessionStorage.removeItem("fudge.prompt");
  location.assign("./chat.html");
});

const initial = takePrompt();
if (initial) {
  composer?.setPrompt(initial);
  ask(initial);
}

document.addEventListener("click", (event) => {
  const example = (event.target as HTMLElement).closest("[data-example]");
  if (example instanceof HTMLElement && example.dataset.example) {
    composer?.setPrompt(example.dataset.example);
    ask(example.dataset.example);
  }
});

composer?.addEventListener("fudge-submit", (raw) => {
  const event = raw as CustomEvent<FudgeComposerSubmitDetail>;
  event.preventDefault();
  ask(event.detail.prompt);
  event.detail.complete("success");
});
