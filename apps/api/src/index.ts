const API = "https://open.api.nexon.com/fconline/v1";
const META = "https://open.api.nexon.com/static/fconline/meta";
const MAX_MATCHES = 20;

interface Env {
  NEXON_API_KEY: string;
  ALLOWED_ORIGINS: string;
  CACHE_TTL_SECONDS: string;
}

type Json = Record<string, unknown>;
type Metadata = {
  players: Map<number, string>;
  positions: Map<number, string>;
  divisions: Map<number, string>;
  seasons: Map<number, string>;
};

class ApiError extends Error {
  constructor(public status: number, message: string, public code = "API_ERROR") {
    super(message);
  }
}

const rateBuckets = new Map<string, { count: number; resetAt: number }>();
let metadataCache: Promise<Metadata> | null = null;

function corsHeaders(request: Request, env: Env): HeadersInit {
  const origin = request.headers.get("Origin");
  const allowed = env.ALLOWED_ORIGINS.split(",").map(item => item.trim()).filter(Boolean);
  const allowOrigin = allowed.includes("*") ? "*" : origin && allowed.includes(origin) ? origin : allowed[0] ?? "null";
  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin",
  };
}

function json(request: Request, env: Env, body: unknown, status = 200, extra: HeadersInit = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "no-referrer",
      ...corsHeaders(request, env),
      ...extra,
    },
  });
}

function checkRateLimit(request: Request) {
  const now = Date.now();
  const ip = request.headers.get("CF-Connecting-IP") ?? "unknown";
  const current = rateBuckets.get(ip);
  if (!current || current.resetAt <= now) {
    rateBuckets.set(ip, { count: 1, resetAt: now + 60_000 });
    return;
  }
  current.count += 1;
  if (current.count > 30) throw new ApiError(429, "요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.", "RATE_LIMITED");
  if (rateBuckets.size > 5_000) {
    for (const [key, value] of rateBuckets) if (value.resetAt <= now) rateBuckets.delete(key);
  }
}

async function nexon<T>(path: string, env: Env, params: Record<string, string | number>): Promise<T> {
  const url = new URL(`${API}${path}`);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, String(value));
  let lastError = "NEXON Open API에 연결하지 못했습니다.";
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const response = await fetch(url, {
      headers: { "x-nxopen-api-key": env.NEXON_API_KEY },
      signal: AbortSignal.timeout(12_000),
    }).catch(error => {
      lastError = error instanceof Error ? error.message : lastError;
      return null;
    });
    if (response?.ok) return response.json() as Promise<T>;
    if (response) {
      const body = await response.json().catch(() => ({})) as { error?: { message?: string } };
      lastError = body.error?.message ?? `NEXON Open API 요청 실패 (${response.status})`;
      if (response.status === 400 || response.status === 403 || response.status === 404) {
        const message = /api\s*key|apikey/i.test(lastError) ? "서비스 인증 정보를 확인할 수 없습니다." : lastError;
        throw new ApiError(response.status === 404 ? 404 : 400, message, "NEXON_REQUEST_FAILED");
      }
    }
    await new Promise(resolve => setTimeout(resolve, 250 * (attempt + 1)));
  }
  throw new ApiError(502, lastError, "NEXON_UNAVAILABLE");
}

async function loadMetadata(): Promise<Metadata> {
  if (!metadataCache) metadataCache = Promise.all([
    fetch(`${META}/spid.json`, { cf: { cacheTtl: 86_400 } }).then(response => response.json()) as Promise<Array<{ id: number; name: string }>>,
    fetch(`${META}/spposition.json`, { cf: { cacheTtl: 86_400 } }).then(response => response.json()) as Promise<Array<{ spposition: number; desc: string }>>,
    fetch(`${META}/division.json`, { cf: { cacheTtl: 86_400 } }).then(response => response.json()) as Promise<Array<{ divisionId: number; divisionName: string }>>,
    fetch(`${META}/seasonid.json`, { cf: { cacheTtl: 86_400 } }).then(response => response.json()) as Promise<Array<{ seasonId: number; className: string }>>,
  ]).then(([players, positions, divisions, seasons]) => ({
    players: new Map(players.map(item => [Number(item.id), item.name])),
    positions: new Map(positions.map(item => [Number(item.spposition), item.desc])),
    divisions: new Map(divisions.map(item => [Number(item.divisionId), item.divisionName])),
    seasons: new Map(seasons.map(item => [Number(item.seasonId), item.className])),
  })).catch(error => {
    metadataCache = null;
    throw error;
  });
  return metadataCache;
}

function matchMinute(raw: number) {
  const size = 2 ** 24;
  const period = Math.min(Math.max(Math.floor(raw / size), 0), 4);
  return Math.floor((raw - period * size + [0, 2700, 5400, 6300, 7200][period]) / 60) + 1;
}

function mapPlayers(info: Json, meta: Metadata) {
  return ((info.player as Json[] | undefined) ?? []).map(raw => {
    const status = raw.status as Json | undefined;
    const spId = Number(raw.spId);
    const pid = String(spId % 1_000_000);
    return {
      spId,
      name: meta.players.get(spId) ?? `선수 ${spId}`,
      position: meta.positions.get(Number(raw.spPosition)) ?? "-",
      positionCode: Number(raw.spPosition),
      grade: Number(raw.spGrade ?? 0),
      rating: Number(status?.spRating ?? 0),
      goals: Number(status?.goal ?? 0),
      assists: Number(status?.assist ?? 0),
      shots: Number(status?.shoot ?? 0),
      effectiveShots: Number(status?.effectiveShoot ?? 0),
      passTry: Number(status?.passTry ?? 0),
      passSuccess: Number(status?.passSuccess ?? 0),
      seasonName: meta.seasons.get(Math.floor(spId / 1_000_000)) ?? "시즌 정보 없음",
      seasonImageUrl: `https://fco.dn.nexoncdn.co.kr/live/externalAssets/common/season/seasonicon/${Math.floor(spId / 1_000_000)}.png`,
      imageUrls: [
        `https://fco.dn.nexoncdn.co.kr/live/externalAssets/common/players/p${spId}.png`,
        `https://fco.dn.nexoncdn.co.kr/live/externalAssets/common/playersAction/p${spId}.png`,
        `https://fco.dn.nexoncdn.co.kr/live/externalAssets/common/players/p${pid}.png`,
      ],
    };
  });
}

function mapShots(info: Json, names: Map<number, string>) {
  return ((info.shootDetail as Json[] | undefined) ?? []).map(raw => ({
    x: Number(raw.x ?? 0),
    y: Number(raw.y ?? 0),
    isGoal: Number(raw.result) === 3,
    playerName: names.get(Number(raw.spId)) ?? "선수 정보 없음",
    assistName: Boolean(raw.assist) ? names.get(Number(raw.assistSpId)) ?? null : null,
    minute: matchMinute(Number(raw.goalTime ?? 0)),
    type: Number(raw.type ?? 0),
    inPenalty: Boolean(raw.inPenalty),
  }));
}

function mapStats(info: Json) {
  const detail = info.matchDetail as Json | undefined;
  const shoot = info.shoot as Json | undefined;
  const pass = info.pass as Json | undefined;
  const passTry = Number(pass?.passTry ?? 0);
  const passSuccess = Number(pass?.passSuccess ?? 0);
  return {
    possession: Number(detail?.possession ?? 0),
    shots: Number(shoot?.shootTotal ?? 0),
    effectiveShots: Number(shoot?.effectiveShootTotal ?? 0),
    passAccuracy: passTry ? Math.round(passSuccess / passTry * 100) : 0,
    tackles: Number((info.defence as Json | undefined)?.tackleSuccess ?? 0),
    corners: Number(detail?.cornerKick ?? 0),
    fouls: Number(detail?.foul ?? 0),
    offsides: Number(detail?.offsideCount ?? 0),
    yellowCards: Number(detail?.yellowCards ?? 0),
    redCards: Number(detail?.redCards ?? 0),
    averageRating: null,
  };
}

async function mapMatch(id: string, ouid: string, env: Env, meta: Metadata) {
  const detail = await nexon<{ matchDate: string; matchInfo: Json[] }>("/match-detail", env, { matchid: id });
  const mine = detail.matchInfo.find(item => item.ouid === ouid);
  const opponent = detail.matchInfo.find(item => item.ouid !== ouid);
  if (!mine || !opponent) throw new ApiError(502, "경기 상세 정보가 누락되었습니다.");
  const myShoot = mine.shoot as Json | undefined;
  const awayShoot = opponent.shoot as Json | undefined;
  const mineDetail = mine.matchDetail as Json | undefined;
  const shots = mapShots(mine, meta.players);
  const opponentShots = mapShots(opponent, meta.players);
  const players = mapPlayers(mine, meta);
  const opponentPlayers = mapPlayers(opponent, meta);
  return {
    id,
    matchDate: detail.matchDate,
    result: String(mineDetail?.matchResult ?? "기록 없음"),
    myScore: Number(myShoot?.goalTotalDisplay ?? myShoot?.goalTotal ?? 0),
    opponentScore: Number(awayShoot?.goalTotalDisplay ?? awayShoot?.goalTotal ?? 0),
    ownGoalsFor: Number(awayShoot?.ownGoal ?? 0),
    ownGoalsAgainst: Number(myShoot?.ownGoal ?? 0),
    opponentNickname: String(opponent.nickname ?? "상대 구단주"),
    divisionName: meta.divisions.get(Number(mine.division)) ?? "등급 정보 없음",
    opponentDivisionName: meta.divisions.get(Number(opponent.division)) ?? "등급 정보 없음",
    controller: String(mineDetail?.controller ?? "정보 없음"),
    endType: Number(mineDetail?.matchEndType ?? 0),
    stats: mapStats(mine),
    opponentStats: mapStats(opponent),
    players,
    opponentPlayers,
    topPlayers: [...players].filter(player => player.rating > 0).sort((a, b) => b.rating - a.rating).slice(0, 3),
    shots,
    opponentShots,
    goals: [
      ...shots.filter(shot => shot.isGoal).map(shot => ({ ...shot, side: "mine" })),
      ...opponentShots.filter(shot => shot.isGoal).map(shot => ({ ...shot, side: "opponent" })),
    ].sort((a, b) => a.minute - b.minute),
  };
}

async function dashboard(url: URL, env: Env) {
  const nickname = (url.searchParams.get("nickname") ?? "").trim();
  const matchType = Number(url.searchParams.get("matchtype") ?? 50);
  const offset = Number(url.searchParams.get("offset") ?? 0);
  const limit = Math.min(Number(url.searchParams.get("limit") ?? MAX_MATCHES), MAX_MATCHES);
  if (!nickname || nickname.length > 30) throw new ApiError(400, "올바른 구단주명을 입력해 주세요.", "INVALID_NICKNAME");
  if (!Number.isInteger(matchType) || matchType < 1) throw new ApiError(400, "경기 유형이 올바르지 않습니다.", "INVALID_MATCH_TYPE");
  if (!Number.isInteger(offset) || offset < 0 || offset > 10_000) throw new ApiError(400, "조회 위치가 올바르지 않습니다.", "INVALID_OFFSET");
  if (!Number.isInteger(limit) || limit < 1) throw new ApiError(400, "조회 개수가 올바르지 않습니다.", "INVALID_LIMIT");

  const identity = await nexon<{ ouid: string }>("/id", env, { nickname });
  const [profile, divisions, ids, meta] = await Promise.all([
    nexon<{ ouid: string; nickname: string; level: number }>("/user/basic", env, { ouid: identity.ouid }),
    nexon<Array<{ matchType: number; division: number }>>("/user/maxdivision", env, { ouid: identity.ouid }),
    nexon<string[]>("/user/match", env, { ouid: identity.ouid, matchtype: matchType, offset, limit }),
    loadMetadata(),
  ]);

  const matches: unknown[] = [];
  const warnings: string[] = [];
  for (let index = 0; index < ids.length; index += 5) {
    const batch = await Promise.allSettled(ids.slice(index, index + 5).map(id => mapMatch(id, identity.ouid, env, meta)));
    for (const result of batch) {
      if (result.status === "fulfilled") matches.push(result.value);
      else warnings.push(result.reason instanceof Error ? result.reason.message : "경기 조회 실패");
    }
  }
  const division = divisions.find(item => item.matchType === matchType);
  return {
    profile: {
      ...profile,
      divisionName: division ? meta.divisions.get(division.division) ?? "기록 없음" : "기록 없음",
    },
    matches,
    warnings,
  };
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders(request, env) });
    const url = new URL(request.url);
    try {
      if (request.method !== "GET") throw new ApiError(405, "허용되지 않은 요청 방식입니다.", "METHOD_NOT_ALLOWED");
      if (url.pathname === "/" || url.pathname === "/health") {
        return json(request, env, { ok: true, service: "FC Online Lab API", version: "0.1.0" }, 200, { "Cache-Control": "no-store" });
      }
      if (url.pathname !== "/v1/dashboard") throw new ApiError(404, "요청한 API를 찾을 수 없습니다.", "NOT_FOUND");
      checkRateLimit(request);

      const cache = await caches.open("fc-online-lab-api");
      const cacheUrl = new URL(url);
      cacheUrl.searchParams.sort();
      const cacheKey = new Request(cacheUrl.toString(), { method: "GET" });
      const cached = await cache.match(cacheKey);
      if (cached) return new Response(cached.body, { status: cached.status, headers: { ...Object.fromEntries(cached.headers), ...corsHeaders(request, env), "X-Cache": "HIT" } });

      const result = await dashboard(url, env);
      const ttl = Math.min(Math.max(Number(env.CACHE_TTL_SECONDS) || 90, 30), 300);
      const response = json(request, env, result, 200, { "Cache-Control": `public, max-age=${ttl}`, "X-Cache": "MISS" });
      ctx.waitUntil(cache.put(cacheKey, response.clone()));
      return response;
    } catch (error) {
      const status = error instanceof ApiError ? error.status : 500;
      const code = error instanceof ApiError ? error.code : "INTERNAL_ERROR";
      const message = error instanceof Error ? error.message : "서버 오류가 발생했습니다.";
      return json(request, env, { error: { code, message } }, status, { "Cache-Control": "no-store" });
    }
  },
} satisfies ExportedHandler<Env>;
