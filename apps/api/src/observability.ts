import type { ApiError, ErrorSource } from "./errors";
import type { ParserValidation } from "./dataCenterParser";

export const API_VERSION = "1";
export const APP_VERSION = "0.1.0";

export interface ObservabilityEnv {
  FC_ONLINE_METRICS?: AnalyticsEngineDataset;
  CF_VERSION_METADATA?: WorkerVersionMetadata;
}

export type RequestTrace = {
  requestId: string;
  route: string;
  startedAt: number;
  serverVersion: string;
  clientVersion: string;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ROUTES = new Set(["/health", "/v1/dashboard", "/v1/players/search", "/v1/players/filters", "/v1/players/detail", "/v1/telemetry/client-error"]);

export function normalizeRoute(pathname: string) {
  if (pathname === "/") return "/health";
  return ROUTES.has(pathname) ? pathname : "not-found";
}

export function resolveRequestId(value: string | null) {
  return value && UUID.test(value) ? value.toLowerCase() : crypto.randomUUID();
}

export function createRequestTrace(request: Request, env: ObservabilityEnv, pathname: string): RequestTrace {
  return {
    requestId: resolveRequestId(request.headers.get("X-Request-ID")),
    route: normalizeRoute(pathname),
    startedAt: performance.now(),
    serverVersion: env.CF_VERSION_METADATA?.id ?? "local",
    clientVersion: (request.headers.get("X-Client-Version") ?? "unknown").slice(0, 80),
  };
}

export function diagnosticHeaders(trace: RequestTrace) {
  return {
    "X-Request-ID": trace.requestId,
    "X-Server-Version": trace.serverVersion,
    "X-App-API-Version": API_VERSION,
  };
}

function structuredLog(payload: Record<string, unknown>) {
  console.log(JSON.stringify(payload));
}

export function writeMetric(env: ObservabilityEnv, point: Parameters<AnalyticsEngineDataset["writeDataPoint"]>[0]) {
  try { env.FC_ONLINE_METRICS?.writeDataPoint(point); }
  catch (error) { console.warn(JSON.stringify({ event: "metric_write_failed", message: error instanceof Error ? error.message : "unknown" })); }
}

export function recordRequest(env: ObservabilityEnv, trace: RequestTrace, status: number, cache: string, error?: ApiError) {
  const durationMs = Math.max(0, performance.now() - trace.startedAt);
  const errorSource: ErrorSource | "none" = error?.source ?? (status >= 500 ? "worker" : "none");
  const errorCode = error?.code ?? "none";
  const payload = {
    event: "request_complete",
    requestId: trace.requestId,
    route: trace.route,
    status,
    durationMs: Math.round(durationMs * 100) / 100,
    cache,
    errorSource,
    errorCode,
    serverVersion: trace.serverVersion,
    clientVersion: trace.clientVersion,
  };
  structuredLog(payload);
  writeMetric(env, {
    indexes: [trace.route],
    blobs: ["request", trace.route, String(Math.floor(status / 100)), errorSource, errorCode, cache, trace.serverVersion, trace.clientVersion, trace.requestId],
    doubles: [durationMs, status, status < 400 ? 1 : 0],
  });
}

export function recordUpstream(env: ObservabilityEnv, trace: RequestTrace, source: "nexon" | "data-center", stage: string, durationMs: number, success: boolean, status = 0, code = "none") {
  structuredLog({ event: "upstream_request", requestId: trace.requestId, route: trace.route, source, stage, durationMs, success, status, code, serverVersion: trace.serverVersion });
  writeMetric(env, {
    indexes: [`upstream:${source}`],
    blobs: ["upstream", source, stage, success ? "success" : "failure", code, trace.route, trace.serverVersion, trace.requestId],
    doubles: [durationMs, status, success ? 1 : 0],
  });
}

export function recordParser(env: ObservabilityEnv, trace: RequestTrace, parser: string, validation: ParserValidation) {
  structuredLog({ event: "parser_result", requestId: trace.requestId, route: trace.route, parser, ...validation, serverVersion: trace.serverVersion });
  writeMetric(env, {
    indexes: [`parser:${parser}`],
    blobs: ["parser", parser, validation.success ? "success" : "failure", validation.partial ? "partial" : "complete", validation.missingFields.join("|"), validation.signature, trace.route, trace.serverVersion, trace.requestId],
    doubles: [1, validation.success ? 1 : 0, validation.partial ? 1 : 0],
  });
}
