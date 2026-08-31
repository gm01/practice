export type PlayerAbilityFormInput = {
  spId: number;
  grade: number;
  grow?: number;
  affiliationId?: number;
  affiliationLevel?: number;
  enhancementId?: number;
  enhancementLevel?: number;
  featureId?: number;
};

export const AFFILIATION_TEAM_COLOR_LEVEL = 4;
export const SEASON_CLASS_TEAM_COLOR_LEVEL = 3;

function normalizedTeamColorName(value: string) {
  return value.toLocaleLowerCase("en-US").replace(/[^a-z0-9가-힣]/g, "");
}

export function isSeasonClassTeamColor(seasonName: string, teamColorName: string) {
  const season = normalizedTeamColorName(seasonName);
  const teamColor = normalizedTeamColorName(teamColorName);
  return Boolean(teamColor && season.includes(teamColor));
}

export function affiliationTeamColorLevel(affiliationId: number, seasonName = "", teamColorName = "") {
  if (affiliationId <= 0) return 0;
  return isSeasonClassTeamColor(seasonName, teamColorName) ? SEASON_CLASS_TEAM_COLOR_LEVEL : AFFILIATION_TEAM_COLOR_LEVEL;
}

export function buildPlayerAbilityForm(input: PlayerAbilityFormInput) {
  return new URLSearchParams({
    spid: String(input.spId),
    n1Strong: String(input.grade),
    n1Grow: String(input.grow ?? 0),
    n4TeamColorId: String(input.affiliationId ?? 0),
    n4TeamColorLv: String(input.affiliationLevel ?? 0),
    n4TeamColorId_Enhance: String(input.enhancementId ?? 0),
    n4TeamColorLv_Enhance: String(input.enhancementLevel ?? 0),
    n4TeamColorId_Feature: String(input.featureId ?? 0),
    // n1Change is not a team-color enable flag. Setting it to 1 adds an
    // unintended global ability increase, so team colors always use 0.
    n1Change: "0",
    strPlayerImg: "",
  });
}
