import type { SearchHit } from "./types";
import {
  SEARCH_SUGGESTION_MODEL,
  SEARCH_SUGGESTION_SOURCE_COUNT,
  SEARCH_SUGGESTION_WEIGHTS,
} from "./search-suggestions.model.ts";
import {
  makeSuggestionCandidate,
  makeSuggestionQuery,
  normalizeSuggestionText,
} from "./search-suggestion-features.ts";
import { SuggestionCandidateIndex } from "./search-suggestion-index.ts";
import { rankSuggestionCandidateIds } from "./search-suggestion-ranker.ts";

type SearchGroup = { label: string; items: SearchHit[] };
const DEFAULT_LIMIT = 6;
const MAX_RANKED = 12;
const FILTER_GROUPS = new Set(["Terms", "Fonts", "Domains"]);
const CANDIDATES = SEARCH_SUGGESTION_MODEL.map((term, rank) =>
  makeSuggestionCandidate(term, rank, SEARCH_SUGGESTION_SOURCE_COUNT),
);
const CANDIDATE_INDEX = new SuggestionCandidateIndex(CANDIDATES);

export function suggestSearchQueries(
  value: string,
  limit = DEFAULT_LIMIT,
): SearchHit[] {
  return rankSuggestionTerms(value, limit).map((term) => ({
    kind: "search",
    id: term,
    title: term,
    sub: "Suggested search",
  }));
}

export function withSearchSuggestions(
  query: string,
  groups: SearchGroup[],
): SearchGroup[] {
  const normalized = normalizeSuggestionText(query);
  const filterGroups = groups.filter((group) => FILTER_GROUPS.has(group.label));
  const otherGroups = groups.filter((group) => !FILTER_GROUPS.has(group.label));
  const filterItemCount = filterGroups.reduce(
    (total, group) => total + group.items.length,
    0,
  );
  const suggestionLimit =
    normalized.length < 3
      ? 2
      : filterItemCount > 0
        ? 2
        : groups.length > 0
          ? 4
          : 6;
  const existing = new Set(
    groups.flatMap((group) =>
      group.items.flatMap((item) => [
        normalizeSuggestionText(item.title),
        normalizeSuggestionText(item.id),
      ]),
    ),
  );
  const suggestions = rankSuggestionTerms(query, MAX_RANKED)
    .filter((term) => !existing.has(term))
    .slice(0, suggestionLimit)
    .map((term) => ({
      kind: "search" as const,
      id: term,
      title: term,
      sub: "Suggested search",
    }));
  if (suggestions.length === 0) return groups;

  const suggestionGroup = { label: "Suggestions", items: suggestions };
  return filterGroups.length > 0
    ? [...filterGroups, suggestionGroup, ...otherGroups]
    : [suggestionGroup, ...otherGroups];
}

function rankSuggestionTerms(value: string, limit: number): string[] {
  const query = makeSuggestionQuery(value);
  if (!query || !Number.isFinite(limit) || limit < 1) return [];

  const boundedLimit = Math.min(MAX_RANKED, Math.floor(limit));
  return rankSuggestionCandidateIds(
    query,
    CANDIDATES,
    CANDIDATE_INDEX,
    SEARCH_SUGGESTION_WEIGHTS,
    boundedLimit,
  ).map((index) => CANDIDATES[index]!.term);
}

