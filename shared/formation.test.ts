import { describe, expect, it } from "vitest";
import { formationName, startingPlayers, substitutePlayers } from "./formation";

const player = (positionCode: number, rating = 7) => ({ positionCode, rating });

describe("formation utilities", () => {
  it("orders defensive lines before attacking lines", () => {
    const players = [2, 4, 6, 7, 9, 11, 17, 18, 19, 24, 25].map(code => player(code));
    expect(formationName(players)).toBe("4-2-3-2");
  });

  it("excludes unused and substitute slots", () => {
    const players = [player(4), player(9), player(24), player(28), player(25, 0)];
    expect(startingPlayers(players)).toHaveLength(3);
    expect(substitutePlayers(players)).toEqual([player(28)]);
  });

  it("returns an explicit fallback without lineup data", () => {
    expect(formationName([])).toBe("포메이션 정보 없음");
  });
});
