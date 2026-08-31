import { describe, expect, it } from "vitest";
import { BROKEN_PLAYER_ABILITY_HTML, PARTIAL_PLAYER_ABILITY_HTML, VALID_PLAYER_ABILITY_HTML } from "./dataCenterParser.fixtures";
import { parseAbilities, parsePositions, parseTraits, validatePlayerAbilityHtml } from "./dataCenterParser";

describe("FC Online Data Center parser", () => {
  it("parses a sanitized production-shape ability fixture", () => {
    expect(parsePositions(VALID_PLAYER_ABILITY_HTML)).toEqual([{ position: "ST", value: 123 }, { position: "CF", value: 121 }]);
    expect(parseAbilities(VALID_PLAYER_ABILITY_HTML)).toHaveLength(10);
    expect(parseTraits(VALID_PLAYER_ABILITY_HTML)).toEqual(["예리한 감아차기"]);
    expect(validatePlayerAbilityHtml(VALID_PLAYER_ABILITY_HTML)).toMatchObject({ success: true, partial: false, missingFields: [] });
  });

  it("reports optional omissions as a partial parse", () => {
    expect(validatePlayerAbilityHtml(PARTIAL_PLAYER_ABILITY_HTML)).toMatchObject({
      success: true,
      partial: true,
      missingFields: ["height", "nation"],
    });
  });

  it("detects required field changes before deployment", () => {
    const result = validatePlayerAbilityHtml(BROKEN_PLAYER_ABILITY_HTML);
    expect(result.success).toBe(false);
    expect(result.missingFields).toEqual(expect.arrayContaining(["overall", "positions", "abilities"]));
    expect(result.signature).toBe("ability:1:0:0");
  });
});
