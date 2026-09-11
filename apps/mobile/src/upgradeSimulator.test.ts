import { describe, expect, it } from "vitest";
import { canUseGradeProtection, simulateUpgrade, simulateUpgradeSeries, upgradeProbability } from "./upgradeSimulator";

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

  it("keeps the current grade when protection is enabled", () => {
    expect(simulateUpgrade(8, 5, () => 0.99, true)).toMatchObject({ success: false, fromGrade: 8, toGrade: 8, defended: true });
  });

  it("allows grade protection from grade eight", () => {
    expect(canUseGradeProtection(7)).toBe(false);
    expect(canUseGradeProtection(8)).toBe(true);
    expect(simulateUpgrade(7, 5, () => 0.99, true)).toMatchObject({ success: false, defended: false });
  });

  it("runs consecutive attempts using each previous result", () => {
    const results = simulateUpgradeSeries(1, 5, 10, false, () => 0);
    expect(results).toHaveLength(10);
    expect(results[0]).toMatchObject({ fromGrade: 1, toGrade: 2 });
    expect(results.at(-1)?.fromGrade).toBe(10);
  });
});
