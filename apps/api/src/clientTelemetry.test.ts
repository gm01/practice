import { describe, expect, it } from "vitest";
import { parseClientErrorPayload } from "./clientTelemetry";

const base = {
  eventId: "123e4567-e89b-42d3-a456-426614174000",
  platform: "desktop",
  appVersion: "0.1.0",
  screen: "dashboard",
  errorCode: "RENDER_ERROR",
  message: "failed",
  occurredAt: "2026-09-01T00:00:00.000Z",
};

describe("client telemetry privacy boundary", () => {
  it("drops unknown fields and redacts local user paths and URL queries", () => {
    const event = parseClientErrorPayload({ ...base, nickname: "private", apiKey: "secret", stack: "C:\\Users\\alice\\app.ts https://api.test/path?nickname=private" });
    expect(event).not.toHaveProperty("nickname");
    expect(event).not.toHaveProperty("apiKey");
    expect(event.stack).toContain("C:\\Users\\<redacted>\\app.ts");
    expect(event.stack).toContain("https://api.test/path");
    expect(event.stack).not.toContain("nickname=private");
  });

  it("clamps untrusted text sizes", () => {
    expect(parseClientErrorPayload({ ...base, message: "x".repeat(700) }).message).toHaveLength(500);
  });

  it("rejects malformed payloads", () => {
    expect(() => parseClientErrorPayload({ ...base, eventId: "bad" })).toThrow(/식별자/);
  });
});
