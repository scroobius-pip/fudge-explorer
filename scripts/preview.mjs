import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";

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
    const mediaMatch = url.pathname.match(/^\/v1\/media\/([1-9]\d*)(\.webm)?$/);
    if (mediaMatch) {
      const upstream = await fetch(
        `https://pin.fontofweb.com/${mediaMatch[1]}${mediaMatch[2] || ""}`,
      );
      res.writeHead(upstream.status, {
        "content-type": upstream.headers.get("content-type") || "application/octet-stream",
        "cache-control": "public, max-age=86400",
      });
      if (!upstream.body) {
        res.end();
        return;
      }
      const reader = upstream.body.getReader();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        res.write(Buffer.from(value));
      }
      res.end();
      return;
    }
    if (url.pathname.startsWith("/v1/")) {
      const upstream = await fetch(UPSTREAM + url.pathname + url.search, {
        method: req.method,
        headers: {
          accept: req.headers.accept || "*/*",
          "content-type": req.headers["content-type"] || "application/json",
        },
        body: req.method === "GET" || req.method === "HEAD" ? undefined : await readBody(req),
      });
      res.writeHead(upstream.status, {
        "content-type": upstream.headers.get("content-type") || "application/json",
        "cache-control": upstream.headers.get("cache-control") || "no-store",
      });
      res.flushHeaders?.();
      if (!upstream.body) {
        res.end();
        return;
      }
      const reader = upstream.body.getReader();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        res.write(Buffer.from(value));
      }
      res.end();
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

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}
