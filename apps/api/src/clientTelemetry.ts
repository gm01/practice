import { ApiError } from "./errors";
import { writeMetric, type ObservabilityEnv, type RequestTrace } from "./observability";

export type SafeClientError = {
  eventId: string;
  relatedRequestId?: string;
  platform: "desktop" | "ios" | "android";
  appVersion: string;
  screen: string;
  errorCode: string;
  message: string;
  stack?: string;
  occurredAt: string;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CODE = /^[A-Z0-9_:-]{1,80}$/;

export function redactClientText(value: string, maxLength: number) {
  return value
    .replace(/([A-Za-z]:\\Users\\)[^\\\s]+/gi, "$1<redacted>")
    .replace(/(\/Users\/)[^/\s]+/g, "$1<redacted>")
    .replace(/https?:\/\/[^\s)]+/gi, raw => {
      try {
        const url = new URL(raw);
        return `${url.origin}${url.pathname}`;
      } catch {
        return "<redacted-url>";
      }
    })
    .slice(0, maxLength);
}

export function parseClientErrorPayload(input: unknown): SafeClientError {
  if (!input || typeof input !== "object") throw new ApiError(400, "오류 보고 형식이 올바르지 않습니다.", "INVALID_TELEMETRY", "client");
  const value = input as Record<string, unknown>;
  if (typeof value.eventId !== "string" || !UUID.test(value.eventId)) throw new ApiError(400, "오류 이벤트 식별자가 올바르지 않습니다.", "INVALID_TELEMETRY", "client");
  if (!(["desktop", "ios", "android"] as unknown[]).includes(value.platform)) throw new ApiError(400, "플랫폼 정보가 올바르지 않습니다.", "INVALID_TELEMETRY", "client");
  if (typeof value.errorCode !== "string" || !CODE.test(value.errorCode)) throw new ApiError(400, "오류 코드가 올바르지 않습니다.", "INVALID_TELEMETRY", "client");
  if (typeof value.message !== "string" || !value.message.trim()) throw new ApiError(400, "오류 메시지가 비어 있습니다.", "INVALID_TELEMETRY", "client");
  const relatedRequestId = typeof value.relatedRequestId === "string" && UUID.test(value.relatedRequestId) ? value.relatedRequestId.toLowerCase() : undefined;
  const occurredAt = typeof value.occurredAt === "string" && !Number.isNaN(Date.parse(value.occurredAt)) ? value.occurredAt : new Date().toISOString();
  return {
    eventId: value.eventId.toLowerCase(),
    relatedRequestId,
    platform: value.platform as SafeClientError["platform"],
    appVersion: redactClientText(typeof value.appVersion === "string" ? value.appVersion : "unknown", 80),
    screen: redactClientText(typeof value.screen === "string" ? value.screen : "unknown", 80),
    errorCode: value.errorCode,
    message: redactClientText(value.message, 500),
    stack: typeof value.stack === "string" ? redactClientText(value.stack, 4_000) : undefined,
    occurredAt,
  };
}

export function recordClientError(env: ObservabilityEnv, trace: RequestTrace, event: SafeClientError) {
  console.error(JSON.stringify({ event: "client_error", requestId: trace.requestId, ...event, serverVersion: trace.serverVersion }));
  writeMetric(env, {
    indexes: [`client:${event.platform}`],
    blobs: ["client_error", event.platform, event.errorCode, event.screen, event.appVersion, trace.serverVersion, trace.requestId, event.relatedRequestId ?? "none"],
    doubles: [1],
  });
}
