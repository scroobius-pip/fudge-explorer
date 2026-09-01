import type {
  SuggestionCandidate,
  SuggestionQuery,
} from "./search-suggestion-features";
import {
  plausibleSuggestion,
  weightedSuggestionScore,
  writeSuggestionFeatures,
} from "./search-suggestion-features.ts";
import { SuggestionCandidateIndex } from "./search-suggestion-index.ts";

type RankedSuggestion = { index: number; score: number };
const SHORTLIST_LIMIT = 256;

export function rankSuggestionCandidateIds(
  query: SuggestionQuery,
  candidates: SuggestionCandidate[],
  candidateIndex: SuggestionCandidateIndex,
  weights: readonly number[],
  limit: number,
): number[] {
  const features = new Float64Array(weights.length);
  const shortlistIds = new Uint16Array(SHORTLIST_LIMIT);
  const shortlistScores = new Float64Array(SHORTLIST_LIMIT);
  let shortlistSize = 0;

  for (const index of candidateIndex.retrieve(query)) {
    const candidate = candidates[index]!;
    if (
      candidate.term === query.normalized ||
      !plausibleSuggestion(query, candidate)
    ) {
      continue;
    }
    writeSuggestionFeatures(query, candidate, features, false);
    const score = weightedSuggestionScore(features, weights);
    if (shortlistSize < SHORTLIST_LIMIT) {
      shortlistIds[shortlistSize] = index;
      shortlistScores[shortlistSize] = score;
      bubbleWorstUp(shortlistIds, shortlistScores, shortlistSize);
      shortlistSize += 1;
    } else if (isBetter(score, index, shortlistScores[0]!, shortlistIds[0]!)) {
      shortlistIds[0] = index;
      shortlistScores[0] = score;
      bubbleWorstDown(shortlistIds, shortlistScores, shortlistSize, 0);
    }
  }

  const top: RankedSuggestion[] = [];
  for (let shortlistIndex = 0; shortlistIndex < shortlistSize; shortlistIndex += 1) {
    const index = shortlistIds[shortlistIndex]!;
    writeSuggestionFeatures(query, candidates[index]!, features);
    insertRanked(
      top,
      { index, score: weightedSuggestionScore(features, weights) },
      limit,
    );
  }
  return top.map(({ index }) => index);
}

function bubbleWorstUp(
  ids: Uint16Array,
  scores: Float64Array,
  startIndex: number,
) {
  let index = startIndex;
  while (index > 0) {
    const parent = (index - 1) >> 1;
    if (!isWorse(scores[index]!, ids[index]!, scores[parent]!, ids[parent]!)) {
      break;
    }
    swap(ids, scores, index, parent);
    index = parent;
  }
}

function bubbleWorstDown(
  ids: Uint16Array,
  scores: Float64Array,
  size: number,
  startIndex: number,
) {
  let index = startIndex;
  while (true) {
    const left = index * 2 + 1;
    if (left >= size) return;
    const right = left + 1;
    let worst = left;
    if (
      right < size &&
      isWorse(scores[right]!, ids[right]!, scores[left]!, ids[left]!)
    ) {
      worst = right;
    }
    if (!isWorse(scores[worst]!, ids[worst]!, scores[index]!, ids[index]!)) {
      return;
    }
    swap(ids, scores, index, worst);
    index = worst;
  }
}

function swap(
  ids: Uint16Array,
  scores: Float64Array,
  a: number,
  b: number,
) {
  const id = ids[a]!;
  const score = scores[a]!;
  ids[a] = ids[b]!;
  scores[a] = scores[b]!;
  ids[b] = id;
  scores[b] = score;
}

function isBetter(
  score: number,
  index: number,
  otherScore: number,
  otherIndex: number,
) {
  return score > otherScore || (score === otherScore && index < otherIndex);
}

function isWorse(
  score: number,
  index: number,
  otherScore: number,
  otherIndex: number,
) {
  return score < otherScore || (score === otherScore && index > otherIndex);
}

function insertRanked(
  top: RankedSuggestion[],
  candidate: RankedSuggestion,
  limit: number,
) {
  let index = 0;
  while (
    index < top.length &&
    isBetter(top[index]!.score, top[index]!.index, candidate.score, candidate.index)
  ) {
    index += 1;
  }
  if (index >= limit) return;
  top.splice(index, 0, candidate);
  if (top.length > limit) top.pop();
}
