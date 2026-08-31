import { describe, expect, it, vi } from "vitest";
import { createRequestTrace, diagnosticHeaders, normalizeRoute, recordParser, resolveRequestId, type ObservabilityEnv } from "./observability";

function env() {
  return {
    CF_VERSION_METADATA: { id: "worker-123", tag: "", timestamp: "2026-09-01T00:00:00Z" },
    FC_ONLINE_METRICS: { writeDataPoint: vi.fn() },
  } as unknown as ObservabilityEnv;
}

describe("Worker observability", () => {
  it("accepts valid UUIDs and replaces invalid identifiers", () => {
    const valid = "11111111-1111-4111-8111-111111111111";
    expect(resolveRequestId(valid)).toBe(valid);
    expect(resolveRequestId("nickname-or-device-id")).toMatch(/^[0-9a-f-]{36}$/i);
  });

  it("normalizes routes without query or path cardinality", () => {
    expect(normalizeRoute("/")).toBe("/health");
    expect(normalizeRoute("/v1/players/detail")).toBe("/v1/players/detail");
    expect(normalizeRoute("/secret/value")).toBe("not-found");
  });

  it("links response diagnostics to the request trace", () => {
    const trace = createRequestTrace(new Request("https://api.example/health", { headers: { "X-Request-ID": "11111111-1111-4111-8111-111111111111" } }), env(), "/health");
    expect(diagnosticHeaders(trace)).toEqual({ "X-Request-ID": trace.requestId, "X-Server-Version": "worker-123", "X-App-API-Version": "1" });
  });

  it("records parser attempts including the denominator and missing fields", () => {
    const target = env();
    const trace = createRequestTrace(new Request("https://api.example/v1/players/detail"), target, "/v1/players/detail");
    recordParser(target, trace, "player_detail", { success: false, partial: false, missingFields: ["abilities"], signature: "ability:1:0:0" });
    expect(target.FC_ONLINE_METRICS!.writeDataPoint).toHaveBeenCalledWith(expect.objectContaining({ doubles: [1, 0, 0] }));
  });

  it("does not break requests when the optional local metrics binding is absent", () => {
    const target = {} as ObservabilityEnv;
    const trace = createRequestTrace(new Request("https://api.example/health"), target, "/health");
    expect(() => recordParser(target, trace, "test", { success: true, partial: false, missingFields: [], signature: "ok" })).not.toThrow();
  });
});
