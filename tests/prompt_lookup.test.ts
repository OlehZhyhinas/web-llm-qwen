import { expect, test } from "@jest/globals";
import { PromptLookupIndex } from "../src/prompt_lookup";

test("uses the most recent previous n-gram match", () => {
  const index = new PromptLookupIndex([1, 2, 3, 1, 2, 4, 1, 2], 2, 2);
  expect(index.draft(4)).toEqual([4, 1, 2]);
});

test("falls back from nMax to nMin when needed", () => {
  const index = new PromptLookupIndex([7, 8, 9, 8, 9, 10, 9, 10], 2, 3);
  expect(index.draft(4)).toEqual([9, 10]);
});

test("truncates draft when match is near source end", () => {
  const index = new PromptLookupIndex([1, 2, 3, 4, 2, 3, 5, 2, 3], 2, 2);
  expect(index.draft(10)).toEqual([5, 2, 3]);
});

test("returns empty draft if only the query suffix matches", () => {
  const index = new PromptLookupIndex([1, 2, 3, 4], 2, 3);
  expect(index.draft(5)).toEqual([]);
});

test("incremental append matches rebuild-from-scratch", () => {
  const nMin = 2;
  const nMax = 4;
  const k = 6;
  const incremental = new PromptLookupIndex([], nMin, nMax);
  const prefix: number[] = [];

  let state = 17;
  for (let i = 0; i < 250; ++i) {
    state = (state * 1103515245 + 12345) & 0x7fffffff;
    const token = state % 11;
    prefix.push(token);
    incremental.appendToken(token);
    const rebuilt = new PromptLookupIndex(prefix, nMin, nMax);
    expect(incremental.draft(k)).toEqual(rebuilt.draft(k));
  }
});
