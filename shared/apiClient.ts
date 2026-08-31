import type { ApiErrorBody, DiagnosticInfo } from "./contracts";

export type ApiFailureKind = "offline" | "timeout" | "cancelled" | "not-found" | "rate-limit" | "server" | "invalid-response" | "unknown";

export class ApiClientError extends Error {
  constructor(
    message: string,
    readonly kind: ApiFailureKind,
    readonly status?: number,
    readonly code?: string,
    readonly retryAfterSeconds?: number,
    readonly requestId?: string,
    readonly source?: string,
  ) {
    super(message);
  }
}

export type RequestJsonOptions = {
  timeoutMs?: number;
  retries?: number;
  signal?: AbortSignal;
  method?: "GET" | "POST";
  body?: string;
  headers?: Record<string, string>;
  clientVersion?: string;
  notFoundMessage?: string;
  fallbackMessage?: string;
  onDiagnostics?: (diagnostics: DiagnosticInfo) => void;
};

function requestId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, character => {
    const value = Math.floor(Math.random() * 16);
    return (character === "x" ? value : value & 0x3 | 0x8).toString(16);
  });
}

function retryAfter(response: Response) {
  const value = Number(response.headers.get("Retry-After") ?? 0);
  return Number.isFinite(value) && value > 0 ? value : undefined;
}

function diagnosticInfo(response: Response, fallbackRequestId: string): DiagnosticInfo {
  return {
    requestId: response.headers.get("X-Request-ID") ?? fallbackRequestId,
    serverVersion: response.headers.get("X-Server-Version"),
    apiVersion: response.headers.get("X-App-API-Version"),
  };
}

function responseError(response: Response, body: ApiErrorBody, fallback: string, fallbackRequestId: string) {
  const error = body.error;
  const resolvedRequestId = response.headers.get("X-Request-ID") ?? error?.requestId ?? fallbackRequestId;
  if (response.status === 404) return new ApiClientError(error?.message ?? fallback, "not-found", response.status, error?.code, undefined, resolvedRequestId, error?.source);
  if (response.status === 429) return new ApiClientError(error?.message ?? "조회 요청이 많습니다. 잠시 후 다시 시도해 주세요.", "rate-limit", response.status, error?.code, retryAfter(response), resolvedRequestId, error?.source);
  if (response.status >= 500) return new ApiClientError(error?.message ?? "서비스 연결이 원활하지 않습니다. 잠시 후 다시 시도해 주세요.", "server", response.status, error?.code, undefined, resolvedRequestId, error?.source);
  return new ApiClientError(error?.message ?? `${fallback} (${response.status})`, "unknown", response.status, error?.code, undefined, resolvedRequestId, error?.source);
}

function retryable(error: unknown) {
  return error instanceof TypeError || error instanceof ApiClientError && error.kind === "server";
}

export async function requestJson<T>(url: URL | string, options: RequestJsonOptions = {}): Promise<T> {
  const timeoutMs = options.timeoutMs ?? 30_000;
  const retries = Math.min(Math.max(options.retries ?? 1, 0), 2);
  const id = requestId();
  let lastError: unknown;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const controller = new AbortController();
    let timedOut = false;
    const abortFromCaller = () => controller.abort(options.signal?.reason);
    options.signal?.addEventListener("abort", abortFromCaller, { once: true });
    const timeout = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, timeoutMs);
    try {
      const response = await fetch(url.toString(), {
        method: options.method ?? "GET",
        body: options.body,
        signal: controller.signal,
        headers: {
          Accept: "application/json",
          ...(options.body ? { "Content-Type": "application/json; charset=utf-8" } : {}),
          "X-Request-ID": id,
          ...(options.clientVersion ? { "X-Client-Version": options.clientVersion } : {}),
          ...options.headers,
        },
      });
      options.onDiagnostics?.(diagnosticInfo(response, id));
      const body = await response.json().catch(() => undefined) as T | ApiErrorBody | undefined;
      if (!response.ok) throw responseError(response, (body ?? {}) as ApiErrorBody, options.fallbackMessage ?? "요청에 실패했습니다.", id);
      if (body === undefined) throw new ApiClientError("서버 응답 형식을 확인할 수 없습니다.", "invalid-response", response.status, "INVALID_JSON_RESPONSE", undefined, id);
      return body as T;
    } catch (error) {
      if (timedOut) lastError = new ApiClientError("조회 시간이 초과되었습니다. 네트워크 상태를 확인해 주세요.", "timeout", undefined, "REQUEST_TIMEOUT", undefined, id);
      else if (options.signal?.aborted) lastError = new ApiClientError("요청이 취소되었습니다.", "cancelled", undefined, "REQUEST_CANCELLED", undefined, id);
      else if (error instanceof TypeError) lastError = new ApiClientError("인터넷에 연결할 수 없습니다. 네트워크 상태를 확인해 주세요.", "offline", undefined, "NETWORK_OFFLINE", undefined, id);
      else lastError = error;
    } finally {
      clearTimeout(timeout);
      options.signal?.removeEventListener("abort", abortFromCaller);
    }
    if (attempt >= retries || !retryable(lastError)) throw lastError;
    await new Promise(resolve => setTimeout(resolve, 200 * (attempt + 1)));
  }
  throw lastError;
}
