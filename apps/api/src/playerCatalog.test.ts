import { describe, expect, it } from "vitest";
import { detectNewCatalogIds } from "./playerCatalog";

describe("player catalog new item detection", () => {
  it("does not report the initial catalog as new", () => {
    expect(detectNewCatalogIds(undefined, "next", [{ id: 1 }, { id: 2 }], new Set())).toEqual([]);
  });

  it("does not report existing rows when the hash is unchanged", () => {
    expect(detectNewCatalogIds("same", "same", [{ id: 1 }, { id: 2 }], new Set())).toEqual([]);
  });

  it("reports only ids added after a changed snapshot", () => {
    expect(detectNewCatalogIds("before", "after", [{ id: 1 }, { id: 2 }, { id: 3 }], new Set([1, 2]))).toEqual([3]);
  });
});
