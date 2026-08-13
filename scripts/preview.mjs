import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import worker from "../worker.js";

const ROOT = new URL("../public/", import.meta.url);
const UPSTREAM = "https://explorer.withfudge.com";
const PORT = Number(process.env.PORT || 8788);

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
};

createServer(async (req, res) => {
  try {
    const url = new URL(req.url, "http://localhost");
    if (
      url.pathname === "/v1/family-font-source"
      || (url.pathname === "/v1/query" && req.method === "GET")
    ) {
      const response = await worker.fetch(new Request(url, { headers: req.headers }), {
        FUDGE_SERVICE: { fetch: productionQuery },
      });
      await sendResponse(res, response);
      return;
    }
    if (url.pathname.startsWith("/v1/")) {
      const upstream = await fetch(UPSTREAM + url.pathname + url.search, {
        method: req.method,
        headers: {
          accept: req.headers.accept || "*/*",
          "content-type": req.headers["content-type"] || "application/json",
        },
        body: req.method === "GET" ? undefined : await readBody(req),
      });
      res.writeHead(upstream.status, {
        "content-type": upstream.headers.get("content-type") || "application/json",
        "cache-control": upstream.headers.get("cache-control") || "no-store",
      });
      res.end(Buffer.from(await upstream.arrayBuffer()));
      return;
    }
    let path = url.pathname === "/" ? "index.html" : url.pathname.slice(1);
    path = normalize(path).replace(/^(\.\.(\/|\\|$))+/, "");
    const file = join(ROOT.pathname, path);
    const body = await readFile(file);
    res.writeHead(200, {
      "content-type": TYPES[extname(file)] || "application/octet-stream",
      "cache-control": "no-cache",
    });
    res.end(body);
  } catch {
    res.writeHead(404, { "content-type": "text/plain" });
    res.end("not found");
  }
}).listen(PORT, () => {
  console.log(`Explorer preview: http://localhost:${PORT} (proxying /v1/* to ${UPSTREAM})`);
});

async function productionQuery(request) {
  const query = await request.json();
  const { maxRows, maxBytes, ...body } = query;
  return fetch(UPSTREAM + "/v1/query", {
    method: "POST",
    headers: { accept: "application/json", "content-type": "application/json" },
    body: JSON.stringify({
      ...body,
      limits: { maxRows, maxBytes },
    }),
  });
}

async function sendResponse(res, response) {
  res.writeHead(response.status, Object.fromEntries(response.headers));
  if (!response.body) {
    res.end();
    return;
  }
  const reader = response.body.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    res.write(Buffer.from(value));
  }
  res.end();
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}
