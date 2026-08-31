import { describe, expect, it } from "vitest";
import { affiliationTeamColorLevel, buildPlayerAbilityForm, isSeasonClassTeamColor } from "./playerAbility";

describe("buildPlayerAbilityForm", () => {
  it("applies the selected affiliation level without a global stat-change flag", () => {
    const form = buildPlayerAbilityForm({
      spId: 100190043,
      grade: 1,
      affiliationId: 321,
      affiliationLevel: 4,
    });

    expect(form.get("n4TeamColorId")).toBe("321");
    expect(form.get("n4TeamColorLv")).toBe("4");
    expect(form.get("n1Change")).toBe("0");
  });

  it("uses affiliation team colors at stage 4", () => {
    expect(affiliationTeamColorLevel(321)).toBe(4);
    expect(affiliationTeamColorLevel(0)).toBe(0);
  });

  it("uses season class team colors at stage 3", () => {
    expect(isSeasonClassTeamColor("GRU (Greatest Runner-Ups)", "Greatest Runner-Ups")).toBe(true);
    expect(affiliationTeamColorLevel(40587, "GRU (Greatest Runner-Ups)", "Greatest Runner-Ups")).toBe(3);
    expect(affiliationTeamColorLevel(2007, "GRU (Greatest Runner-Ups)", "포르투갈")).toBe(4);
  });

  it("does not activate any team-color parameter for the base ability request", () => {
    const form = buildPlayerAbilityForm({ spId: 100190043, grade: 1 });

    expect(form.get("n4TeamColorId")).toBe("0");
    expect(form.get("n4TeamColorLv")).toBe("0");
    expect(form.get("n4TeamColorId_Enhance")).toBe("0");
    expect(form.get("n4TeamColorId_Feature")).toBe("0");
    expect(form.get("n1Change")).toBe("0");
  });
});
