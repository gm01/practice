import { describe, expect, it } from "vitest";
import { assertAllowedOrigin, corsHeaders } from "./cors";

describe("CORS policy", () => {
  it("allows native clients without an Origin header", () => {
    expect(() => assertAllowedOrigin(new Request("https://api.test/health"), { ALLOWED_ORIGINS: "https://app.test" })).not.toThrow();
  });

  it("reflects an explicitly allowed browser origin", () => {
    const request = new Request("https://api.test/health", { headers: { Origin: "https://app.test" } });
    assertAllowedOrigin(request, { ALLOWED_ORIGINS: "https://app.test" });
    expect(new Headers(corsHeaders(request, { ALLOWED_ORIGINS: "https://app.test" })).get("Access-Control-Allow-Origin")).toBe("https://app.test");
  });

  it("rejects unknown browser origins under an allowlist", () => {
    const request = new Request("https://api.test/health", { headers: { Origin: "https://evil.test" } });
    expect(() => assertAllowedOrigin(request, { ALLOWED_ORIGINS: "https://app.test" })).toThrow(/허용되지 않은/);
  });

  it("supports the documented public wildcard policy", () => {
    const request = new Request("https://api.test/health", { headers: { Origin: "https://any.test" } });
    expect(() => assertAllowedOrigin(request, { ALLOWED_ORIGINS: "*" })).not.toThrow();
  });
});
