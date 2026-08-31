import { PLAYER_FACT_CACHE_TTL_SECONDS, playerFactCacheUrl } from "./playerSearchPolicy";

export interface PlayerFactCache {
  match(request: Request): Promise<Response | undefined>;
  put(request: Request, response: Response): Promise<void>;
}

export interface BackgroundTaskContext {
  waitUntil(promise: Promise<unknown>): void;
}

const inFlightRequests = new Map<string, Promise<unknown>>();

export async function loadCachedPlayerFacts<T>(
  spId: number,
  grade: number,
  cache: PlayerFactCache,
  ctx: BackgroundTaskContext,
  load: () => Promise<T>,
): Promise<T> {
  const cacheUrl = playerFactCacheUrl(spId, grade);
  const cacheKey = new Request(cacheUrl);
  const cached = await cache.match(cacheKey);
  if (cached) {
    try {
      return await cached.json() as T;
    } catch {
      // A malformed cache entry is treated as a miss and replaced below.
    }
  }

  const inFlight = inFlightRequests.get(cacheUrl) as Promise<T> | undefined;
  if (inFlight) return inFlight;

  const request = load().then(facts => {
    const response = new Response(JSON.stringify(facts), {
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": `public, max-age=${PLAYER_FACT_CACHE_TTL_SECONDS}`,
      },
    });
    ctx.waitUntil(cache.put(cacheKey, response));
    return facts;
  }).finally(() => {
    inFlightRequests.delete(cacheUrl);
  });
  inFlightRequests.set(cacheUrl, request);
  return request;
}
