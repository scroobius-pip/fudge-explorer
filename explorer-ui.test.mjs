import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");
const [storeSrc, mainSrc, htmlSrc, appSrc, fontsSrc, fontPreviewSrc, fontSourceSrc, captureSrc, catalogSrc, termsSrc, metaSrc, sharedSrc, utilSrc, indexesSrc, css] = await Promise.all([
  read("./src/data/store.js"),
  read("./src/main.js"),
  read("./explorer.html"),
  read("./src/components/explorer-app.js"),
  read("./src/data/fonts.js"),
  read("./src/components/font-preview.js"),
  read("./src/components/font-source.js"),
  read("./src/views/capture.js"),
  read("./src/views/catalog.js"),
  read("./src/views/terms.js"),
  read("./src/views/meta.js"),
  read("./src/views/shared.js"),
  read("./src/data/util.js"),
  read("./src/data/indexes.js"),
  read("./src/explorer.css"),
]);

test("wires on-demand similarity without adding it to bundle startup", () => {
  assert.match(captureSrc, /loadSimilarity\("capture:" \+ id, "\/v1\/similar-captures"/);
  assert.match(catalogSrc, /loadSimilarity\("font:" \+ target\[0\], "\/v1\/similar-fonts"/);
  assert.match(storeSrc, /url\.searchParams\.set\("generation", this\.data\.observed_generation\)/);
  assert.match(catalogSrc, /Lower distance is closer/);
  assert.match(fontPreviewSrc, /rendering specimen/);
  assert.match(fontPreviewSrc, /server specimen/);
  assert.match(fontPreviewSrc, /preview unavailable/);
  const lookup = catalogSrc.slice(catalogSrc.indexOf("export async function vFontLookup"), catalogSrc.indexOf("export function vEmbeddings"));
  assert.match(lookup, /<font-preview releaseFallback \.result=\$\{r\}>/);
  assert.match(lookup, /<font-preview releaseFallback \.result=\$\{\{ familyId: target\[0\], familyName: target\[1\]/);
  assert.doesNotMatch(lookup, /specimenCss\(name\)/);
  assert.doesNotMatch(storeSrc, /\/v1\/similar-captures/);
});

test("uses imperative live-font loading without changing raster previews", () => {
  assert.match(fontsSrc, /new FontFace\(entry\.face, entry\.src/);
  assert.match(fontsSrc, /document\.fonts\.add\(loaded\)/);
  assert.match(fontsSrc, /document\.fonts\.delete\(entry\.fontFace\)/);
  assert.match(fontSourceSrc, /data-font-load-state/);
  assert.match(fontSourceSrc, /loading source/);
  assert.match(fontSourceSrc, /load failed/);
  assert.doesNotMatch(css, /@font-face\{/);
  assert.doesNotMatch(fontsSrc, /@font-face\{/);
});

test("loads effects, term values, and schema columns on demand", () => {
  assert.match(captureSrc, /"\/v1\/capture-evidence"/);
  assert.match(termsSrc, /"\/v1\/term-values"/);
  assert.match(metaSrc, /"\/v1\/relation-columns"/);
  assert.match(captureSrc, /Measured effects/);
  assert.match(sharedSrc, /termEvidenceNote/);
});

test("does not shadow text-style fields while aggregating", () => {
  const aggregate = indexesSrc.slice(
    indexesSrc.indexOf("export function aggregateTextStyles"),
    indexesSrc.indexOf("export function buildIndexes"),
  );
  assert.doesNotMatch(aggregate, /const style = styles\.get/);
  assert.match(aggregate, /const aggregate = styles\.get/);
});

test("uses the conventional font specimen string", () => {
  assert.match(utilSrc, /Hamburgefontsiv 0123456789/);
  assert.doesNotMatch(utilSrc, /const specTxt = \(\) => "Aa Bb Cc/);
});

test("renders catalogue families with source-specific specimens", () => {
  assert.match(utilSrc, /familyPreviewUrl/);
  assert.match(catalogSrc, /font-preview-hero/);
  assert.match(catalogSrc, /familyPreviewUrl\(f\[0\]\)/);
  assert.match(catalogSrc, /releaseFallback/);
  assert.match(fontPreviewSrc, /"\/v1\/family-font-source"/);
  assert.match(fontPreviewSrc, /loadVerifiedReleaseFont/);
  assert.match(fontPreviewSrc, /verified pinned release specimen/);
  assert.doesNotMatch(fontPreviewSrc, /font-preview-mode/);
  assert.match(fontPreviewSrc, /font-preview-unavailable/);
  assert.match(fontPreviewSrc, /No verified font file for catalogue family #/);
  assert.match(fontsSrc, /crypto\.subtle\.digest\("SHA-256", buffer\)/);
  assert.match(fontsSrc, /buffer\.byteLength !== entry\.source\.byteLength/);
  assert.match(catalogSrc, /designer source/);
  assert.match(catalogSrc, /vendor source/);
  assert.doesNotMatch(catalogSrc, /font-specimen/);
});

test("keeps term evidence and scope navigation quiet", () => {
  assert.doesNotMatch(termsSrc, /capture-evidence-value/);
  assert.doesNotMatch(termsSrc, /prominent: true/);
  assert.match(termsSrc, /palette-mini/);
  assert.doesNotMatch(sharedSrc, /context-nav-grid/);
  assert.match(sharedSrc, /L\.filter\(route, kind/);
  assert.match(sharedSrc, /termId\.startsWith\("color\.role\."\)/);
  assert.doesNotMatch(sharedSrc, /items\.push\(html`\$\{L\.fs/);
  assert.match(metaSrc, /class="system-links"/);
  assert.match(metaSrc, /L\.fs\("Font similarity"\)/);
  assert.match(metaSrc, /L\.rel\("Schema"\)/);
  assert.match(metaSrc, /L\.run\("Runtime"\)/);
  assert.doesNotMatch(metaSrc, /system-nav-link/);
});

test("uses the main app Fudge splash with real phased progress", () => {
  assert.match(storeSrc, /phaseUrl\("bootstrap"\)/);
  assert.match(storeSrc, /phaseUrl\("details", generation\)/);
  assert.match(storeSrc, /application\/x-fudge-explorer-stream/);
  assert.match(storeSrc, /response\.body\?\.getReader/);
  assert.match(storeSrc, /event\.type === "progress"/);
  assert.match(storeSrc, /event\.type === "bundle"/);
  assert.match(storeSrc, /loadedBytes !== bundleBytes/);
  assert.match(htmlSrc, /id="app-splash" role="progressbar"/);
  assert.match(htmlSrc, />Fudge<span id="app-splash-dot">\.<\/span>/);
  assert.match(htmlSrc, /#app-splash \{[\s\S]*position:fixed;[\s\S]*background:#0b0b0b/);
  assert.match(htmlSrc, /id="app-splash-progress-fill"/);
  assert.match(htmlSrc, /color:#f7552b/);
  assert.match(mainSrc, /updateSplashProgress\(100\)/);
  assert.match(mainSrc, /app-splash--dismissing/);
  assert.doesNotMatch(appSrc, /startup-loader|heroui-spinner/);
  assert.match(appSrc, /aria-busy=/);
  assert.doesNotMatch(css, /startup-loader|heroui-spinner/);
});
