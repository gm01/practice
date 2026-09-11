import { beforeEach, describe, expect, it, vi } from "vitest";

const memory = vi.hoisted(() => new Map<string, string>());

vi.mock("@react-native-async-storage/async-storage", () => ({
  default: {
    getItem: vi.fn(async (key: string) => memory.get(key) ?? null),
    setItem: vi.fn(async (key: string, value: string) => { memory.set(key, value); }),
    removeItem: vi.fn(async (key: string) => { memory.delete(key); }),
  },
}));

import { clearUpgradeHistory, loadUpgradeHistory, loadUpgradeStats, rememberUpgrades, type UpgradeHistoryItem } from "./storage";

function result(index: number): UpgradeHistoryItem {
  return {
    id: String(index), spId: 1, name: "선수", seasonName: "클래스", imageUrl: "",
    fromGrade: 1, toGrade: index % 2 ? 1 : 2, success: index % 2 === 0,
    probability: 50, boost: 5, createdAt: new Date(index).toISOString(),
  };
}

describe("upgrade history storage", () => {
  beforeEach(() => memory.clear());

  it("keeps counting beyond the 100 detailed records shown", async () => {
    await rememberUpgrades(Array.from({ length: 100 }, (_, index) => result(index)));
    const saved = await rememberUpgrades(Array.from({ length: 10 }, (_, index) => result(index + 100)));

    expect(saved.history).toHaveLength(100);
    expect(saved.stats).toEqual({ attempts: 110, successes: 55 });
    expect(await loadUpgradeStats()).toEqual(saved.stats);
  });

  it("clears both detailed records and cumulative counts", async () => {
    await rememberUpgrades([result(0)]);
    await clearUpgradeHistory();

    expect(await loadUpgradeHistory()).toEqual([]);
    expect(await loadUpgradeStats()).toEqual({ attempts: 0, successes: 0 });
  });
});
