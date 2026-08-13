import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile(new URL("./explorer.html", import.meta.url), "utf8");

test("wires on-demand similarity without adding it to bundle startup", () => {
  assert.match(source, /loadSimilarity\("capture:" \+ id, "\/v1\/similar-captures"/);
  assert.match(source, /loadSimilarity\("font:" \+ target\[0\], "\/v1\/similar-fonts"/);
  assert.match(source, /url\.searchParams\.set\("generation", D_\.observed_generation\)/);
  assert.match(source, /Lower distance is closer/);
  assert.match(source, /function fontPreview\(result\)/);
  assert.match(source, /rendering specimen/);
  assert.match(source, /server specimen/);
  assert.match(source, /preview unavailable/);
  const lookup = source.slice(source.indexOf("async function vFontLookup"), source.indexOf("function vEmbeddings"));
  assert.match(lookup, /fontPreview\(r\)/);
  assert.match(lookup, /fontPreview\(Object\.assign\(\{ familyName:target\[1\] \}/);
  assert.doesNotMatch(lookup, /specimenCss\(name\)/);
  assert.doesNotMatch(source, /dataSource\.load[\s\S]{0,300}similar-captures/);
});

test("uses imperative live-font loading without changing raster previews", () => {
  assert.match(source, /new FontFace\(entry\.face, entry\.src/);
  assert.match(source, /document\.fonts\.add\(loaded\)/);
  assert.match(source, /document\.fonts\.delete\(entry\.fontFace\)/);
  assert.match(source, /data-font-load-state/);
  assert.match(source, /loading source/);
  assert.match(source, /load failed/);
  assert.doesNotMatch(source, /@font-face\{/);
  assert.match(source, /function fontPreview\(result\)/);
});

test("loads effects, term values, and schema columns on demand", () => {
  assert.match(source, /"\/v1\/capture-evidence"/);
  assert.match(source, /"\/v1\/term-values"/);
  assert.match(source, /"\/v1\/relation-columns"/);
  assert.match(source, /Measured effects/);
  assert.match(source, /termEvidenceNote/);
});

test("does not shadow text-style fields while aggregating", () => {
  const aggregate = source.slice(
    source.indexOf("function aggregateTextStyles"),
    source.indexOf("const PROJECTIONS"),
  );
  assert.doesNotMatch(aggregate, /const style = styles\.get/);
  assert.match(aggregate, /const aggregate = styles\.get/);
});

test("uses the conventional font specimen string", () => {
  assert.match(source, /Hamburgefontsiv 0123456789/);
  assert.doesNotMatch(source, /const specTxt = \(\) => "Aa Bb Cc/);
});
