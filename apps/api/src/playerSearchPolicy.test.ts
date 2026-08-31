import { describe, expect, it } from "vitest";
import {
  PLAYER_FACT_CACHE_TTL_SECONDS,
  PLAYER_SEARCH_CANDIDATE_LIMIT,
  playerFactCacheUrl,
  playerSearchCandidateLimit,
} from "./playerSearchPolicy";

describe("player search policy", () => {
  it("bounds expensive Data Center lookups below the previous 100-card maximum", () => {
    expect(PLAYER_SEARCH_CANDIDATE_LIMIT).toBe(60);
    expect(playerSearchCandidateLimit(10)).toBe(24);
    expect(playerSearchCandidateLimit(30)).toBe(60);
    expect(playerSearchCandidateLimit(40)).toBe(60);
  });

  it("uses a stable per-card and enhancement cache key", () => {
    expect(playerFactCacheUrl(100190043, 1)).toBe(
      "https://fc-online-lab-cache.invalid/player-search-facts/v1/100190043/1",
    );
    expect(playerFactCacheUrl(100190043, 5)).not.toBe(playerFactCacheUrl(100190043, 1));
    expect(PLAYER_FACT_CACHE_TTL_SECONDS).toBe(86_400);
  });
});
