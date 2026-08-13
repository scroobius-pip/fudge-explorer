import { cp, mkdir, rm } from "node:fs/promises";
import { build } from "esbuild";

const root = new URL("./", import.meta.url);
const output = new URL("./public/", import.meta.url);
await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
await Promise.all([
  cp(new URL("./explorer.html", root), new URL("./index.html", output)),
  cp(new URL("./src/explorer.css", root), new URL("./explorer.css", output)),
  cp(new URL("./theme-registry.js", root), new URL("./theme-registry.js", output)),
  cp(new URL("./pt-serif-latin-400-normal.woff2", root), new URL("./pt-serif-latin-400-normal.woff2", output)),
  build({
    entryPoints: [new URL("./src/main.js", root).pathname],
    bundle: true,
    format: "esm",
    outfile: new URL("./public/explorer.js", root).pathname,
    sourcemap: false,
    minify: true,
    target: "es2022",
    logLevel: "silent",
  }),
]);
