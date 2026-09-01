import type {
  SuggestionCandidate,
  SuggestionQuery,
} from "./search-suggestion-features";

type PostingLists = Map<string, Uint16Array>;

export class SuggestionCandidateIndex {
  readonly #bigrams: PostingLists;
  readonly #trigrams: PostingLists;
  readonly #tokenPrefixes: PostingLists;
  readonly #votes: Uint8Array;
  readonly #touched: Uint16Array;

  constructor(candidates: SuggestionCandidate[]) {
    if (candidates.length > 65_535) {
      throw new Error("Suggestion vocabulary exceeds Uint16 capacity");
    }
    this.#bigrams = buildPostings(candidates, (candidate) =>
      uniqueNgrams(candidate.compact, 2),
    );
    this.#trigrams = buildPostings(candidates, (candidate) =>
      uniqueNgrams(candidate.compact, 3),
    );
    this.#tokenPrefixes = buildPostings(candidates, (candidate) => [
      ...new Set(
        candidate.term
          .split(" ")
          .filter((token) => token.length >= 2)
          .map((token) => token.slice(0, 2)),
      ),
    ]);
    this.#votes = new Uint8Array(candidates.length);
    this.#touched = new Uint16Array(candidates.length);
  }

  retrieve(query: SuggestionQuery): Uint16Array {
    let touchedCount = 0;
    let ngramMatches = 0;
    const addPosting = (posting: Uint16Array | undefined, ngram: boolean) => {
      if (!posting) return;
      if (ngram) ngramMatches += posting.length;
      for (const candidateId of posting) {
        if (this.#votes[candidateId] === 0) {
          this.#touched[touchedCount] = candidateId;
          touchedCount += 1;
        }
        if (this.#votes[candidateId] < 255) this.#votes[candidateId] += 1;
      }
    };

    if (query.compact.length >= 3) {
      for (const trigram of uniqueNgrams(query.compact, 3)) {
        addPosting(this.#trigrams.get(trigram), true);
      }
    } else {
      for (const bigram of uniqueNgrams(query.compact, 2)) {
        addPosting(this.#bigrams.get(bigram), true);
      }
    }
    for (const token of query.tokens) {
      if (token.length >= 2) {
        addPosting(this.#tokenPrefixes.get(token.slice(0, 2)), false);
      }
    }
    if (query.compact.length === 3 && ngramMatches === 0) {
      for (const bigram of uniqueNgrams(query.compact, 2)) {
        addPosting(this.#bigrams.get(bigram), true);
      }
    }

    for (let index = 0; index < touchedCount; index += 1) {
      this.#votes[this.#touched[index]!] = 0;
    }
    return this.#touched.subarray(0, touchedCount);
  }
}

function buildPostings(
  candidates: SuggestionCandidate[],
  keysOf: (candidate: SuggestionCandidate) => string[],
): PostingLists {
  const mutable = new Map<string, number[]>();
  for (let candidateId = 0; candidateId < candidates.length; candidateId += 1) {
    for (const key of keysOf(candidates[candidateId]!)) {
      const posting = mutable.get(key);
      if (posting) posting.push(candidateId);
      else mutable.set(key, [candidateId]);
    }
  }
  return new Map(
    [...mutable].map(([key, candidateIds]) => [
      key,
      Uint16Array.from(candidateIds),
    ]),
  );
}

function uniqueNgrams(value: string, width: number): string[] {
  if (value.length < width) return value ? [value] : [];
  const ngrams: string[] = [];
  for (let index = 0; index <= value.length - width; index += 1) {
    const ngram = value.slice(index, index + width);
    if (!ngrams.includes(ngram)) ngrams.push(ngram);
  }
  return ngrams;
}
