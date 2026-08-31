import { describe, expect, it, vi } from "vitest";
import { checkRateLimits, isExpensiveRoute, type RateLimiterBinding } from "./runtimeProtection";

function limiter(success: boolean): RateLimiterBinding {
  return { limit: vi.fn().mockResolvedValue({ success }) };
}

describe("Worker request rate limiting", () => {
  it("classifies upstream-heavy routes", () => {
    expect(isExpensiveRoute("/v1/dashboard")).toBe(true);
    expect(isExpensiveRoute("/v1/players/search")).toBe(true);
    expect(isExpensiveRoute("/v1/players/detail")).toBe(true);
    expect(isExpensiveRoute("/v1/players/filters")).toBe(false);
  });

  it("uses an anonymous IP and route key for expensive requests", async () => {
    const general = limiter(true);
    const expensive = limiter(true);
    const request = new Request("https://api.example/v1/players/search", {
      headers: { "CF-Connecting-IP": "203.0.113.8" },
    });

    await expect(checkRateLimits(request, "/v1/players/search", general, expensive)).resolves.toBe("allowed");
    expect(general.limit).toHaveBeenCalledWith({ key: "203.0.113.8:all" });
    expect(expensive.limit).toHaveBeenCalledWith({ key: "203.0.113.8:/v1/players/search" });
  });

  it("stops before the expensive limiter when the general budget is exhausted", async () => {
    const general = limiter(false);
    const expensive = limiter(true);

    await expect(checkRateLimits(new Request("https://api.example/v1/dashboard"), "/v1/dashboard", general, expensive)).resolves.toBe("general");
    expect(expensive.limit).not.toHaveBeenCalled();
  });

  it("applies only the general budget to lightweight routes", async () => {
    const general = limiter(true);
    const expensive = limiter(false);

    await expect(checkRateLimits(new Request("https://api.example/v1/players/filters"), "/v1/players/filters", general, expensive)).resolves.toBe("allowed");
    expect(expensive.limit).not.toHaveBeenCalled();
  });
});
