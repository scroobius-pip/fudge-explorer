const frame = document.querySelector<HTMLIFrameElement>("#explorer-frame");
const query = new URLSearchParams(location.search).get("q") || "";
const origin =
  location.port === "8790" || location.port === "8791"
    ? "http://localhost:8787"
    : location.origin;
const url = new URL(origin);
if (query) url.hash = query;
if (frame) frame.src = url.toString();
