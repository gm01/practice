export interface RateLimiterBinding {
  limit(options: { key: string }): Promise<{ success: boolean }>;
}

export type RateLimitDecision = "allowed" | "general" | "expensive";

const EXPENSIVE_ROUTES = new Set([
  "/v1/dashboard",
  "/v1/players/search",
  "/v1/players/detail",
]);

function clientKey(request: Request) {
  return request.headers.get("CF-Connecting-IP")?.trim() || "local";
}

export function isExpensiveRoute(pathname: string) {
  return EXPENSIVE_ROUTES.has(pathname);
}

export async function checkRateLimits(
  request: Request,
  pathname: string,
  generalLimiter: RateLimiterBinding,
  expensiveLimiter: RateLimiterBinding,
): Promise<RateLimitDecision> {
  const actor = clientKey(request);
  const general = await generalLimiter.limit({ key: `${actor}:all` });
  if (!general.success) return "general";

  if (!isExpensiveRoute(pathname)) return "allowed";
  const expensive = await expensiveLimiter.limit({ key: `${actor}:${pathname}` });
  return expensive.success ? "allowed" : "expensive";
}
