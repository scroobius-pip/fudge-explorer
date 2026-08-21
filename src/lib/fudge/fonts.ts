export function normalizeObservedFontFamily(family: string): string {
  const normalized = family.normalize("NFKC").trim().replace(/\s+/g, " ");
  if (
    normalized.length >= 2
    && normalized[0] === normalized.at(-1)
    && (normalized[0] === "'" || normalized[0] === "\"")
  ) {
    return normalized.slice(1, -1).trim();
  }
  return normalized;
}

export function observedFontFamilyKey(family: string): string {
  return normalizeObservedFontFamily(family).toLocaleLowerCase("en-US");
}

export function cssFont(family: string) {
  const safe = family.replace(/['"]/g, "").trim();
  if (/^sans$/i.test(safe)) return "ui-sans-serif, system-ui, sans-serif";
  if (/^serif$/i.test(safe)) return "ui-serif, Georgia, 'Times New Roman', serif";
  if (/^(mono|monospace)$/i.test(safe)) return "ui-monospace, Menlo, Consolas, monospace";
  return `"${safe}", system-ui, sans-serif`;
}
