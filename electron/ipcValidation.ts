import type { PlayerDetailOptions, PlayerSearchFilters } from "../shared/contracts";

const ALLOWED_MATCH_TYPES = new Set([30, 40, 50, 52, 60, 204, 214, 224, 234]);

export function requireText(value: unknown, label: string, maxLength: number): string {
  if (typeof value !== "string" || !value.trim() || value.length > maxLength) throw new Error(`${label} 입력값이 올바르지 않습니다.`);
  return value.trim();
}

export function validateDashboardInput(input: unknown) {
  const value = input as { nickname?: unknown; offset?: unknown; matchType?: unknown } | null;
  return {
    nickname: requireText(value?.nickname, "구단주명", 32),
    offset: Number.isInteger(value?.offset) && Number(value?.offset) >= 0 && Number(value?.offset) <= 10_000 ? Number(value?.offset) : 0,
    matchType: ALLOWED_MATCH_TYPES.has(Number(value?.matchType)) ? Number(value?.matchType) : 50,
  };
}

export function validatePlayerSearchFilters(input: unknown): PlayerSearchFilters {
  if (!input || typeof input !== "object") throw new Error("선수 검색 조건이 올바르지 않습니다.");
  const value = input as PlayerSearchFilters;
  if (typeof value.query !== "string" || value.query.length > 40) throw new Error("선수 검색 조건이 올바르지 않습니다.");
  return value;
}

export function validatePlayerDetailInput(input: unknown): { spId: number; grade: number; options?: PlayerDetailOptions } {
  const value = input as { spId?: unknown; grade?: unknown; options?: PlayerDetailOptions } | null;
  if (!Number.isInteger(value?.spId) || Number(value?.spId) < 1) throw new Error("선수 식별자가 올바르지 않습니다.");
  return {
    spId: Number(value?.spId),
    grade: Number.isInteger(value?.grade) && Number(value?.grade) >= 0 && Number(value?.grade) <= 13 ? Number(value?.grade) : 1,
    options: value?.options,
  };
}
