/* ------------------------------------------------------------------ */
/*  Transcript search                                                  */
/*                                                                     */
/*  Firestore cannot search text, so each finished transcript gets a   */
/*  word list (`termsOf`) stored beside it. A search first narrows to  */
/*  transcripts whose word list holds every query word, then reads the */
/*  text of only those and picks the lines to show.                    */
/*                                                                     */
/*  Matching is on word starts and ignores case and accents: "logo"    */
/*  finds "Logos", "cafe" finds "café". Pure, so every rule here is    */
/*  tested without a database.                                         */
/* ------------------------------------------------------------------ */

/** Words kept per transcript. A long call rarely uses more than 2,000. */
export const MAX_TERMS = 6_000;

/** Words read from a query. Past this a search is a sentence. */
export const MAX_QUERY_TERMS = 6;

/** Lines shown under one result. */
export const MAX_SNIPPETS = 3;

/** Shortest word worth indexing or searching for. */
const MIN_TERM_LENGTH = 2;

const WORD = /[\p{L}\p{N}]+/gu;

/** Lowercase, accents removed. */
export function normalize(text: string): string {
  return text.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
}

function wordsOf(text: string): string[] {
  return normalize(text).match(WORD) ?? [];
}

/** The sorted, unique words in a transcript's lines and title. */
export function termsOf(title: string, lines: { text: string }[]): string[] {
  const terms = new Set<string>();
  for (const word of wordsOf(title)) if (word.length >= MIN_TERM_LENGTH) terms.add(word);
  for (const line of lines) {
    for (const word of wordsOf(line.text)) {
      if (word.length >= MIN_TERM_LENGTH) terms.add(word);
    }
    if (terms.size >= MAX_TERMS) break;
  }
  return [...terms].sort().slice(0, MAX_TERMS);
}

/** The words a query asks for, deduplicated. */
export function queryTerms(query: string): string[] {
  const unique = [...new Set(wordsOf(query).filter((w) => w.length >= MIN_TERM_LENGTH))];
  return unique.slice(0, MAX_QUERY_TERMS);
}

/**
 * True when every query word starts some word in the transcript.
 * `terms` is sorted, so each check is a binary search for the first
 * term at or after the query word.
 */
export function hasAllTerms(terms: string[], wanted: string[]): boolean {
  return wanted.every((word) => {
    let lo = 0;
    let hi = terms.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (terms[mid] < word) lo = mid + 1;
      else hi = mid;
    }
    return lo < terms.length && terms[lo].startsWith(word);
  });
}

export interface SnippetLine {
  name: string;
  at: number;
  text: string;
}

export interface Snippet extends SnippetLine {
  /** [start, end) character ranges in `text` to highlight. */
  highlights: [number, number][];
}

/** Where in `text` the query words start a word. */
export function highlightRanges(text: string, wanted: string[]): [number, number][] {
  const ranges: [number, number][] = [];
  for (const match of text.matchAll(WORD)) {
    const word = normalize(match[0]);
    const hit = wanted.find((w) => word.startsWith(w));
    if (!hit) continue;
    const start = match.index ?? 0;
    // Highlight the matched start only, measured on the original text.
    // Accents can make the normalized form a different length, so fall
    // back to the whole word when the lengths disagree.
    const length = normalize(match[0]).length === match[0].length ? hit.length : match[0].length;
    ranges.push([start, start + length]);
  }
  return ranges;
}

/**
 * The lines to show under a result: the ones that hit the most
 * different query words, in the order they were said.
 */
export function pickSnippets(lines: SnippetLine[], wanted: string[]): {
  snippets: Snippet[];
  matchingLines: number;
} {
  const scored = lines
    .map((line, index) => {
      const highlights = highlightRanges(line.text, wanted);
      const hitWords = new Set(
        highlights.map(([s, e]) => wanted.find((w) => normalize(line.text.slice(s, e)).startsWith(w)))
      );
      return { line, index, highlights, score: hitWords.size };
    })
    .filter((entry) => entry.score > 0);

  const best = [...scored]
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .slice(0, MAX_SNIPPETS)
    .sort((a, b) => a.index - b.index);

  return {
    snippets: best.map(({ line, highlights }) => ({ ...line, highlights })),
    matchingLines: scored.length,
  };
}
