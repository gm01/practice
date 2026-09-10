import type { PlayerSearchFilters } from "./contracts";

// Pagination belongs to the displayed results, even while the form is being edited.
export function playerSearchRequest(draft: PlayerSearchFilters, applied: PlayerSearchFilters | null, page: number): PlayerSearchFilters {
  const filters = page > 1 && applied ? applied : draft;
  return { ...filters, page, pageSize: 30 };
}
