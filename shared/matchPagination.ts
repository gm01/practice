export const INITIAL_MATCH_COUNT = 20;
export const MATCH_PAGE_SIZE = 10;
export const MAX_MATCH_COUNT = 50;

export function matchPageLimit(offset: number) {
  if (offset <= 0) return INITIAL_MATCH_COUNT;
  return Math.min(MATCH_PAGE_SIZE, Math.max(0, MAX_MATCH_COUNT - offset));
}

export function nextMatchPage(offset: number, received: number, requested = matchPageLimit(offset)) {
  const nextOffset = Math.min(MAX_MATCH_COUNT, offset + received);
  return {
    nextOffset,
    hasMore: requested > 0 && received === requested && nextOffset < MAX_MATCH_COUNT,
  };
}
