export const PLAYER_FACT_CACHE_TTL_SECONDS = 86_400;
export const PLAYER_SEARCH_CANDIDATE_LIMIT = 60;

export function playerSearchCandidateLimit(resultLimit: number) {
  const normalized = Math.min(Math.max(Math.trunc(resultLimit), 1), 40);
  return Math.min(Math.max(normalized * 2, 24), PLAYER_SEARCH_CANDIDATE_LIMIT);
}

export function playerFactCacheUrl(spId: number, grade: number) {
  return `https://fc-online-lab-cache.invalid/player-search-facts/v1/${Math.trunc(spId)}/${Math.trunc(grade)}`;
}
