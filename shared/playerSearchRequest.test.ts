import { describe, expect, it } from "vitest";
import { playerSearchRequest } from "./playerSearchRequest";

describe("search pagination", () => {
  const applied = { query: "손흥민", seasonIds: [1], grade: 5, sort: "overall-desc" };
  const draft = { query: "메시", seasonIds: [2], grade: 8, sort: "salary-desc" };
  it("continues the displayed search when the form has unsubmitted changes", () => {
    expect(playerSearchRequest(draft, applied, 2)).toEqual({...applied,page:2,pageSize:30});
  });
  it("applies edited filters only when starting a new search", () => {
    expect(playerSearchRequest(draft, applied, 1)).toEqual({...draft,page:1,pageSize:30});
  });
  it("keeps pagination on the previous results after a failed replacement search", () => {
    playerSearchRequest(draft, applied, 1);
    expect(playerSearchRequest({...draft,query:""}, applied, 3)).toEqual({...applied,page:3,pageSize:30});
  });
});
