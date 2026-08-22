import {
  formatDate,
  groupedTerms,
  hexSwatch,
  historicalFontsOf,
  isKnown,
  namedFonts,
  paletteOf,
  pxSize,
  typeRolesOf,
  textStylesOf,
} from "@/lib/fudge/catalog";
import { typographySummaries } from "@/lib/fudge/move";
import type { Capture } from "@/lib/fudge/types";

function externalText(value: string | null | undefined) {
  return String(value ?? "")
    .replace(/[\u0000-\u001f\u007f]+/g, " ")
    .trim();
}

function percentage(partsPerMillion: number) {
  return `${Math.round(partsPerMillion / 1_000) / 10}%`;
}

function lowerInitial(value: string) {
  return value ? `${value[0]!.toLocaleLowerCase()}${value.slice(1)}` : value;
}

function naturalList(values: string[]) {
  if (values.length < 2) return values[0] ?? "";
  if (values.length === 2) return `${values[0]} and ${values[1]}`;
  return `${values.slice(0, -1).join(", ")}, and ${values.at(-1)}`;
}

function captureDescription(
  capture: Capture,
  groups: ReturnType<typeof groupedTerms>,
) {
  const terms = (groupId: string) =>
    (groups.find((group) => group.id === groupId)?.terms ?? [])
      .map((term) => term.label)
      .filter(Boolean)
      .sort((a, b) => a.localeCompare(b))
      .map(lowerInitial);
  const purpose = terms("purpose");
  const structure = terms("structure");
  const visual = terms("visual");
  const typeMedia = terms("type_media");
  const state = terms("state");
  const location =
    !capture.path || capture.path === "/"
      ? `${capture.host} homepage`
      : `${capture.host}${capture.path}`;
  let lead = `This${isKnown(capture.device) ? ` ${externalText(capture.device)}` : ""} capture shows ${location}`;
  if (capture.title) lead += `, titled “${externalText(capture.title)}”`;
  if (capture.viewportWidth && capture.viewportHeight) {
    lead += `, at ${capture.viewportWidth}×${capture.viewportHeight}`;
  }
  const sentences = [`${lead}.`];
  if (purpose.length) {
    sentences.push(`The page focuses on ${naturalList(purpose)}.`);
  }
  if (structure.length) {
    sentences.push(`The layout includes ${naturalList(structure)}.`);
  }
  if (visual.length) {
    sentences.push(`Visible design details include ${naturalList(visual)}.`);
  }
  if (typeMedia.length) {
    sentences.push(`Visible media includes ${naturalList(typeMedia)}.`);
  }
  if (state.length) {
    sentences.push(`It is shown in ${naturalList(state)}.`);
  }
  return sentences.join(" ");
}

export function captureHandoffReferences(capture: Capture) {
  const guideSlug = encodeURIComponent(capture.host.toLowerCase());
  return {
    screenshot: `https://pin.fontofweb.com/${capture.id}?format=jpg`,
    designGuide: `https://design.withfudge.com/share/${guideSlug}-design.md`,
  };
}

export function buildCaptureHandoffPrompt(capture: Capture) {
  const references = captureHandoffReferences(capture);
  const title = externalText(capture.title) || `${capture.host} capture`;
  const source = capture.pageUrl || capture.origin;
  const termGroups = groupedTerms(capture.id);
  const description = captureDescription(capture, termGroups);
  const captureContext = [
    `- Website: ${capture.host}`,
    capture.path ? `- Page path: ${capture.path}` : "",
    source ? `- Original page: ${source}` : "",
    capture.capturedAt ? `- Captured: ${formatDate(capture.capturedAt)}` : "",
    capture.viewportWidth && capture.viewportHeight
      ? `- Viewport: ${capture.viewportWidth}×${capture.viewportHeight}`
      : "",
    isKnown(capture.device) ? `- Device: ${externalText(capture.device)}` : "",
    isKnown(capture.theme) ? `- Theme: ${externalText(capture.theme)}` : "",
    isKnown(capture.state) ? `- State: ${externalText(capture.state)}` : "",
  ].filter(Boolean);

  const colors = paletteOf(capture.id)
    .slice()
    .sort(
      (a, b) =>
        b.coverage - a.coverage || hexSwatch(a).localeCompare(hexSwatch(b)),
    )
    .slice(0, 8)
    .map((swatch) => `${hexSwatch(swatch)} (${percentage(swatch.coverage)})`);

  const roles = typeRolesOf(capture.id);
  const fonts = typographySummaries(
    textStylesOf(capture.id),
    roles,
    namedFonts(capture.id),
    historicalFontsOf(capture.id),
  )
    .slice(0, 8)
    .map((font) => {
      const details = [
        font.roles.length ? `roles ${font.roles.join(", ")}` : "",
        font.weights.length ? `weight ${font.weights.join("–")}` : "",
        font.sizes.length
          ? `sizes ${font.sizes.map(pxSize).filter(Boolean).join("–")}`
          : "",
        font.styles ? `${font.styles} styles` : "",
        font.uses ? `${font.uses} uses` : "",
        font.note ?? "",
      ].filter(Boolean);
      return `- ${font.family}${details.length ? ` — ${details.join(", ")}` : ""}`;
    });

  const typography = roles
    .slice()
    .sort(
      (a, b) =>
        a.role.localeCompare(b.role) || a.family.localeCompare(b.family),
    )
    .slice(0, 10)
    .map(
      (role) =>
        `- ${role.role}: ${role.family}, weight ${role.weight}${
          role.size ? `, ${pxSize(role.size)}` : ""
        }`,
    );

  const designSections = [
    colors.length
      ? `## Dominant palette\n${colors.map((color) => `- ${color}`).join("\n")}`
      : "",
    fonts.length ? `## Typography\n${fonts.join("\n")}` : "",
    typography.length ? `## Type roles\n${typography.join("\n")}` : "",
  ].filter(Boolean);

  return `# ${title}

## Capture description
${description}

## Page context
${captureContext.join("\n")}

${designSections.length ? `${designSections.join("\n\n")}\n\n` : ""}## Reference material
- Primary screenshot: ${references.screenshot}
- Full ${capture.host} design guide: ${references.designGuide}
${source ? `- Original page: ${source}\n` : ""}
The screenshot and design guide are the public references for this page. The guide covers the broader site-level color system, typography, layout, visual language, components, and responsive behavior.`;
}
