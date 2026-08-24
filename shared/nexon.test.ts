import { describe, expect, it } from "vitest";
import { formatNexonDate, gameMinute, nexonDate } from "./nexon";

describe("gameMinute", () => {
  it.each([
    [383, 7],
    [2 ** 24 + 441, 53],
    [2 ** 25 + 60, 92],
    [2 ** 24 * 3 + 60, 107],
    [2 ** 24 * 4 + 60, 122],
  ])("converts encoded time %s to minute %s", (raw, minute) => {
    expect(gameMinute(raw)).toBe(minute);
  });
});

describe("Nexon timestamps", () => {
  it("treats timezone-less values as UTC", () => {
    expect(nexonDate("2026-08-22T04:06:03").toISOString()).toBe("2026-08-22T04:06:03.000Z");
  });

  it("formats UTC timestamps in Korea time", () => {
    expect(formatNexonDate("2026-08-22T04:06:03")).toMatch(/(오후|PM) 1:06:03/);
  });
});
