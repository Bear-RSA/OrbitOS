import { describe, expect, it } from "vitest";

import {
  MAX_QUERY_TERMS,
  MAX_SNIPPETS,
  hasAllTerms,
  highlightRanges,
  pickSnippets,
  queryTerms,
  termsOf,
} from "./search";

/* ------------------------------------------------------------------ */
/*  Transcript search                                                  */
/*                                                                     */
/*  What a person types is rarely what was said, word for word, so the */
/*  matching rules are what is pinned here: case, accents, word starts */
/*  and every-word-must-appear.                                        */
/* ------------------------------------------------------------------ */

const lines = (...texts: string[]) => texts.map((text, i) => ({ name: "Ana", at: i * 1000, text }));

describe("termsOf", () => {
  it("is sorted, unique, lowercased and accent-free, title included", () => {
    expect(termsOf("Café Launch", [{ text: "The LOGO, the logo again." }])).toEqual([
      "again",
      "cafe",
      "launch",
      "logo",
      "the",
    ]);
  });

  it("drops one-letter words", () => {
    expect(termsOf("", [{ text: "a b go" }])).toEqual(["go"]);
  });
});

describe("queryTerms", () => {
  it("normalizes and deduplicates", () => {
    expect(queryTerms("Logo  LOGO café?")).toEqual(["logo", "cafe"]);
  });

  it("keeps at most the first few words", () => {
    expect(queryTerms("one two three four five six seven eight")).toHaveLength(MAX_QUERY_TERMS);
  });

  it("is empty when nothing is long enough to search for", () => {
    expect(queryTerms("a ? !")).toEqual([]);
  });
});

describe("hasAllTerms", () => {
  const terms = termsOf("", [{ text: "We agreed the logos go blue by Friday" }]);

  it("needs every query word", () => {
    expect(hasAllTerms(terms, ["logo", "blue"])).toBe(true);
    expect(hasAllTerms(terms, ["logo", "green"])).toBe(false);
  });

  it("matches word starts, not the middle of a word", () => {
    expect(hasAllTerms(terms, ["fri"])).toBe(true);
    expect(hasAllTerms(terms, ["iday"])).toBe(false);
  });

  it("finds a word at either end of the list", () => {
    expect(hasAllTerms(terms, ["agreed"])).toBe(true);
    expect(hasAllTerms(terms, ["we"])).toBe(true);
    expect(hasAllTerms(terms, ["zzz"])).toBe(false);
  });
});

describe("highlightRanges", () => {
  it("marks the matched start of each word that matches", () => {
    const text = "Logos and the logo";
    const ranges = highlightRanges(text, ["logo"]);
    expect(ranges.map(([s, e]) => text.slice(s, e))).toEqual(["Logo", "logo"]);
  });

  it("finds accented words from a plain query", () => {
    const text = "Meet at the café";
    const ranges = highlightRanges(text, ["cafe"]);
    expect(ranges.map(([s, e]) => text.slice(s, e))).toEqual(["café"]);
  });
});

describe("pickSnippets", () => {
  it("prefers lines that hit more of the query, shown in the order said", () => {
    const { snippets, matchingLines } = pickSnippets(
      lines("the logo is late", "nothing here", "blue logo it is", "blue sky", "logo again"),
      ["logo", "blue"]
    );
    expect(matchingLines).toBe(4);
    expect(snippets).toHaveLength(MAX_SNIPPETS);
    expect(snippets[0].text).toBe("the logo is late");
    expect(snippets.map((s) => s.text)).toContain("blue logo it is");
  });

  it("returns nothing when no line matches", () => {
    expect(pickSnippets(lines("hello"), ["logo"])).toEqual({ snippets: [], matchingLines: 0 });
  });
});
