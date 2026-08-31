import { describe, expect, it } from "vitest";
import { ABILITY_COLUMNS, focusedTrainingOvr, focusedTrainingWeight, orderedAbilityColumns, recommendedFocusedTraining } from "./playerOvr";

const allAbilities = ABILITY_COLUMNS.flat().map(label => ({ label, value: 100 }));

describe("focusedTrainingOvr", () => {
  it("keeps official OVR when no focused training is applied", () => {
    expect(focusedTrainingOvr("ST", 100, allAbilities, {})).toBe(100);
  });

  it("raises a position OVR by two when every weighted ability rises by two", () => {
    const training = Object.fromEntries(allAbilities.map(row => [row.label, 2]));
    expect(focusedTrainingOvr("ST", 100, allAbilities, training)).toBe(102);
    expect(focusedTrainingOvr("GK", 100, allAbilities, training)).toBe(102);
  });

  it("uses the FC ONLINE 0.75 rounding threshold", () => {
    const abilities = allAbilities.map(row => row.label === "볼 컨트롤" ? { ...row, value: 104 } : row);
    const training = recommendedFocusedTraining("CF", abilities, 5);
    expect(focusedTrainingOvr("CF", 100, abilities, training)).toBe(102);
  });

  it("returns the verified position weights and recommended slots", () => {
    expect(focusedTrainingWeight("ST", "골 결정력")).toBe(18);
    expect(focusedTrainingWeight("CB", "가로채기")).toBe(20);
    expect(Object.keys(recommendedFocusedTraining("CF", allAbilities, 5))).toEqual([
      "볼 컨트롤", "드리블", "위치 선정", "골 결정력", "반응 속도",
    ]);
  });
});

describe("orderedAbilityColumns", () => {
  it("matches the Data Center two-column ability order", () => {
    const shuffled = [...allAbilities].reverse();
    const [left, right] = orderedAbilityColumns(shuffled);
    expect(left.map(row => row.label)).toEqual([...ABILITY_COLUMNS[0]]);
    expect(right.map(row => row.label)).toEqual([...ABILITY_COLUMNS[1]]);
  });
});
