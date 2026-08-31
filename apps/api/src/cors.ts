import { ApiError } from "./errors";

export interface CorsEnv {
  ALLOWED_ORIGINS: string;
}

function configuredOrigins(env: CorsEnv) {
  return env.ALLOWED_ORIGINS.split(",").map(value => value.trim()).filter(Boolean);
}

export function assertAllowedOrigin(request: Request, env: CorsEnv) {
  const origin = request.headers.get("Origin");
  const allowed = configuredOrigins(env);
  if (origin && !allowed.includes("*") && !allowed.includes(origin)) {
    throw new ApiError(403, "허용되지 않은 웹 출처입니다.", "ORIGIN_NOT_ALLOWED", "client");
  }
}

export function corsHeaders(request: Request, env: CorsEnv): HeadersInit {
  const origin = request.headers.get("Origin");
  const allowed = configuredOrigins(env);
  const allowOrigin = allowed.includes("*") ? "*" : origin && allowed.includes(origin) ? origin : allowed[0] ?? "null";
  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Headers": "Content-Type, X-Request-ID, X-Client-Version",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Expose-Headers": "X-Request-ID, X-Server-Version, X-App-API-Version, Retry-After, X-Cache",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}
