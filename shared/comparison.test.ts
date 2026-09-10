import { describe, expect, it } from "vitest";
import { compareAbility, setComparisonGrade } from "./comparison";

describe("player comparison grades", () => {
  it("changes each player's grade independently", () => {
    expect(setComparisonGrade([1, 7], 0, 4)).toEqual([4, 7]);
    expect(setComparisonGrade([4, 7], 1, 10)).toEqual([4, 10]);
  });

  it("clamps grades to the supported range", () => {
    expect(setComparisonGrade([3, 3], 0, 0)).toEqual([1, 3]);
    expect(setComparisonGrade([3, 3], 1, 99)).toEqual([3, 13]);
  });
});


describe("ability comparisons", () => {
  it("excludes missing values from winners and differences", () => {
    for (const [left, right] of [[undefined, 120], [120, undefined], [undefined, undefined]]) {
      expect(compareAbility(left, right)).toEqual({leftWins:false,rightWins:false,leftDelta:"–",rightDelta:"–"});
    }
  });
  it("keeps zero as a real value and compares both directions", () => {
    expect(compareAbility(0, 5)).toEqual({leftWins:false,rightWins:true,leftDelta:"-5",rightDelta:"+5"});
    expect(compareAbility(125, 120)).toEqual({leftWins:true,rightWins:false,leftDelta:"+5",rightDelta:"-5"});
    expect(compareAbility(120, 120).leftDelta).toBe("–");
  });
});
