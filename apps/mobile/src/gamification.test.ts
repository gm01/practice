import { describe, expect, it } from "vitest";
import { analyzePlayStyle, dailyChallenge } from "./gamification";

const match = (overrides: Record<string, unknown> = {}) => ({
  matchDate: "2026-09-11T03:00:00Z",
  result: "승",
  myScore: 3,
  opponentScore: 1,
  stats: { possession: 48, shots: 8, effectiveShots: 5 },
  ...overrides,
}) as never;

describe("mobile fun cards", () => {
  it("finds an attacking play style from recent matches", () => {
    expect(analyzePlayStyle([match(), match({ myScore: 4 })]).title).toBe("공격 본능");
  });

  it("keeps the daily challenge stable for the same owner and day", () => {
    const now = new Date("2026-09-11T09:00:00+09:00");
    expect(dailyChallenge("테스트구단주", [match()], now).title).toBe(dailyChallenge("테스트구단주", [match()], now).title);
  });

  it("only counts matches played today toward the challenge", () => {
    const now = new Date("2026-09-11T09:00:00+09:00");
    const result = dailyChallenge("테스트구단주", [match({ matchDate: "2026-09-09T03:00:00Z" })], now);
    expect(result.progress).toBe(0);
    expect(result.completed).toBe(false);
  });
});
