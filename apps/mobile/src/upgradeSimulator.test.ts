import { describe, expect, it } from "vitest";
import { simulateUpgrade, upgradeProbability } from "./upgradeSimulator";

describe("upgrade simulator", () => {
  it("scales the success rate with the selected boost", () => {
    expect(upgradeProbability(4, 5)).toBe(50);
    expect(upgradeProbability(4, 3)).toBe(30);
  });

  it("raises the grade after a successful attempt", () => {
    expect(simulateUpgrade(5, 5, () => 0)).toMatchObject({ success: true, fromGrade: 5, toGrade: 6, probability: 26 });
  });

  it("never recovers below grade one after failure", () => {
    const values = [0.99, 0.99];
    expect(simulateUpgrade(1, 1, () => values.shift() ?? 0.99)).toMatchObject({ success: false, toGrade: 1 });
  });
});
