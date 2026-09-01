import { affiliationTeamColorLevel, buildPlayerAbilityForm } from "./playerAbility";
import { ApiError } from "./errors";
import {
  classText,
  decodeHtml,
  firstMatch,
  parseAbilities,
  parseClubCareer,
  parsePositions,
  parsePrice,
  parseRankerStats,
  parseSummaryAbilities,
  parseTeamColorCatalog,
  parseTeamColorOptions,
  parseTeamColorPlayerIds,
  parseTraits,
  validatePlayerAbilityHtml,
} from "./dataCenterParser";
import { loadCachedPlayerFacts } from "./playerFactCache";
import {
  catalogStatus,
  loadPlayerFacts,
  loadStoredMetadata,
  loadStoredTeamColors,
  markCatalogSyncFailure,
  savePlayerFacts,
  saveTeamColorPlayers,
  storedPlayerIds,
  syncCatalogSnapshot,
  type CatalogSnapshot,
} from "./playerCatalog";
import {
  playerSearchCandidateLimit,
} from "./playerSearchPolicy";
import { checkRateLimits, type RateLimiterBinding } from "./runtimeProtection";
import { assertAllowedOrigin, corsHeaders } from "./cors";
import { parseClientErrorPayload, recordClientError } from "./clientTelemetry";
import {
  API_VERSION,
  APP_VERSION,
  createRequestTrace,
  diagnosticHeaders,
  recordParser,
  recordRequest,
  recordUpstream,
  type ObservabilityEnv,
  type RequestTrace,
} from "./observability";

const API = "https://open.api.nexon.com/fconline/v1";
const META = "https://open.api.nexon.com/static/fconline/meta";
const DATA_CENTER = "https://fconline.nexon.com";
const MAX_MATCHES = 20;
const SEARCH_POSITIONS: Record<string, number[]> = {
  GK: [0], SW: [1], RWB: [2], RB: [3], CB: [4, 5, 6], LB: [7], LWB: [8],
  CDM: [9, 10, 11], RM: [12], CM: [13, 14, 15], LM: [16], CAM: [17, 18, 19],
  CF: [20, 21, 22], RW: [23], ST: [24, 25, 26], LW: [27],
};
const SEARCH_ABILITIES = [
  "속력", "가속력", "골 결정력", "슛 파워", "중거리 슛", "위치 선정", "발리슛", "페널티 킥",
  "짧은 패스", "시야", "크로스", "긴 패스", "프리킥", "커브", "드리블", "볼 컨트롤",
  "민첩성", "밸런스", "반응 속도", "대인 수비", "태클", "가로채기", "헤더", "슬라이딩 태클",
  "몸싸움", "스태미너", "적극성", "점프", "침착성", "GK 다이빙", "GK 핸들링", "GK 킥",
  "GK 반응속도", "GK 위치 선정",
];

interface Env extends ObservabilityEnv {
  NEXON_API_KEY: string;
  ALLOWED_ORIGINS: string;
  CACHE_TTL_SECONDS: string;
  API_ACCESS_POLICY: string;
  API_RATE_LIMITER: RateLimiterBinding;
  EXPENSIVE_RATE_LIMITER: RateLimiterBinding;
  PLAYER_DB?: D1Database;
}

type Json = Record<string, unknown>;
type Metadata = {
  players: Map<number, string>;
  positions: Map<number, string>;
  divisions: Map<number, string>;
  seasons: Map<number, string>;
  seasonImages: Map<number, string>;
};

let metadataCache: Promise<Metadata> | null = null;
let teamColorCatalogCache: Promise<Array<{ id: number; name: string; level: number }>> | null = null;
let storedMetadataCache: Promise<Metadata | null> | null = null;
let storedTeamColorCatalogCache: Promise<Array<{ id: number; name: string; level: number }>> | null = null;

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

async function nexon<T>(path: string, env: Env, trace: RequestTrace, params: Record<string, string | number>): Promise<T> {
  const url = new URL(`${API}${path}`);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, String(value));
  let lastError = "NEXON Open API에 연결하지 못했습니다.";
  let lastCode = "NEXON_UNAVAILABLE";
  let upstreamStatus: number | undefined;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const upstreamStartedAt = performance.now();
    const response = await fetch(url, {
      headers: { "x-nxopen-api-key": env.NEXON_API_KEY },
      signal: AbortSignal.timeout(12_000),
    }).catch(error => {
      lastError = error instanceof Error ? error.message : lastError;
      lastCode = error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError") ? "NEXON_TIMEOUT" : "NEXON_NETWORK_ERROR";
      recordUpstream(env, trace, "nexon", path, performance.now() - upstreamStartedAt, false, 0, lastCode);
      return null;
    });
    if (response?.ok) {
      recordUpstream(env, trace, "nexon", path, performance.now() - upstreamStartedAt, true, response.status);
      return response.json() as Promise<T>;
    }
    if (response) {
      upstreamStatus = response.status;
      const body = await response.json().catch(() => ({})) as { error?: { message?: string } };
      lastError = body.error?.message ?? `NEXON Open API 요청 실패 (${response.status})`;
      lastCode = response.status === 429 ? "NEXON_RATE_LIMITED" : response.status >= 500 ? "NEXON_HTTP_ERROR" : "NEXON_REQUEST_FAILED";
      recordUpstream(env, trace, "nexon", path, performance.now() - upstreamStartedAt, false, response.status, lastCode);
      if (response.status === 400 || response.status === 403 || response.status === 404) {
        const message = /api\s*key|apikey/i.test(lastError) ? "서비스 인증 정보를 확인할 수 없습니다." : lastError;
        throw new ApiError(response.status === 404 ? 404 : 400, message, "NEXON_REQUEST_FAILED", "nexon", { upstreamStatus: response.status, stage: path });
      }
    }
    await new Promise(resolve => setTimeout(resolve, 250 * (attempt + 1)));
  }
  throw new ApiError(502, lastError, lastCode, "nexon", { upstreamStatus, stage: path });
}

async function loadLiveMetadata(): Promise<Metadata> {
  if (!metadataCache) metadataCache = Promise.all([
    fetch(`${META}/spid.json`, { cf: { cacheTtl: 86_400 } }).then(response => response.json()) as Promise<Array<{ id: number; name: string }>>,
    fetch(`${META}/spposition.json`, { cf: { cacheTtl: 86_400 } }).then(response => response.json()) as Promise<Array<{ spposition: number; desc: string }>>,
    fetch(`${META}/division.json`, { cf: { cacheTtl: 86_400 } }).then(response => response.json()) as Promise<Array<{ divisionId: number; divisionName: string }>>,
    fetch(`${META}/seasonid.json`, { cf: { cacheTtl: 86_400 } }).then(response => response.json()) as Promise<Array<{ seasonId: number; className: string; seasonImg: string }>>,
  ]).then(([players, positions, divisions, seasons]) => ({
    players: new Map(players.map(item => [Number(item.id), item.name])),
    positions: new Map(positions.map(item => [Number(item.spposition), item.desc])),
    divisions: new Map(divisions.map(item => [Number(item.divisionId), item.divisionName])),
    seasons: new Map(seasons.map(item => [Number(item.seasonId), item.className])),
    seasonImages: new Map(seasons.map(item => [Number(item.seasonId), item.seasonImg])),
  })).catch(error => {
    metadataCache = null;
    throw error;
  });
  return metadataCache;
}

async function loadMetadata(env?: Env): Promise<Metadata> {
  if (env?.PLAYER_DB) {
    if (!storedMetadataCache) storedMetadataCache = loadStoredMetadata(env.PLAYER_DB).catch(() => null);
    const stored = await storedMetadataCache;
    if (stored) return stored;
  }
  return loadLiveMetadata();
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
      seasonImageUrl: meta.seasonImages.get(Math.floor(spId / 1_000_000)) ?? "",
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

async function mapMatch(id: string, ouid: string, env: Env, meta: Metadata, trace: RequestTrace) {
  const detail = await nexon<{ matchDate: string; matchInfo: Json[] }>("/match-detail", env, trace, { matchid: id });
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

async function dashboard(url: URL, env: Env, trace: RequestTrace) {
  const nickname = (url.searchParams.get("nickname") ?? "").trim();
  const matchType = Number(url.searchParams.get("matchtype") ?? 50);
  const offset = Number(url.searchParams.get("offset") ?? 0);
  const limit = Math.min(Number(url.searchParams.get("limit") ?? MAX_MATCHES), MAX_MATCHES);
  if (!nickname || nickname.length > 30) throw new ApiError(400, "올바른 구단주명을 입력해 주세요.", "INVALID_NICKNAME");
  if (!Number.isInteger(matchType) || matchType < 1) throw new ApiError(400, "경기 유형이 올바르지 않습니다.", "INVALID_MATCH_TYPE");
  if (!Number.isInteger(offset) || offset < 0 || offset > 10_000) throw new ApiError(400, "조회 위치가 올바르지 않습니다.", "INVALID_OFFSET");
  if (!Number.isInteger(limit) || limit < 1) throw new ApiError(400, "조회 개수가 올바르지 않습니다.", "INVALID_LIMIT");

  const identity = await nexon<{ ouid: string }>("/id", env, trace, { nickname });
  const [profile, divisions, ids, meta] = await Promise.all([
    nexon<{ ouid: string; nickname: string; level: number }>("/user/basic", env, trace, { ouid: identity.ouid }),
    nexon<Array<{ matchType: number; division: number }>>("/user/maxdivision", env, trace, { ouid: identity.ouid }),
    nexon<string[]>("/user/match", env, trace, { ouid: identity.ouid, matchtype: matchType, offset, limit }),
    loadMetadata(env),
  ]);

  const matches: unknown[] = [];
  const warnings: string[] = [];
  for (let index = 0; index < ids.length; index += 5) {
    const batch = await Promise.allSettled(ids.slice(index, index + 5).map(id => mapMatch(id, identity.ouid, env, meta, trace)));
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

function listParam(url: URL, name: string) {
  return (url.searchParams.get(name) ?? "").split(",").map(value => value.trim()).filter(Boolean);
}

function numberParam(url: URL, name: string, minimum = 0, maximum = 999) {
  const raw = url.searchParams.get(name);
  if (raw === null || raw === "") return undefined;
  const value = Number(raw);
  return Number.isFinite(value) ? Math.min(Math.max(value, minimum), maximum) : undefined;
}

function numericText(value: string) {
  return Number(value.match(/[\d.]+/)?.[0] ?? 0);
}

function positionCodes(values: string[]) {
  return [...new Set(values.flatMap(value => SEARCH_POSITIONS[value.toUpperCase()] ?? []))];
}

async function dataCenterPlayerIds(query: string, seasons: number[], positions: string[], env: Env, trace: RequestTrace, salaryMin?: number, salaryMax?: number, overallMin?: number, overallMax?: number) {
  const form = new URLSearchParams({
    strPlayerName: query,
    strSeason: seasons.length ? `,${seasons.join(",")},` : "",
    strPosition: positionCodes(positions).length ? `,${positionCodes(positions).join(",")},` : "",
    n4SalaryMin: String(salaryMin ?? 0), n4SalaryMax: String(salaryMax ?? 99),
    n4OvrMin: String(overallMin ?? 0), n4OvrMax: String(overallMax ?? 250),
  });
  const html = await dataCenterFetch("/datacenter/PlayerList", trace, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8" },
    body: form.toString(),
  }, env);
  const ids = [...html.matchAll(/(?:spid|spId|\.val)\s*(?:\(|=|:)\s*["']?(\d{8,10})/gi)].map(match => Number(match[1]));
  return [...new Set(ids)].slice(0, 100);
}

async function loadLiveTeamColorCatalog(env: Env, trace: RequestTrace) {
  if (!teamColorCatalogCache) teamColorCatalogCache = dataCenterFetch("/datacenter/teamcolor", trace, undefined, env)
    .then(html => {
      const rows = parseTeamColorCatalog(html);
      if (!rows.length) throw new ApiError(502, "팀컬러 목록을 해석하지 못했습니다.", "TEAM_COLOR_CATALOG_INVALID", "data-center");
      return rows.sort((a, b) => a.name.localeCompare(b.name, "ko-KR") || a.id - b.id);
    })
    .catch(error => {
      teamColorCatalogCache = null;
      throw error;
    });
  return teamColorCatalogCache;
}

async function loadTeamColorCatalog(env: Env, trace: RequestTrace) {
  if (env.PLAYER_DB) {
    if (!storedTeamColorCatalogCache) storedTeamColorCatalogCache = loadStoredTeamColors(env.PLAYER_DB).catch(() => []);
    const stored = await storedTeamColorCatalogCache;
    if (stored.length) return stored;
  }
  return loadLiveTeamColorCatalog(env, trace);
}

async function refreshPlayerCatalog(env: Env, trace: RequestTrace) {
  if (!env.PLAYER_DB) return null;
  try {
    const [meta, teamColors] = await Promise.all([loadLiveMetadata(), loadLiveTeamColorCatalog(env, trace)]);
    const snapshot: CatalogSnapshot = {
      players: [...meta.players].map(([id, name]) => ({ id, name })),
      positions: [...meta.positions].map(([id, name]) => ({ id, name })),
      divisions: [...meta.divisions].map(([id, name]) => ({ id, name })),
      seasons: [...meta.seasons].map(([id, name]) => ({ id, name, imageUrl: meta.seasonImages.get(id) ?? "" })),
      teamColors,
    };
    const result = await syncCatalogSnapshot(env.PLAYER_DB, snapshot);
    storedMetadataCache = Promise.resolve(meta);
    storedTeamColorCatalogCache = Promise.resolve(teamColors);
    return result;
  } catch (error) {
    await markCatalogSyncFailure(env.PLAYER_DB, error).catch(() => undefined);
    throw error;
  }
}

async function playerCatalogStatus(env: Env, source: "d1" | "live" | "fallback" = "d1") {
  if (env.PLAYER_DB) return catalogStatus(env.PLAYER_DB, source);
  return {
    updatedAt: null, checkedAt: null, source: "live" as const, stale: true,
    playerCount: 0, seasonCount: 0, teamColorCount: 0, newSeasonIds: [], newPlayerCount: 0,
  };
}

async function dataCenterTeamColorPlayerIds(teamColorId: number, query: string, seasons: number[], positions: string[], env: Env, trace: RequestTrace, salaryMin?: number, salaryMax?: number, overallMin?: number, overallMax?: number) {
  const form = new URLSearchParams({
    teamcolorid: String(teamColorId),
    strPlayerName: query,
    strSeason: seasons.length ? `,${seasons.join(",")},` : "",
    strPosition: positionCodes(positions).length ? `,${positionCodes(positions).join(",")},` : "",
    strOrderby: "overallrating descending, salary descending",
    n1Confederation: "0", n4LeagueId: "0", n4TeamId: "0", n4NationId: "0",
    n4SalaryMin: String(salaryMin ?? 4), n4SalaryMax: String(salaryMax ?? 99),
    n4OvrMin: String(overallMin ?? 40), n4OvrMax: String(overallMax ?? 250),
  });
  const payload = await dataCenterFetch(`/DataCenter/TeamColorPlayerList?${form.toString()}`, trace, {
    headers: {
      Accept: "application/json,text/plain,*/*",
      Referer: `${DATA_CENTER}/datacenter/teamcolor`,
      "X-Requested-With": "XMLHttpRequest",
    },
  }, env);
  if (!/"players"\s*:/.test(payload)) throw new ApiError(502, "팀컬러 적용 선수 목록을 해석하지 못했습니다.", "TEAM_COLOR_PLAYERS_INVALID", "data-center");
  return parseTeamColorPlayerIds(payload);
}

async function playerFilterMetadata(meta: Metadata, teamColors: Array<{ id: number; name: string; level: number }>, env: Env) {
  return {
    teamColors,
    seasons: [...meta.seasons.entries()].map(([id, name]) => ({ id, name, imageUrl: meta.seasonImages.get(id) ?? "" })).sort((a, b) => b.id - a.id),
    positions: Object.keys(SEARCH_POSITIONS),
    abilities: SEARCH_ABILITIES,
    bodyTypes: ["마름", "보통", "건장"],
    catalog: await playerCatalogStatus(env),
  };
}

async function searchPlayers(url: URL, cache: Cache, ctx: ExecutionContext, env: Env, trace: RequestTrace) {
  const rawQuery = (url.searchParams.get("q") ?? "").trim();
  const query = rawQuery.toLocaleLowerCase("ko-KR");
  const teamColorId = numberParam(url, "teamColorId", 1, 999_999);
  const seasons = listParam(url, "seasonIds").map(Number).filter(Number.isInteger);
  const positions = listParam(url, "positions").filter(value => value.toUpperCase() in SEARCH_POSITIONS);
  const grade = numberParam(url, "grade", 1, 13) ?? 1;
  const overallMin = numberParam(url, "overallMin", 0, 250), overallMax = numberParam(url, "overallMax", 0, 250);
  const salaryMin = numberParam(url, "salaryMin", 0, 99), salaryMax = numberParam(url, "salaryMax", 0, 99);
  const heightMin = numberParam(url, "heightMin", 100, 250), heightMax = numberParam(url, "heightMax", 100, 250);
  const weightMin = numberParam(url, "weightMin", 30, 200), weightMax = numberParam(url, "weightMax", 30, 200);
  const weakFootMin = numberParam(url, "weakFootMin", 1, 5), weakFootMax = numberParam(url, "weakFootMax", 1, 5);
  const skillMovesMin = numberParam(url, "skillMovesMin", 1, 6), skillMovesMax = numberParam(url, "skillMovesMax", 1, 6);
  const bodyTypes = listParam(url, "bodyTypes"), preferredFoot = url.searchParams.get("preferredFoot") ?? "";
  const nation = (url.searchParams.get("nation") ?? "").trim().toLocaleLowerCase("ko-KR");
  const includeTraits = listParam(url, "includeTraits").map(value => value.toLocaleLowerCase("ko-KR"));
  const excludeTraits = listParam(url, "excludeTraits").map(value => value.toLocaleLowerCase("ko-KR"));
  const abilityFilters = listParam(url, "abilities").map(value => {
    const [label, min, max] = value.split(":");
    return { label, min: Number(min) || undefined, max: Number(max) || undefined };
  }).filter(row => SEARCH_ABILITIES.includes(row.label));
  const sort = url.searchParams.get("sort") ?? "overall-desc";
  const page = Math.min(Math.max(Math.trunc(Number(url.searchParams.get("page") ?? 1)), 1), 1_000);
  const pageSize = Math.min(Math.max(Math.trunc(Number(url.searchParams.get("pageSize") ?? url.searchParams.get("limit") ?? 30)), 1), 40);
  const offset = (page - 1) * pageSize;
  const candidateLimit = Math.min(100, Math.max(playerSearchCandidateLimit(pageSize), page * pageSize * 2));
  const hasCondition = teamColorId !== undefined || seasons.length || positions.length || [overallMin, overallMax, salaryMin, salaryMax, heightMin, heightMax, weightMin, weightMax, weakFootMin, weakFootMax, skillMovesMin, skillMovesMax].some(value => value !== undefined) || bodyTypes.length || preferredFoot || nation || includeTraits.length || excludeTraits.length || abilityFilters.length;
  if ((!query && !hasCondition) || rawQuery.length > 40) throw new ApiError(400, "선수명 또는 검색 조건을 입력해 주세요.", "INVALID_PLAYER_QUERY");
  const meta = await loadMetadata(env);
  let candidateIds: number[] = [];
  let degraded = false;
  let storedCandidatesPaged = false;
  let candidateTotal = 0;
  try {
    if (teamColorId !== undefined) {
      candidateIds = await dataCenterTeamColorPlayerIds(teamColorId, rawQuery, seasons, positions, env, trace, salaryMin, salaryMax, overallMin, overallMax);
      if (env.PLAYER_DB) ctx.waitUntil(saveTeamColorPlayers(env.PLAYER_DB, teamColorId, candidateIds));
    } else {
      candidateIds = await dataCenterPlayerIds(rawQuery, seasons, positions, env, trace, salaryMin, salaryMax, overallMin, overallMax);
    }
    candidateTotal = candidateIds.length;
  } catch {
    degraded = true;
    if (env.PLAYER_DB) {
      const stored = await storedPlayerIds(env.PLAYER_DB, { query: rawQuery, seasons, teamColorId, offset, limit: Math.min(100, pageSize * 2) });
      candidateIds = stored.ids;
      candidateTotal = stored.total;
      storedCandidatesPaged = true;
    }
  }
  const candidateSet = new Set(candidateIds);
  const baseRows = [...meta.players.entries()]
    .filter(([spId, name]) => (teamColorId !== undefined ? candidateSet.has(spId) : candidateSet.size ? candidateSet.has(spId) : Boolean(query) && name.toLocaleLowerCase("ko-KR").includes(query)) && (!seasons.length || seasons.includes(Math.floor(spId / 1_000_000))))
    .map(([spId, name]) => {
      const cardSeasonId = Math.floor(spId / 1_000_000);
      const pid = String(spId % 1_000_000);
      return {
        spId,
        name,
        seasonId: cardSeasonId,
        seasonName: meta.seasons.get(cardSeasonId) ?? "시즌 정보 없음",
        imageUrls: [
          `https://fco.dn.nexoncdn.co.kr/live/externalAssets/common/players/p${spId}.png`,
          `https://fco.dn.nexoncdn.co.kr/live/externalAssets/common/playersAction/p${spId}.png`,
          `https://fco.dn.nexoncdn.co.kr/live/externalAssets/common/players/p${pid}.png`,
        ],
        seasonImageUrl: meta.seasonImages.get(cardSeasonId) ?? "",
      };
    })
    .sort((a, b) => Number(b.name.toLocaleLowerCase("ko-KR") === query) - Number(a.name.toLocaleLowerCase("ko-KR") === query) || Number(b.name.toLocaleLowerCase("ko-KR").startsWith(query)) - Number(a.name.toLocaleLowerCase("ko-KR").startsWith(query)) || b.seasonId - a.seasonId)
    .slice(0, candidateLimit);
  const rows: Array<(typeof baseRows)[number] & Awaited<ReturnType<typeof playerSearchFacts>>> = [];
  for (let index = 0; index < baseRows.length; index += 8) {
    const batch = baseRows.slice(index, index + 8);
    const facts = await Promise.allSettled(batch.map(async card => {
      try {
        const live = await loadCachedPlayerFacts(card.spId, grade, cache, ctx, () => playerSearchFacts(card.spId, grade, env, trace));
        if (env.PLAYER_DB) ctx.waitUntil(savePlayerFacts(env.PLAYER_DB, card.spId, grade, live));
        return live;
      } catch (error) {
        if (env.PLAYER_DB) {
          const stored = await loadPlayerFacts<Awaited<ReturnType<typeof playerSearchFacts>>>(env.PLAYER_DB, card.spId, grade);
          if (stored) { degraded = true; return stored; }
        }
        throw error;
      }
    }));
    batch.forEach((card, batchIndex) => {
      if (facts[batchIndex]?.status !== "fulfilled") degraded = true;
      rows.push({ ...card, ...(facts[batchIndex]?.status === "fulfilled" ? facts[batchIndex].value : emptyPlayerSearchFacts(grade)) });
    });
  }
  const filtered = rows.filter(row => {
    const traits = row.traits.map(value => value.toLocaleLowerCase("ko-KR"));
    const abilityMap = new Map(row.abilities.map(item => [item.label, item.value]));
    return (!positions.length || positions.some(value => value === row.primaryPosition || (SEARCH_POSITIONS[value] ?? []).some(code => meta.positions.get(code) === row.primaryPosition)))
      && (overallMin === undefined || row.overall >= overallMin) && (overallMax === undefined || row.overall <= overallMax)
      && (salaryMin === undefined || row.salary >= salaryMin) && (salaryMax === undefined || row.salary <= salaryMax)
      && (heightMin === undefined || numericText(row.height) >= heightMin) && (heightMax === undefined || numericText(row.height) <= heightMax)
      && (weightMin === undefined || numericText(row.weight) >= weightMin) && (weightMax === undefined || numericText(row.weight) <= weightMax)
      && (!bodyTypes.length || bodyTypes.some(value => row.bodyType.includes(value)))
      && (!preferredFoot || row.preferredFoot === preferredFoot)
      && (weakFootMin === undefined || row.weakFoot >= weakFootMin) && (weakFootMax === undefined || row.weakFoot <= weakFootMax)
      && (skillMovesMin === undefined || row.skillMoves >= skillMovesMin) && (skillMovesMax === undefined || row.skillMoves <= skillMovesMax)
      && (!nation || row.nation.toLocaleLowerCase("ko-KR").includes(nation))
      && includeTraits.every(value => traits.some(trait => trait.includes(value)))
      && excludeTraits.every(value => traits.every(trait => !trait.includes(value)))
      && abilityFilters.every(filter => { const value = abilityMap.get(filter.label) ?? 0; return (filter.min === undefined || value >= filter.min) && (filter.max === undefined || value <= filter.max); });
  });
  filtered.sort((a, b) => sort === "overall-asc" ? a.overall - b.overall : sort === "salary-desc" ? b.salary - a.salary : sort === "salary-asc" ? a.salary - b.salary : sort === "name-asc" ? a.name.localeCompare(b.name, "ko-KR") : b.overall - a.overall || b.seasonId - a.seasonId || a.name.localeCompare(b.name, "ko-KR"));
  const pageOffset = storedCandidatesPaged ? 0 : offset;
  const players = filtered.slice(pageOffset, pageOffset + pageSize);
  const total = degraded && candidateTotal > filtered.length ? candidateTotal : filtered.length;
  return {
    query: rawQuery,
    page,
    pageSize,
    total,
    count: players.length,
    hasMore: offset + players.length < total && players.length > 0,
    players,
    catalog: await playerCatalogStatus(env, degraded ? "fallback" : "d1"),
    degraded,
    source: degraded ? "Cloudflare D1 저장 데이터 / NEXON Open API metadata" : "NEXON Open API metadata / EA SPORTS FC ONLINE Data Center",
  };
}

async function dataCenterFetch(path: string, trace: RequestTrace, init?: RequestInit, env?: Env) {
  const upstreamStartedAt = performance.now();
  const response = await fetch(`${DATA_CENTER}${path}`, {
    ...init,
    headers: {
      Accept: "text/html,application/xhtml+xml",
      "Accept-Language": "ko-KR,ko;q=0.9",
      Referer: `${DATA_CENTER}/DataCenter`,
      ...(init?.headers ?? {}),
    },
    signal: AbortSignal.timeout(15_000),
  }).catch(error => {
    const timeout = error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError");
    const code = timeout ? "DATA_CENTER_TIMEOUT" : "DATA_CENTER_NETWORK_ERROR";
    if (env) recordUpstream(env, trace, "data-center", path, performance.now() - upstreamStartedAt, false, 0, code);
    throw new ApiError(502, "FC 온라인 데이터센터에 연결하지 못했습니다.", code, "data-center", { stage: path });
  });
  if (!response.ok) {
    const code = response.status === 403 ? "DATA_CENTER_BLOCKED" : "DATA_CENTER_HTTP_ERROR";
    if (env) recordUpstream(env, trace, "data-center", path, performance.now() - upstreamStartedAt, false, response.status, code);
    throw new ApiError(502, `FC 온라인 데이터센터 응답 오류 (${response.status})`, code, "data-center", { upstreamStatus: response.status, stage: path });
  }
  if (env) recordUpstream(env, trace, "data-center", path, performance.now() - upstreamStartedAt, true, response.status);
  return response.text();
}

function emptyPlayerSearchFacts(grade = 1) {
  return { grade, overall: 0, primaryPosition: "-", salary: 0, height: "", weight: "", bodyType: "", leftFoot: 0, rightFoot: 0, weakFoot: 0, preferredFoot: "-", skillMoves: 0, nation: "", traits: [] as string[], abilities: [] as Array<{ label: string; value: number }> };
}

async function playerSearchFacts(spId: number, grade: number, env: Env, trace: RequestTrace) {
  const form = new URLSearchParams({
    spid: String(spId), n1Strong: String(grade), n1Grow: "0", n4TeamColorId: "0", n4TeamColorLv: "0",
    n4TeamColorId_Enhance: "0", n4TeamColorLv_Enhance: "0", n4TeamColorId_Feature: "0", n1Change: "0", strPlayerImg: "",
  });
  const html = await dataCenterFetch("/datacenter/PlayerAbility", trace, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8" },
    body: form.toString(),
  }, env);
  const validation = validatePlayerAbilityHtml(html, false);
  recordParser(env, trace, "player_search_facts", validation);
  if (!validation.success) {
    throw new ApiError(502, "선수 데이터 형식이 변경되어 검색 정보를 해석하지 못했습니다.", "PARSER_REQUIRED_FIELD_MISSING", "parser", {
      stage: "player-search-facts",
      missingFields: validation.missingFields,
    });
  }
  const foot = firstMatch(html, /<span class="etc foot">([\s\S]*?)<\/span>/i);
  const leftFoot = Number(/L\s*(\d+)/i.exec(foot)?.[1] ?? 0);
  const rightFoot = Number(/R\s*(\d+)/i.exec(foot)?.[1] ?? 0);
  return {
    grade,
    overall: Number(firstMatch(html, /<div class="ovr value">\s*(\d+)/i, "0")),
    primaryPosition: firstMatch(html, /<div class="position">([\s\S]*?)<\/div>/i, "-"),
    salary: Number(firstMatch(html, /<div class="pay">[\s\S]*?<span>\s*(\d+)/i, "0")),
    height: classText(html, "height"),
    weight: classText(html, "weight"),
    bodyType: classText(html, "physical"),
    leftFoot,
    rightFoot,
    weakFoot: Math.min(leftFoot, rightFoot),
    preferredFoot: leftFoot === rightFoot ? "양발" : leftFoot > rightFoot ? "왼발" : "오른발",
    skillMoves: (/<span class="etc skill">\s*<span>([^<]*)<\/span>/i.exec(html)?.[1].match(/★/g) ?? []).length,
    nation: firstMatch(html, /<div class="etc nation">[\s\S]*?<span class="txt">([\s\S]*?)<\/span>/i),
    traits: parseTraits(html),
    abilities: parseAbilities(html),
  };
}

async function playerDetail(url: URL, env: Env, trace: RequestTrace) {
  const spId = Number(url.searchParams.get("spid"));
  const grade = Number(url.searchParams.get("grade") ?? 1);
  const grow = url.searchParams.get("adaptation") === "5" ? 4 : 0;
  const affiliationId = Number(url.searchParams.get("affiliationId") ?? 0);
  const enhancementId = Number(url.searchParams.get("enhancementId") ?? 0);
  const enhancementLevel = Number(url.searchParams.get("enhancementLevel") ?? 0);
  const featureId = Number(url.searchParams.get("featureId") ?? 0);
  if (!Number.isInteger(spId) || spId < 1) throw new ApiError(400, "선수 식별자가 올바르지 않습니다.", "INVALID_SPID");
  if (!Number.isInteger(grade) || grade < 0 || grade > 13) throw new ApiError(400, "강화 단계는 0~13 사이여야 합니다.", "INVALID_GRADE");
  if ([affiliationId, enhancementId, enhancementLevel, featureId].some(value => !Number.isInteger(value) || value < 0)) throw new ApiError(400, "팀컬러 선택값이 올바르지 않습니다.", "INVALID_TEAM_COLOR");

  const detailPath = `/DataCenter/PlayerInfo?spid=${spId}&n1Strong=${grade}`;
  const baseForm = buildPlayerAbilityForm({ spId, grade });
  const post = (body: string) => ({ method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8", Referer: `${DATA_CENTER}${detailPath}` }, body }) satisfies RequestInit;
  const hasModifiers = grow > 0 || affiliationId > 0 || enhancementId > 0 || featureId > 0;
  const [pageHtml, baseAbilityHtml, priceHtml, meta] = await Promise.all([
    dataCenterFetch(detailPath, trace, undefined, env), dataCenterFetch("/datacenter/PlayerAbility", trace, post(baseForm.toString()), env),
    dataCenterFetch("/datacenter/PlayerPriceGraph", trace, post(new URLSearchParams({ spid: String(spId), n1strong: String(grade) }).toString()), env), loadMetadata(env),
  ]);
  const seasonId = Math.floor(spId / 1_000_000);
  const seasonName = meta.seasons.get(seasonId) ?? "시즌 정보 없음";
  const teamColorOptions = parseTeamColorOptions(baseAbilityHtml, seasonName);
  const selectedAffiliation = teamColorOptions.affiliation.find(option => option.id === affiliationId);
  const affiliationLevel = affiliationTeamColorLevel(affiliationId, seasonName, selectedAffiliation?.name ?? "");
  const appliedForm = buildPlayerAbilityForm({ spId, grade, grow, affiliationId, affiliationLevel, enhancementId, enhancementLevel, featureId });
  const abilityHtml = hasModifiers ? await dataCenterFetch("/datacenter/PlayerAbility", trace, post(appliedForm.toString()), env) : baseAbilityHtml;
  const validation = validatePlayerAbilityHtml(abilityHtml);
  const baseValidation = validatePlayerAbilityHtml(baseAbilityHtml);
  recordParser(env, trace, "player_detail", validation);
  if (abilityHtml !== baseAbilityHtml) recordParser(env, trace, "player_detail_base", baseValidation);
  const missingFields = [...new Set([...validation.missingFields, ...baseValidation.missingFields.map(field => `base.${field}`)])];
  const basePositions = parsePositions(baseAbilityHtml);
  const positions = parsePositions(abilityHtml).map(row => ({ ...row, baseValue: basePositions.find(base => base.position === row.position)?.value ?? row.value, delta: row.value - (basePositions.find(base => base.position === row.position)?.value ?? row.value) }));
  const baseAbilities = parseAbilities(baseAbilityHtml);
  const abilities = parseAbilities(abilityHtml).map(row => ({ ...row, baseValue: baseAbilities.find(base => base.label === row.label)?.value ?? row.value, delta: row.value - (baseAbilities.find(base => base.label === row.label)?.value ?? row.value) }));
  const baseSummary = parseSummaryAbilities(baseAbilityHtml);
  const summaryAbilities = parseSummaryAbilities(abilityHtml).map(row => ({ ...row, baseValue: baseSummary.find(base => base.label === row.label)?.value ?? row.value, delta: row.value - (baseSummary.find(base => base.label === row.label)?.value ?? row.value) }));
  const pid = spId % 1_000_000;
  const foot = /<span class="etc foot">([\s\S]*?)<\/span>/i.exec(abilityHtml)?.[1] ?? "";
  const leftFoot = Number(/L\s*(\d+)/i.exec(decodeHtml(foot))?.[1] ?? 0);
  const rightFoot = Number(/R\s*(\d+)/i.exec(decodeHtml(foot))?.[1] ?? 0);
  const name = firstMatch(abilityHtml, /<div class="name">([\s\S]*?)<\/div>/i, meta.players.get(spId) ?? `선수 ${spId}`);
  const price = parsePrice(priceHtml);
  const overall = Number(firstMatch(abilityHtml, /<div class="ovr value">\s*(\d+)/i, "0"));
  const baseOverall = Number(firstMatch(baseAbilityHtml, /<div class="ovr value">\s*(\d+)/i, "0"));
  return {
    spId, grade, name, seasonId, seasonName,
    overall, baseOverall, overallDelta: overall - baseOverall,
    primaryPosition: firstMatch(abilityHtml, /<div class="position">([\s\S]*?)<\/div>/i, positions[0]?.position ?? "-"),
    salary: Number(firstMatch(abilityHtml, /<div class="pay">[\s\S]*?<span>\s*(\d+)/i, "0")),
    birthDate: classText(abilityHtml, "birth"), height: classText(abilityHtml, "height"), weight: classText(abilityHtml, "weight"),
    bodyType: classText(abilityHtml, "physical"), playerClass: classText(abilityHtml, "season"),
    skillMoves: (/<span class="etc skill">\s*<span>([^<]*)<\/span>/i.exec(abilityHtml)?.[1].match(/★/g) ?? []).length,
    leftFoot, rightFoot,
    nation: firstMatch(abilityHtml, /<div class="etc nation">[\s\S]*?<span class="txt">([\s\S]*?)<\/span>/i),
    traits: parseTraits(abilityHtml), positions, summaryAbilities, abilities, teamColorOptions,
    selection: { adaptation: grow ? 5 : 1, affiliationId, affiliationLevel, enhancementId, enhancementLevel, featureId },
    clubCareer: parseClubCareer(pageHtml), rankerStats: parseRankerStats(pageHtml),
    rankerUpdatedAt: firstMatch(pageHtml, /업데이트 일시\s*:\s*([\d-]+)/i), currentPrice: price.current, priceHistory: price.history,
    imageUrls: [
      `https://fco.dn.nexoncdn.co.kr/live/externalAssets/common/playersActionHigh/p${spId}.png`,
      `https://fco.dn.nexoncdn.co.kr/live/externalAssets/common/playersAction/p${spId}.png`,
      `https://fco.dn.nexoncdn.co.kr/live/externalAssets/common/players/p${spId}.png`,
      `https://fco.dn.nexoncdn.co.kr/live/externalAssets/common/players/p${pid}.png`,
    ],
    sourceUrl: `${DATA_CENTER}${detailPath}`,
    source: "EA SPORTS FC ONLINE Data Center / NEXON Open API metadata",
    degraded: !validation.success || !baseValidation.success || validation.partial || baseValidation.partial,
    missingFields,
  };
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    const trace = createRequestTrace(request, env, url.pathname);
    let observedError: ApiError | undefined;
    let response: Response;
    try {
      assertAllowedOrigin(request, env);
      if (request.method === "OPTIONS") {
        response = new Response(null, { status: 204, headers: corsHeaders(request, env) });
      } else if (request.method === "POST" && url.pathname === "/v1/telemetry/client-error") {
        const contentLength = Number(request.headers.get("Content-Length") ?? 0);
        if (contentLength > 16_384) throw new ApiError(413, "오류 보고가 너무 큽니다.", "TELEMETRY_TOO_LARGE", "client");
        if (await checkRateLimits(request, url.pathname, env.API_RATE_LIMITER, env.EXPENSIVE_RATE_LIMITER) !== "allowed") {
          throw new ApiError(429, "요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.", "RATE_LIMITED", "client");
        }
        const raw = await request.text();
        if (raw.length > 16_384) throw new ApiError(413, "오류 보고가 너무 큽니다.", "TELEMETRY_TOO_LARGE", "client");
        let input: unknown;
        try { input = JSON.parse(raw); } catch { throw new ApiError(400, "오류 보고 JSON 형식이 올바르지 않습니다.", "INVALID_TELEMETRY", "client"); }
        recordClientError(env, trace, parseClientErrorPayload(input));
        response = json(request, env, { accepted: true, requestId: trace.requestId }, 202, { "Cache-Control": "no-store" });
      } else {
        if (request.method !== "GET") throw new ApiError(405, "허용되지 않은 요청 방식입니다.", "METHOD_NOT_ALLOWED", "client");
        if (url.pathname === "/" || url.pathname === "/health") {
          response = json(request, env, {
            ok: true,
            service: "FC Online Lab API",
            appVersion: APP_VERSION,
            apiVersion: API_VERSION,
            serverVersion: trace.serverVersion,
            deployedAt: env.CF_VERSION_METADATA?.timestamp ?? null,
            accessPolicy: env.API_ACCESS_POLICY || "public-native",
          }, 200, { "Cache-Control": "no-store" });
        } else {
          const isDashboard = url.pathname === "/v1/dashboard";
          const isPlayerSearch = url.pathname === "/v1/players/search";
          const isPlayerFilters = url.pathname === "/v1/players/filters";
          const isPlayerDetail = url.pathname === "/v1/players/detail";
          const isCatalogStatus = url.pathname === "/v1/catalog/status";
          if (!isDashboard && !isPlayerSearch && !isPlayerFilters && !isPlayerDetail && !isCatalogStatus) throw new ApiError(404, "요청한 API를 찾을 수 없습니다.", "NOT_FOUND", "client");
          if (await checkRateLimits(request, url.pathname, env.API_RATE_LIMITER, env.EXPENSIVE_RATE_LIMITER) !== "allowed") {
            throw new ApiError(429, "요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.", "RATE_LIMITED", "client");
          }

          if ((isPlayerSearch || isPlayerFilters) && env.PLAYER_DB) {
            ctx.waitUntil(playerCatalogStatus(env).then(status => status.stale ? refreshPlayerCatalog(env, trace) : null).catch(() => null));
          }

          const cache = await caches.open("fc-online-lab-api");
          const cacheUrl = new URL(url);
          cacheUrl.searchParams.sort();
          const cacheKey = new Request(cacheUrl.toString(), { method: "GET" });
          const cached = await cache.match(cacheKey);
          if (cached) {
            response = new Response(cached.body, { status: cached.status, headers: { ...Object.fromEntries(cached.headers), ...corsHeaders(request, env), "X-Cache": "HIT" } });
          } else {
            const result = isCatalogStatus
              ? await playerCatalogStatus(env)
              : isPlayerSearch
              ? await searchPlayers(url, cache, ctx, env, trace)
              : isPlayerFilters
                ? await Promise.all([loadMetadata(env), loadTeamColorCatalog(env, trace)]).then(([meta, teamColors]) => playerFilterMetadata(meta, teamColors, env))
                : isPlayerDetail
                  ? await playerDetail(url, env, trace)
                  : await dashboard(url, env, trace);
            const ttl = Math.min(Math.max(Number(env.CACHE_TTL_SECONDS) || 90, 30), 300);
            response = json(request, env, result, 200, { "Cache-Control": `public, max-age=${ttl}`, "X-Cache": "MISS" });
            ctx.waitUntil(cache.put(cacheKey, response.clone()));
          }
        }
      }
    } catch (error) {
      observedError = error instanceof ApiError
        ? error
        : new ApiError(500, "서버 오류가 발생했습니다.", "INTERNAL_ERROR", "worker");
      response = json(request, env, { error: { code: observedError.code, message: observedError.message, source: observedError.source, requestId: trace.requestId } }, observedError.status, {
        "Cache-Control": "no-store",
        ...(observedError.status === 429 ? { "Retry-After": "60" } : {}),
      });
    }
    const headers = new Headers(response.headers);
    for (const [key, value] of Object.entries(diagnosticHeaders(trace))) headers.set(key, value);
    response = new Response(response.body, { status: response.status, statusText: response.statusText, headers });
    recordRequest(env, trace, response.status, response.headers.get("X-Cache") ?? "NONE", observedError);
    return response;
  },
  async scheduled(_controller: ScheduledController, env: Env, ctx: ExecutionContext) {
    const request = new Request("https://fc-online-lab-api.invalid/scheduled/player-catalog", { headers: { "User-Agent": "cloudflare-cron" } });
    const trace = createRequestTrace(request, env, "/scheduled/player-catalog");
    ctx.waitUntil(refreshPlayerCatalog(env, trace));
  },
} satisfies ExportedHandler<Env>;
