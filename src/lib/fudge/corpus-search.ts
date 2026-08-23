import type { CatalogFile, SearchHit } from "./types";

type RankedHit = { hit: SearchHit; score: number };

export function searchCatalogSnapshot(
  catalog: CatalogFile,
  query: string,
): { label: string; items: SearchHit[] }[] {
  const normalized = normalize(query);
  if (!normalized) return [];
  const tokens = normalized.split(" ");
  const termMeta = new Map(
    catalog.facets.flatMap((facet) =>
      facet.terms.map(
        (term) => [term.id, { label: term.label, facet: facet.label }] as const,
      ),
    ),
  );
  const domains = new Map<string, number>();
  for (const capture of catalog.captures) {
    domains.set(capture.origin, (domains.get(capture.origin) ?? 0) + 1);
  }

  const captures = ranked(
    catalog.captures
      .filter((capture) => {
        const text = catalog.searchTextByCapture[String(capture.id)] ?? "";
        return tokens.every((token) => text.includes(token));
      })
      .map((capture) => ({
        hit: {
          kind: "capture" as const,
          id: String(capture.id),
          title: capture.title,
          sub: host(capture.origin),
        },
        score: Math.max(
          180,
          score(
            normalized,
            capture.title,
            host(capture.origin),
            capture.origin,
          ),
        ),
      })),
    8,
  );
  const terms = ranked(
    [...termMeta].flatMap(([id, meta]) => {
      if (
        !normalize(meta.label).includes(normalized) &&
        !normalize(id).includes(normalized)
      ) {
        return [];
      }
      const hit: SearchHit = {
        kind: "term",
        id,
        title: meta.label,
        sub: `${meta.facet} · ${catalog.termCaptureIds[id]?.length ?? 0}`,
      };
      return [{ hit, score: score(normalized, meta.label, id) }];
    }),
    8,
  );
  const facets = ranked(
    catalog.facets.flatMap((facet) => {
      if (
        !normalize(facet.label).includes(normalized) &&
        !normalize(facet.id).includes(normalized)
      ) {
        return [];
      }
      const hit: SearchHit = {
        kind: "facet",
        id: facet.id,
        title: facet.label,
        sub: facet.group,
      };
      return [{ hit, score: score(normalized, facet.label, facet.id) }];
    }),
    5,
  );
  const fonts = ranked(
    Object.values(catalog.fontCaptureIndex).flatMap((entry) => {
      if (!normalize(entry.name).includes(normalized)) return [];
      const hit: SearchHit = {
        kind: "font",
        id: entry.name,
        title: entry.name,
        sub: `${entry.ids.length} captures`,
      };
      return [{ hit, score: score(normalized, entry.name) }];
    }),
    6,
  );
  const domainHits = ranked(
    [...domains].flatMap(([origin, count]) => {
      const title = host(origin);
      if (!normalize(title).includes(normalized)) return [];
      const hit: SearchHit = {
        kind: "domain",
        id: origin,
        title,
        sub: `${count} captures`,
      };
      return [{ hit, score: score(normalized, title, origin) }];
    }),
    5,
  );

  return [
    { label: "Captures", rows: captures },
    { label: "Terms", rows: terms },
    { label: "Facets", rows: facets },
    { label: "Fonts", rows: fonts },
    { label: "Domains", rows: domainHits },
  ]
    .filter((group) => group.rows.length > 0)
    .sort(
      (a, b) =>
        (b.rows[0]?.score ?? 0) - (a.rows[0]?.score ?? 0) ||
        a.label.localeCompare(b.label),
    )
    .map((group) => ({
      label: group.label,
      items: group.rows.map((row) => row.hit),
    }));
}

function normalize(value: string) {
  return value
    .normalize("NFKC")
    .toLocaleLowerCase("en-US")
    .replace(/[_-]+/g, " ")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function score(query: string, ...values: string[]) {
  const compactQuery = query.replace(/\s+/g, "");
  let best = 0;
  for (const raw of values) {
    const value = normalize(raw);
    if (!value) continue;
    const compact = value.replace(/\s+/g, "");
    if (value === query) best = Math.max(best, 1_000);
    else if (compact === compactQuery) best = Math.max(best, 960);
    else if (value.startsWith(query))
      best = Math.max(best, 840 - Math.min(120, value.length - query.length));
    else {
      const index = value.indexOf(query);
      if (index >= 0) best = Math.max(best, 700 - Math.min(240, index * 4));
    }
    const queryTokens = query.split(" ");
    const words = new Set(value.split(" "));
    const exact = queryTokens.filter((token) => words.has(token)).length;
    best = Math.max(best, (exact / queryTokens.length) * 520);
  }
  return best;
}

function ranked(rows: RankedHit[], limit: number) {
  return rows
    .sort(
      (a, b) =>
        b.score - a.score ||
        a.hit.title.localeCompare(b.hit.title) ||
        a.hit.id.localeCompare(b.hit.id),
    )
    .slice(0, limit);
}

function host(origin: string) {
  try {
    return new URL(origin).hostname.replace(/^www\./, "");
  } catch {
    return origin.replace(/^https?:\/\//, "").split("/")[0] ?? origin;
  }
}
