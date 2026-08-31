import { describe, expect, it } from "vitest";
import { ABILITY_COLUMNS, focusedTrainingOvr, orderedAbilityColumns } from "./playerOvr";

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
});

describe("orderedAbilityColumns", () => {
  it("matches the Data Center two-column ability order", () => {
    const shuffled = [...allAbilities].reverse();
    const [left, right] = orderedAbilityColumns(shuffled);
    expect(left.map(row => row.label)).toEqual([...ABILITY_COLUMNS[0]]);
    expect(right.map(row => row.label)).toEqual([...ABILITY_COLUMNS[1]]);
  });
});
