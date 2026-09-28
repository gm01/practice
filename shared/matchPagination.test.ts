import { describe, expect, it } from "vitest";
import { matchPageLimit, nextMatchPage } from "./matchPagination";

describe("match pagination", () => {
  it("loads 20 matches first and 10 at a time afterwards", () => {
    expect(matchPageLimit(0)).toBe(20);
    expect(matchPageLimit(20)).toBe(10);
    expect(matchPageLimit(40)).toBe(10);
  });

  it("stops after 50 matches", () => {
    expect(nextMatchPage(40, 10)).toEqual({ nextOffset: 50, hasMore: false });
    expect(matchPageLimit(50)).toBe(0);
  });

  it("stops when a page contains fewer matches than requested", () => {
    expect(nextMatchPage(20, 6)).toEqual({ nextOffset: 26, hasMore: false });
  });
});
