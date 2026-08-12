import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const EXPECTED_GENERATION = 70_524;
const EXPECTED_CAPTURE_COUNT = 10_426;
const EXPECTED_PAIR_COUNT = 103_704;
const EXPECTED_SHA256 = "5bdeca803e0e1bf47ce73587cd5238368a0bb6935734e0a74d65e4008caf4e08";
export const QUERY = `legacy[capture_id, rgb_integer] :=
  *historical_capture_color_observation{capture_id, legacy_color_id},
  *historical_color_value{legacy_color_id, rgb_integer},
  capture_id != null

?[capture_id, collect(rgb_integer)] :=
  legacy[capture_id, rgb_integer],
  capture_id > $after_capture_id
:order capture_id
:limit 2000`;
const CAPTURE_528_COLORS = [
  1_314_577,
  1_915_735,
  5_257_256,
  9_348_326,
  9_917_222,
  10_058_337,
  13_540_454,
  13_612_962,
  16_053_494,
];

const inputPaths = process.argv.slice(2);
if (inputPaths.length === 0) {
  console.error("Usage: node export_legacy_colors.mjs <query-result.json> [...]\n\n" + QUERY);
  process.exit(1);
}

const captures = new Map();

for (const inputPath of inputPaths) {
  const response = JSON.parse(readFileSync(inputPath, "utf8"));
  const rows = response.result?.rows;

  if (response.observedGeneration !== EXPECTED_GENERATION) {
    throw new Error(`${inputPath}: unexpected generation ${response.observedGeneration}`);
  }
  if (response.truncated !== false || !Array.isArray(rows)) {
    throw new Error(`${inputPath}: incomplete or invalid query result`);
  }
  if (response.returnedRows !== rows.length) {
    throw new Error(`${inputPath}: returnedRows does not match rows.length`);
  }

  for (const [captureId, colors] of rows) {
    if (!Number.isInteger(captureId) || !Array.isArray(colors)) {
      throw new Error(`${inputPath}: invalid capture row`);
    }
    if (captures.has(captureId)) {
      throw new Error(`${inputPath}: duplicate capture ${captureId}`);
    }
    if (!colors.every(Number.isInteger)) {
      throw new Error(`${inputPath}: invalid RGB value for capture ${captureId}`);
    }
    if (colors.some((value) => value < 0 || value > 0xffffff)) throw new Error(`${inputPath}: RGB out of range for capture ${captureId}`);

    captures.set(captureId, [...new Set(colors)].sort((a, b) => a - b));
  }
}

const captureIds = [...captures.keys()].sort((a, b) => a - b);
const pairCount = [...captures.values()].reduce((sum, colors) => sum + colors.length, 0);
if (captureIds.length !== EXPECTED_CAPTURE_COUNT || pairCount !== EXPECTED_PAIR_COUNT) {
  throw new Error(
    `incomplete aggregate: ${captureIds.length} captures and ${pairCount} pairs; expected ${EXPECTED_CAPTURE_COUNT} and ${EXPECTED_PAIR_COUNT}`,
  );
}

const capture528 = captures.get(528);
if (
  capture528?.length !== CAPTURE_528_COLORS.length ||
  !CAPTURE_528_COLORS.every((rgb, index) => capture528[index] === rgb)
) {
  throw new Error("capture 528 does not contain exactly its nine known colors");
}

const output = Object.fromEntries(captureIds.map((captureId) => [captureId, captures.get(captureId)]));
const outputPath = fileURLToPath(new URL("legacy_colors.json", import.meta.url));
const json = JSON.stringify(output);
const { createHash } = await import("node:crypto");
const digest = createHash("sha256").update(json).digest("hex");
if (digest !== EXPECTED_SHA256) throw new Error(`unexpected output digest ${digest}`);
writeFileSync(outputPath, json);

console.log(`${outputPath}: ${captureIds.length} captures`);
