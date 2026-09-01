import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const PORT = Number(process.env.PORT || 8791);
const ATLAS = fileURLToPath(
  new URL("../product-atlas/fudge-page-flow-atlas.html", import.meta.url),
);
const WIREFRAME = fileURLToPath(
  new URL(
    "../product-atlas/fudge-consolidated-site-wireframe.html",
    import.meta.url,
  ),
);

const HOST_CSS = `
:root {
  color-scheme: light;
  --background: #f2f0e9;
  --foreground: #1c1b17;
  --muted-foreground: #6f6d66;
  --border: color-mix(in oklab, #1c1b17 12%, #fbfaf6);
  --primary: #1c1b17;
  --primary-foreground: #fbfaf6;
  --destructive: #a53c2f;
  --ring: oklch(64.6% 0.222 41.116);
  --viz-series-1: #1c1b17;
  --viz-series-2: #c45a1a;
  --viz-series-3: #3d6b5a;
  --viz-series-4: #5b4a8a;
  --viz-series-5: #b4532a;
  --viz-series-6: #2f5f8a;
  font-family: "IBM Plex Sans", ui-sans-serif, system-ui, sans-serif;
}

* { box-sizing: border-box; }

html, body {
  margin: 0;
  min-height: 100%;
  background: var(--background);
  color: var(--foreground);
}

body { padding: 1.25rem; }

.preview-nav {
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem 1rem;
  margin: 0 0 1.25rem;
  padding-bottom: 0.85rem;
  border-bottom: 1px solid var(--border);
  font-size: 0.82rem;
}

.preview-nav a {
  color: var(--muted-foreground);
  text-decoration: none;
}

.preview-nav a[aria-current="page"],
.preview-nav a:hover { color: var(--foreground); }

.btn {
  appearance: none;
  min-height: 2.25rem;
  padding: 0.4rem 0.75rem;
  border: 1px solid var(--border);
  border-radius: 0.4rem;
  background: #fbfaf6;
  color: var(--foreground);
  font: inherit;
  cursor: pointer;
}

.btn-primary {
  background: var(--primary);
  color: var(--primary-foreground);
  border-color: var(--primary);
}

.viz-controls { display: flex; flex-wrap: wrap; gap: 0.45rem; }
.text-muted { color: var(--muted-foreground); }
.text-small { font-size: 0.8125rem; }
.table-responsive { overflow-x: auto; }
.table { width: 100%; border-collapse: collapse; font-size: 0.9rem; }
.table th, .table td {
  text-align: left;
  vertical-align: top;
  padding: 0.55rem 0.6rem;
  border-bottom: 1px solid var(--border);
}
.table-sm th, .table-sm td { padding: 0.4rem 0.5rem; }

.hub {
  max-width: 42rem;
  display: grid;
  gap: 1rem;
}

.hub a {
  display: grid;
  gap: 0.25rem;
  padding: 1rem 1.1rem;
  border: 1px solid var(--border);
  border-radius: 0.6rem;
  background: #fbfaf6;
  color: inherit;
  text-decoration: none;
}

.hub strong { font-size: 1.05rem; }
.hub span { color: var(--muted-foreground); font-size: 0.9rem; }
`;

function wrap(title, current, fragment) {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${title}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:ital,wght@0,400;0,500;0,600;1,400&display=swap" rel="stylesheet" />
  <style>${HOST_CSS}</style>
</head>
<body>
  <nav class="preview-nav" aria-label="Preview">
    <a href="/" ${current === "hub" ? 'aria-current="page"' : ""}>Hub</a>
    <a href="http://localhost:8790/composition.html">Design system</a>
    <a href="http://localhost:8790/">Landing</a>
    <a href="/atlas" ${current === "atlas" ? 'aria-current="page"' : ""}>Atlas</a>
    <a href="/wireframes" ${current === "wireframes" ? 'aria-current="page"' : ""}>Wireframes</a>
    <a href="http://localhost:8787/">Explorer</a>
  </nav>
  ${fragment}
</body>
</html>`;
}

const hub = wrap(
  "Fudge previews",
  "hub",
  `<main class="hub">
    <p class="text-muted">Local previews for the composition system, product atlas, and site wireframes.</p>
    <a href="http://localhost:8790/composition.html"><strong>Design system</strong><span>Composition algebra, surfaces, and explorer primitives.</span></a>
    <a href="http://localhost:8790/"><strong>Landing</strong><span>Home first fold and product page.</span></a>
    <a href="/atlas"><strong>Product atlas</strong><span>Page flows, transitions, templates, and screenshot evidence.</span></a>
    <a href="/wireframes"><strong>Wireframes</strong><span>Consolidated site wireframes for Home, Explorer, Chat, Pricing, and MCP setup.</span></a>
  </main>`,
);

createServer(async (req, res) => {
  const url = new URL(req.url || "/", "http://localhost");
  try {
    if (url.pathname === "/" || url.pathname === "/index.html") {
      res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      res.end(hub);
      return;
    }
    if (url.pathname === "/atlas") {
      const fragment = await readFile(ATLAS, "utf8");
      res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      res.end(wrap("Fudge Product Atlas", "atlas", fragment));
      return;
    }
    if (url.pathname === "/wireframes") {
      const fragment = await readFile(WIREFRAME, "utf8");
      res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      res.end(wrap("Fudge site wireframes", "wireframes", fragment));
      return;
    }
    res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    res.end("Not found");
  } catch (error) {
    res.writeHead(500, { "content-type": "text/plain; charset=utf-8" });
    res.end(error instanceof Error ? error.message : "Preview failed");
  }
}).listen(PORT, "127.0.0.1", () => {
  console.log(`Product docs preview on http://localhost:${PORT}`);
  console.log("  Atlas      http://localhost:" + PORT + "/atlas");
  console.log("  Wireframes http://localhost:" + PORT + "/wireframes");
});
