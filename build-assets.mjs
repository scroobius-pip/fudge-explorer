import { cp, mkdir, rm } from "node:fs/promises";

const output = new URL("./public/", import.meta.url);
await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
await Promise.all([
  cp(new URL("./explorer.html", import.meta.url), new URL("./index.html", output)),
  cp(new URL("./theme-registry.js", import.meta.url), new URL("./theme-registry.js", output)),
]);
