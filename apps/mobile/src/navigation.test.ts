import { describe, expect, it } from "vitest";
import { resolveBackAction } from "./navigation";

describe("mobile back navigation", () => {
  it("returns from nested player search before closing the database", () => {
    expect(resolveBackAction({ playerDatabase: true, hasNestedPlayerDatabaseBack: true, player: true, match: true, dashboard: true })).toBe("nested-player-database");
  });

  it("uses the required player, match, dashboard priority", () => {
    expect(resolveBackAction({ playerDatabase: false, hasNestedPlayerDatabaseBack: false, player: true, match: true, dashboard: true })).toBe("close-player");
    expect(resolveBackAction({ playerDatabase: false, hasNestedPlayerDatabaseBack: false, player: false, match: true, dashboard: true })).toBe("close-match");
    expect(resolveBackAction({ playerDatabase: false, hasNestedPlayerDatabaseBack: false, player: false, match: false, dashboard: true })).toBe("close-dashboard");
  });
});
