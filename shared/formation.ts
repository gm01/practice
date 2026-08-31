import type { PlayerSummary } from "./contracts";

export const POSITION_COORDINATES: Readonly<Record<number, readonly [number, number]>> = {
  0: [50, 90], 1: [50, 81], 2: [88, 75], 3: [82, 78], 4: [66, 77], 5: [50, 78], 6: [34, 77], 7: [18, 78], 8: [12, 70],
  9: [65, 64], 10: [50, 65], 11: [35, 64], 12: [84, 54], 13: [66, 53], 14: [50, 54], 15: [34, 53], 16: [16, 54],
  17: [68, 42], 18: [50, 43], 19: [32, 42], 20: [67, 28], 21: [50, 30], 22: [33, 28], 23: [84, 22],
  24: [63, 17], 25: [50, 16], 26: [37, 17], 27: [16, 22],
};

export function startingPlayers<T extends Pick<PlayerSummary, "rating" | "positionCode">>(players: T[]) {
  return players.filter(player => player.rating > 0 && player.positionCode >= 0 && player.positionCode < 28);
}

export function substitutePlayers<T extends Pick<PlayerSummary, "rating" | "positionCode">>(players: T[]) {
  return players.filter(player => player.rating > 0 && player.positionCode >= 28);
}

export function formationName<T extends Pick<PlayerSummary, "rating" | "positionCode">>(players: T[]) {
  const starters = startingPlayers(players);
  const lines = [
    starters.filter(player => player.positionCode >= 1 && player.positionCode <= 8).length,
    starters.filter(player => player.positionCode >= 9 && player.positionCode <= 11).length,
    starters.filter(player => player.positionCode >= 12 && player.positionCode <= 16).length,
    starters.filter(player => player.positionCode >= 17 && player.positionCode <= 19).length,
    starters.filter(player => player.positionCode >= 20 && player.positionCode <= 27).length,
  ].filter(Boolean);
  return lines.join("-") || "포메이션 정보 없음";
}
