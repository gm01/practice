export type BackAction = "nested-player-database" | "close-player-database" | "close-player" | "close-match" | "close-dashboard" | "none";

export function resolveBackAction(state: {
  playerDatabase: boolean;
  hasNestedPlayerDatabaseBack: boolean;
  player: boolean;
  match: boolean;
  dashboard: boolean;
}): BackAction {
  if (state.playerDatabase) return state.hasNestedPlayerDatabaseBack ? "nested-player-database" : "close-player-database";
  if (state.player) return "close-player";
  if (state.match) return "close-match";
  if (state.dashboard) return "close-dashboard";
  return "none";
}
