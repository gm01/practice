import { describe, expect, it } from "vitest";
import { validateDashboardInput, validatePlayerDetailInput, validatePlayerSearchFilters } from "./ipcValidation";

describe("Electron IPC validation", () => {
  it("trims a valid owner name and normalizes unsafe paging", () => {
    expect(validateDashboardInput({ nickname: "  감독명  ", offset: -4, matchType: 999 })).toEqual({ nickname: "감독명", offset: 0, matchType: 50 });
  });

  it("rejects empty and overlong owner names", () => {
    expect(() => validateDashboardInput({ nickname: " " })).toThrow(/구단주명/);
    expect(() => validateDashboardInput({ nickname: "가".repeat(33) })).toThrow(/구단주명/);
  });

  it("rejects malformed player IPC payloads", () => {
    expect(() => validatePlayerSearchFilters({ query: "x".repeat(41) })).toThrow(/검색 조건/);
    expect(() => validatePlayerDetailInput({ spId: 0, grade: 1 })).toThrow(/식별자/);
  });

  it("bounds invalid enhancement grades", () => {
    expect(validatePlayerDetailInput({ spId: 101000001, grade: 99 }).grade).toBe(1);
  });
});
