import { describe, expect, it } from "vitest";
import { buildPlayerAbilityForm } from "./playerAbility";

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

  it("does not activate any team-color parameter for the base ability request", () => {
    const form = buildPlayerAbilityForm({ spId: 100190043, grade: 1 });

    expect(form.get("n4TeamColorId")).toBe("0");
    expect(form.get("n4TeamColorLv")).toBe("0");
    expect(form.get("n4TeamColorId_Enhance")).toBe("0");
    expect(form.get("n4TeamColorId_Feature")).toBe("0");
    expect(form.get("n1Change")).toBe("0");
  });
});
