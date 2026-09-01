import { describe, expect, it } from "vitest";
import { BROKEN_PLAYER_ABILITY_HTML, PARTIAL_PLAYER_ABILITY_HTML, VALID_PLAYER_ABILITY_HTML } from "./dataCenterParser.fixtures";
import { parseAbilities, parsePositions, parseTeamColorCatalog, parseTeamColorPlayerIds, parseTraits, validatePlayerAbilityHtml } from "./dataCenterParser";

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

  it("parses searchable team-color catalog rows", () => {
    const html = `<div class="teamcolor_item"><a onclick="DataCenter.GetTeamColorDetail(40082); return false;"></a><div class="name">1. FC 우니온 베를린</div><div class="level">4단계</div></div>
      <div class="teamcolor_item"><a onclick="DataCenter.GetTeamColorDetail(40147); return false;"></a><div class="name">19 New Generation</div><div class="level">3단계</div></div>`;
    expect(parseTeamColorCatalog(html)).toEqual([
      { id: 40082, name: "1. FC 우니온 베를린", level: 4 },
      { id: 40147, name: "19 New Generation", level: 3 },
    ]);
  });

  it("extracts unique player ids from team-color responses", () => {
    expect(parseTeamColorPlayerIds(JSON.stringify({ players: [{ spid: 866247819 }, { spid: "866247819" }, { spid: 101190043 }] }))).toEqual([866247819, 101190043]);
    expect(parseTeamColorPlayerIds("not-json")).toEqual([]);
  });
});
