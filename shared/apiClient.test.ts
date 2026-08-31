import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiClientError, requestJson } from "./apiClient";

afterEach(() => vi.unstubAllGlobals());

describe("requestJson", () => {
  it("adds anonymous request metadata and returns diagnostics", async () => {
    const diagnostics = vi.fn();
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: true }), {
      headers: { "X-Request-ID": "11111111-1111-4111-8111-111111111111", "X-Server-Version": "worker-1", "X-App-API-Version": "1" },
    }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(requestJson<{ ok: boolean }>("https://api.example/health", { clientVersion: "desktop/0.1.0", onDiagnostics: diagnostics })).resolves.toEqual({ ok: true });
    const headers = fetchMock.mock.calls[0][1].headers as Record<string, string>;
    expect(headers["X-Request-ID"]).toMatch(/^[0-9a-f-]{36}$/i);
    expect(headers["X-Client-Version"]).toBe("desktop/0.1.0");
    expect(diagnostics).toHaveBeenCalledWith({ requestId: "11111111-1111-4111-8111-111111111111", serverVersion: "worker-1", apiVersion: "1" });
  });

  it("classifies 429 and exposes Retry-After", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: { code: "RATE_LIMITED", message: "slow down" } }), { status: 429, headers: { "Retry-After": "60" } })));
    const error = await requestJson("https://api.example/test", { retries: 0 }).catch(reason => reason) as ApiClientError;
    expect(error.kind).toBe("rate-limit");
    expect(error.retryAfterSeconds).toBe(60);
    expect(error.code).toBe("RATE_LIMITED");
  });

  it("retries transient server failures but not validation failures", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: { message: "temporary" } }), { status: 503 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true })));
    vi.stubGlobal("fetch", fetchMock);
    await expect(requestJson("https://api.example/test", { retries: 1 })).resolves.toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("classifies malformed success bodies", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("not-json")));
    await expect(requestJson("https://api.example/test", { retries: 0 })).rejects.toMatchObject({ kind: "invalid-response", code: "INVALID_JSON_RESPONSE" });
  });
});
