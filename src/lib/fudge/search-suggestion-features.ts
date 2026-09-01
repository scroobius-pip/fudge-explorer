export const SUGGESTION_FEATURE_NAMES = [
  "sourceRank",
  "phrasePrefix",
  "wordPrefix",
  "orderedTokenPrefix",
  "bigramDice",
  "trigramDice",
  "commonPrefix",
  "lengthFit",
  "firstCharacter",
  "compactPrefix",
  "fuzzyTokenCoverage",
] as const;

export type SuggestionQuery = {
  normalized: string;
  compact: string;
  tokens: string[];
  bigramMask: number;
  bigramCount: number;
  trigramMask: number;
  trigramCount: number;
  editPrevious: Uint16Array;
  editCurrent: Uint16Array;
  editBeforePrevious: Uint16Array;
};

export type SuggestionCandidate = {
  term: string;
  compact: string;
  tokens: string[];
  rankPrior: number;
  bigramMask: number;
  bigramCount: number;
  trigramMask: number;
  trigramCount: number;
};

export function normalizeSuggestionText(value: string): string {
  return value
    .normalize("NFKC")
    .toLocaleLowerCase("en-US")
    .replace(/[_-]+/g, " ")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .replace(/\s+/g, " ");
}

export function makeSuggestionQuery(value: string): SuggestionQuery | null {
  const normalized = normalizeSuggestionText(value);
  if (normalized.length < 2) return null;
  const compact = normalized.replaceAll(" ", "");
  const bigramMask = ngramMask(compact, 2);
  const trigramMask = ngramMask(compact, 3);
  return {
    normalized,
    compact,
    tokens: normalized.split(" "),
    bigramMask,
    bigramCount: popcount(bigramMask),
    trigramMask,
    trigramCount: popcount(trigramMask),
    editPrevious: new Uint16Array(65),
    editCurrent: new Uint16Array(65),
    editBeforePrevious: new Uint16Array(65),
  };
}

export function makeSuggestionCandidate(
  term: string,
  rank: number,
  sourceCount: number,
): SuggestionCandidate {
  const compact = term.replaceAll(" ", "");
  const bigramMask = ngramMask(compact, 2);
  const trigramMask = ngramMask(compact, 3);
  return {
    term,
    compact,
    tokens: term.split(" "),
    rankPrior:
      1 - Math.log1p(Math.max(0, rank)) / Math.log1p(Math.max(1, sourceCount)),
    bigramMask,
    bigramCount: popcount(bigramMask),
    trigramMask,
    trigramCount: popcount(trigramMask),
  };
}

export function writeSuggestionFeatures(
  query: SuggestionQuery,
  candidate: SuggestionCandidate,
  output: Float64Array,
  includeFuzzy = true,
): Float64Array {
  const phrasePrefix = candidate.term.startsWith(query.normalized) ? 1 : 0;
  const wordPrefix = candidate.term.includes(` ${query.normalized}`) ? 1 : 0;
  output[0] = candidate.rankPrior;
  output[1] = phrasePrefix;
  output[2] = wordPrefix;
  output[3] = orderedTokenPrefixCoverage(candidate.term, query.tokens);
  output[4] = dice(
    query.bigramMask,
    query.bigramCount,
    candidate.bigramMask,
    candidate.bigramCount,
  );
  output[5] = dice(
    query.trigramMask,
    query.trigramCount,
    candidate.trigramMask,
    candidate.trigramCount,
  );
  output[6] = commonPrefixLength(query.normalized, candidate.term) / query.normalized.length;
  output[7] = Math.min(1, query.compact.length / Math.max(1, candidate.compact.length));
  output[8] = query.normalized[0] === candidate.term[0] ? 1 : 0;
  output[9] = candidate.compact.startsWith(query.compact) ? 1 : 0;
  output[10] = includeFuzzy
    ? fuzzyOrderedTokenCoverage(candidate.tokens, query)
    : 0;
  return output;
}

export function plausibleSuggestion(
  query: SuggestionQuery,
  candidate: SuggestionCandidate,
): boolean {
  if (
    candidate.term.startsWith(query.normalized) ||
    candidate.term.includes(` ${query.normalized}`)
  ) {
    return true;
  }
  if (query.normalized.length <= 2) return false;
  if (orderedTokenPrefixCoverage(candidate.term, query.tokens) >= 0.5) {
    return true;
  }
  const trigramOverlap = popcount(query.trigramMask & candidate.trigramMask);
  if (trigramOverlap > 0) return true;
  const bigramOverlap = popcount(query.bigramMask & candidate.bigramMask);
  return bigramOverlap >= Math.min(2, query.bigramCount);
}

export function weightedSuggestionScore(
  features: Float64Array,
  weights: readonly number[],
): number {
  let score = 0;
  for (let index = 0; index < features.length; index += 1) {
    score += features[index]! * (weights[index] ?? 0);
  }
  return score;
}

function orderedTokenPrefixCoverage(term: string, tokens: string[]): number {
  let cursor = 0;
  let matched = 0;
  for (const token of tokens) {
    while (cursor < term.length) {
      if (term.startsWith(token, cursor)) {
        matched += 1;
        const nextWord = term.indexOf(" ", cursor);
        cursor = nextWord < 0 ? term.length : nextWord + 1;
        break;
      }
      const nextWord = term.indexOf(" ", cursor);
      if (nextWord < 0) return matched / tokens.length;
      cursor = nextWord + 1;
    }
  }
  return matched / tokens.length;
}

function fuzzyOrderedTokenCoverage(
  candidateTokens: string[],
  query: SuggestionQuery,
): number {
  let cursor = 0;
  let total = 0;
  for (const queryToken of query.tokens) {
    let bestScore = 0;
    let bestIndex = -1;
    for (let index = cursor; index < candidateTokens.length; index += 1) {
      const score = tokenPrefixSimilarity(
        queryToken,
        candidateTokens[index]!,
        query,
      );
      if (score > bestScore) {
        bestScore = score;
        bestIndex = index;
      }
    }
    if (bestIndex >= 0) cursor = bestIndex + 1;
    total += bestScore;
  }
  return total / query.tokens.length;
}

function tokenPrefixSimilarity(
  queryToken: string,
  candidate: string,
  query: SuggestionQuery,
): number {
  if (candidate.startsWith(queryToken)) return 1;
  const minimum = Math.max(1, queryToken.length - 2);
  const maximum = Math.min(candidate.length, queryToken.length + 2);
  let best = 0;
  for (let length = minimum; length <= maximum; length += 1) {
    const distance = damerauLevenshteinPrefix(
      queryToken,
      candidate,
      length,
      query,
    );
    best = Math.max(
      best,
      1 - distance / Math.max(queryToken.length, length),
    );
  }
  return best;
}

function damerauLevenshteinPrefix(
  queryText: string,
  candidate: string,
  candidateLength: number,
  query: SuggestionQuery,
): number {
  const previous = query.editPrevious;
  const current = query.editCurrent;
  const beforePrevious = query.editBeforePrevious;
  for (let column = 0; column <= candidateLength; column += 1) {
    previous[column] = column;
  }
  for (let row = 1; row <= queryText.length; row += 1) {
    current[0] = row;
    for (let column = 1; column <= candidateLength; column += 1) {
      const substitution =
        queryText.charCodeAt(row - 1) === candidate.charCodeAt(column - 1)
          ? 0
          : 1;
      let distance = Math.min(
        previous[column]! + 1,
        current[column - 1]! + 1,
        previous[column - 1]! + substitution,
      );
      if (
        row > 1 &&
        column > 1 &&
        queryText.charCodeAt(row - 1) === candidate.charCodeAt(column - 2) &&
        queryText.charCodeAt(row - 2) === candidate.charCodeAt(column - 1)
      ) {
        distance = Math.min(distance, beforePrevious[column - 2]! + 1);
      }
      current[column] = distance;
    }
    beforePrevious.set(previous);
    previous.set(current);
  }
  return previous[candidateLength]!;
}

function commonPrefixLength(a: string, b: string): number {
  const limit = Math.min(a.length, b.length);
  let index = 0;
  while (index < limit && a.charCodeAt(index) === b.charCodeAt(index)) index += 1;
  return index;
}

function dice(
  aMask: number,
  aCount: number,
  bMask: number,
  bCount: number,
): number {
  const total = aCount + bCount;
  return total === 0 ? 0 : (2 * popcount(aMask & bMask)) / total;
}

function ngramMask(value: string, width: number): number {
  if (!value) return 0;
  const limit = Math.max(1, value.length - width + 1);
  let mask = 0;
  for (let index = 0; index < limit; index += 1) {
    let hash = 2166136261;
    const end = Math.min(value.length, index + width);
    for (let cursor = index; cursor < end; cursor += 1) {
      hash ^= value.charCodeAt(cursor);
      hash = Math.imul(hash, 16777619);
    }
    mask |= 1 << (hash & 31);
  }
  return mask >>> 0;
}

function popcount(value: number): number {
  value -= (value >>> 1) & 0x55555555;
  value = (value & 0x33333333) + ((value >>> 2) & 0x33333333);
  return (((value + (value >>> 4)) & 0x0f0f0f0f) * 0x01010101) >>> 24;
}
