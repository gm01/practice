import { describe, expect, it } from "vitest";
import { createClientErrorEvent, enqueueBounded } from "./clientTelemetry";

describe("client telemetry queue", () => {
  it("creates a server-valid anonymous event", () => {
    const event = createClientErrorEvent({ platform: "desktop", appVersion: "0.1.0", screen: "dashboard", error: new Error("boom") });
    expect(event.eventId).toMatch(/^[0-9a-f-]{36}$/);
    expect(event).not.toHaveProperty("nickname");
    expect(event.message).toBe("boom");
  });

  it("keeps only the newest 20 failed reports", () => {
    expect(enqueueBounded(Array.from({ length: 20 }, (_, index) => index), 20)).toEqual(Array.from({ length: 20 }, (_, index) => index + 1));
  });
});
