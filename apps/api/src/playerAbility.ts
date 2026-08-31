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
