import { describe, expect, it } from "vitest";
import { setComparisonGrade } from "./comparison";

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
