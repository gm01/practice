import { buildPlayerAbilityForm } from "./playerAbility";

const API = "https://open.api.nexon.com/fconline/v1";
const META = "https://open.api.nexon.com/static/fconline/meta";
const DATA_CENTER = "https://fconline.nexon.com";
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
  seasonImages: Map<number, string>;
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

async function searchPlayers(url: URL) {
  const query = (url.searchParams.get("q") ?? "").trim().toLocaleLowerCase("ko-KR");
  const seasonId = Number(url.searchParams.get("seasonId") ?? 0);
  const limit = Math.min(Math.max(Number(url.searchParams.get("limit") ?? 30), 1), 40);
  if (!query || query.length > 40) throw new ApiError(400, "검색할 선수명을 입력해 주세요.", "INVALID_PLAYER_QUERY");
  const meta = await loadMetadata();
  const baseRows = [...meta.players.entries()]
    .filter(([spId, name]) => (!seasonId || Math.floor(spId / 1_000_000) === seasonId) && name.toLocaleLowerCase("ko-KR").includes(query))
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
    .sort((a, b) => Number(b.name === query) - Number(a.name === query) || Number(b.name.startsWith(query)) - Number(a.name.startsWith(query)) || b.seasonId - a.seasonId)
    .slice(0, limit);
  const rows: Array<(typeof baseRows)[number] & Awaited<ReturnType<typeof playerSearchFacts>>> = [];
  for (let index = 0; index < baseRows.length; index += 8) {
    const batch = baseRows.slice(index, index + 8);
    const facts = await Promise.allSettled(batch.map(card => playerSearchFacts(card.spId)));
    batch.forEach((card, batchIndex) => rows.push({
      ...card,
      ...(facts[batchIndex]?.status === "fulfilled" ? facts[batchIndex].value : emptyPlayerSearchFacts()),
    }));
  }
  rows.sort((a, b) => b.overall - a.overall || b.seasonId - a.seasonId || a.name.localeCompare(b.name, "ko-KR"));
  return { query: url.searchParams.get("q")?.trim(), count: rows.length, players: rows, source: "NEXON Open API metadata" };
}

function decodeHtml(value: string) {
  return value
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function firstMatch(html: string, expression: RegExp, fallback = "") {
  return decodeHtml(expression.exec(html)?.[1] ?? fallback);
}

function classText(html: string, className: string) {
  return firstMatch(html, new RegExp(`<[^>]+class=["'][^"']*\\b${className}\\b[^"']*["'][^>]*>([\\s\\S]*?)<\\/[^>]+>`, "i"));
}

async function dataCenterFetch(path: string, init?: RequestInit) {
  const response = await fetch(`${DATA_CENTER}${path}`, {
    ...init,
    headers: {
      Accept: "text/html,application/xhtml+xml",
      "Accept-Language": "ko-KR,ko;q=0.9",
      Referer: `${DATA_CENTER}/DataCenter`,
      ...(init?.headers ?? {}),
    },
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new ApiError(502, `FC 온라인 데이터센터 응답 오류 (${response.status})`, "DATA_CENTER_UNAVAILABLE");
  return response.text();
}

function emptyPlayerSearchFacts() {
  return { overall: 0, primaryPosition: "-", salary: 0, height: "", weight: "", bodyType: "", leftFoot: 0, rightFoot: 0, weakFoot: 0, preferredFoot: "-" };
}

async function playerSearchFacts(spId: number) {
  const form = new URLSearchParams({
    spid: String(spId), n1Strong: "1", n1Grow: "0", n4TeamColorId: "0", n4TeamColorLv: "0",
    n4TeamColorId_Enhance: "0", n4TeamColorLv_Enhance: "0", n4TeamColorId_Feature: "0", n1Change: "0", strPlayerImg: "",
  });
  const html = await dataCenterFetch("/datacenter/PlayerAbility", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8" },
    body: form.toString(),
  });
  const foot = firstMatch(html, /<span class="etc foot">([\s\S]*?)<\/span>/i);
  const leftFoot = Number(/L\s*(\d+)/i.exec(foot)?.[1] ?? 0);
  const rightFoot = Number(/R\s*(\d+)/i.exec(foot)?.[1] ?? 0);
  return {
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
  };
}

function parseAbilities(html: string) {
  const start = html.indexOf('<div class="content_bottom">');
  const scope = start >= 0 ? html.slice(start) : html;
  const rows: Array<{ label: string; value: number }> = [];
  const expression = /<li class="ab"[\s\S]*?<div class="txt">([\s\S]*?)<\/div>\s*<div class="value[^"]*">\s*(\d+)/gi;
  for (const match of scope.matchAll(expression)) rows.push({ label: decodeHtml(match[1]), value: Number(match[2]) });
  return rows.filter((row, index) => row.label && rows.findIndex(candidate => candidate.label === row.label) === index);
}

function parseSummaryAbilities(html: string) {
  const start = html.indexOf('<div class="content_middle">');
  const end = html.indexOf('<div class="content_bottom">');
  const scope = start >= 0 && end > start ? html.slice(start, end) : "";
  const rows: Array<{ label: string; value: number }> = [];
  const expression = /<li class="ab">\s*<div class="txt">([\s\S]*?)<\/div>\s*<div class="value[^"]*">\s*(\d+)/gi;
  for (const match of scope.matchAll(expression)) rows.push({ label: decodeHtml(match[1]), value: Number(match[2]) });
  return rows.slice(-6);
}

function parsePositions(html: string) {
  const scope = /<div class="ovr_set">([\s\S]*?)<\/div>\s*<\/div>/.exec(html)?.[1] ?? "";
  const rows: Array<{ position: string; value: number }> = [];
  for (const match of scope.matchAll(/<div class="position\s+([a-z]+)\s+value">\s*(\d+)/gi)) {
    rows.push({ position: match[1].toUpperCase(), value: Number(match[2]) });
  }
  return rows;
}

function parseTraits(html: string) {
  const scope = /<div class="skill_wrap">([\s\S]*?)<div class="en_selector_wrap">/i.exec(html)?.[1] ?? "";
  return [...scope.matchAll(/<span class="desc">([\s\S]*?)<\/span>/gi)].map(match => decodeHtml(match[1])).filter(Boolean);
}

type TeamColorOption = { id: number; level: number; name: string };

function parseTeamColorLinks(scope: string, idIndex: number, levelIndex?: number): TeamColorOption[] {
  const rows: TeamColorOption[] = [];
  const expression = /<a[^>]*onclick="DataCenter\.GetPlayerAbility\(([^)]*)\);?"[^>]*>([\s\S]*?)<\/a>/gi;
  for (const match of scope.matchAll(expression)) {
    const args = match[1].split(",").map(value => Number(value.trim()));
    const id = args[idIndex] ?? 0;
    const level = levelIndex === undefined ? 1 : args[levelIndex] ?? 1;
    const name = decodeHtml(match[2]);
    if (id > 0 && name) rows.push({ id, level, name });
  }
  return rows.filter((row, index) => rows.findIndex(candidate => candidate.id === row.id && candidate.level === row.level) === index);
}

function parseTeamColorOptions(html: string) {
  const start = html.indexOf('<div class="teamcolor_selector_wrap">');
  const end = html.indexOf('<div class="ovr_set">', start);
  const scope = start >= 0 ? html.slice(start, end > start ? end : undefined) : "";
  const affiliationStart = scope.indexOf('<div class="tdefault">');
  const featureStart = scope.indexOf('<div class="tspecial">');
  const enhancementScope = scope.slice(0, affiliationStart >= 0 ? affiliationStart : undefined);
  const affiliationScope = affiliationStart >= 0 ? scope.slice(affiliationStart, featureStart >= 0 ? featureStart : undefined) : "";
  const featureScope = featureStart >= 0 ? scope.slice(featureStart) : "";
  return {
    enhancement: parseTeamColorLinks(enhancementScope, 5, 6),
    affiliation: parseTeamColorLinks(affiliationScope, 3, 4),
    feature: parseTeamColorLinks(featureScope, 7),
  };
}

function parseClubCareer(html: string) {
  const scope = /<div class="content data_detail_club">([\s\S]*?)<\/div>\s*<\/div>\s*<\/div>/i.exec(html)?.[1] ?? "";
  const rows: Array<{ years: string; club: string; loan: string }> = [];
  for (const match of scope.matchAll(/<li>[\s\S]*?<div class="td year">([\s\S]*?)<\/div>[\s\S]*?<div class="td club">([\s\S]*?)<\/div>[\s\S]*?<div class="td rent">([\s\S]*?)<\/div>[\s\S]*?<\/li>/gi)) {
    rows.push({ years: decodeHtml(match[1]), club: decodeHtml(match[2]), loan: decodeHtml(match[3]) });
  }
  return rows;
}

function parseRankerStats(html: string) {
  const scope = /<div class="ranker_record">([\s\S]*?)<div class="view_wrap">/i.exec(html)?.[1] ?? "";
  const labels = ["출전", "득점", "도움", "유효 슈팅", "일반 슈팅", "패스 성공률", "드리블 성공률", "공중볼 경합 성공률", "가로채기", "태클 성공률", "차단 성공률", "선방", "평점"];
  const values = [...scope.matchAll(/<span class="td[^"']*">([\s\S]*?)<\/span>/gi)].map(match => decodeHtml(match[1]));
  return Object.fromEntries(labels.map((label, index) => [label, values[index] ?? "-"]));
}

function parsePrice(html: string) {
  const current = Number((/<strong\s+alt="([\d,]+)"/i.exec(html)?.[1] ?? "0").replace(/,/g, ""));
  let history: Array<{ date: string; value: number }> = [];
  const jsonText = /var json1\s*=\s*({[\s\S]*?})\s*var option\s*=/i.exec(html)?.[1] ?? "";
  if (jsonText) {
    const timeBlock = /"time"\s*:\s*\[([\s\S]*?)\]/i.exec(jsonText)?.[1] ?? "";
    const valueBlock = /"value"\s*:\s*\[([\s\S]*?)\]/i.exec(jsonText)?.[1] ?? "";
    const dates = [...timeBlock.matchAll(/"([^"]+)"/g)].map(match => match[1]);
    const values = [...valueBlock.matchAll(/"([\d.]+)"/g)].map(match => Number(match[1]));
    history = values.map((value, index) => ({ date: dates[index] ?? "", value })).filter(item => item.date && Number.isFinite(item.value));
  }
  return { current, history: history.slice(-365) };
}

async function playerDetail(url: URL) {
  const spId = Number(url.searchParams.get("spid"));
  const grade = Number(url.searchParams.get("grade") ?? 1);
  const grow = url.searchParams.get("adaptation") === "5" ? 4 : 0;
  const affiliationId = Number(url.searchParams.get("affiliationId") ?? 0);
  const affiliationLevel = Number(url.searchParams.get("affiliationLevel") ?? (affiliationId > 0 ? 1 : 0));
  const enhancementId = Number(url.searchParams.get("enhancementId") ?? 0);
  const enhancementLevel = Number(url.searchParams.get("enhancementLevel") ?? 0);
  const featureId = Number(url.searchParams.get("featureId") ?? 0);
  if (!Number.isInteger(spId) || spId < 1) throw new ApiError(400, "선수 식별자가 올바르지 않습니다.", "INVALID_SPID");
  if (!Number.isInteger(grade) || grade < 0 || grade > 13) throw new ApiError(400, "강화 단계는 0~13 사이여야 합니다.", "INVALID_GRADE");
  if ([affiliationId, affiliationLevel, enhancementId, enhancementLevel, featureId].some(value => !Number.isInteger(value) || value < 0)) throw new ApiError(400, "팀컬러 선택값이 올바르지 않습니다.", "INVALID_TEAM_COLOR");

  const detailPath = `/DataCenter/PlayerInfo?spid=${spId}&n1Strong=${grade}`;
  const baseForm = buildPlayerAbilityForm({ spId, grade });
  const appliedForm = buildPlayerAbilityForm({ spId, grade, grow, affiliationId, affiliationLevel, enhancementId, enhancementLevel, featureId });
  const post = (body: string) => ({ method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8", Referer: `${DATA_CENTER}${detailPath}` }, body }) satisfies RequestInit;
  const hasModifiers = grow > 0 || affiliationId > 0 || enhancementId > 0 || featureId > 0;
  const [pageHtml, baseAbilityHtml, priceHtml, meta] = await Promise.all([
    dataCenterFetch(detailPath), dataCenterFetch("/datacenter/PlayerAbility", post(baseForm.toString())),
    dataCenterFetch("/datacenter/PlayerPriceGraph", post(new URLSearchParams({ spid: String(spId), n1strong: String(grade) }).toString())), loadMetadata(),
  ]);
  const abilityHtml = hasModifiers ? await dataCenterFetch("/datacenter/PlayerAbility", post(appliedForm.toString())) : baseAbilityHtml;
  const basePositions = parsePositions(baseAbilityHtml);
  const positions = parsePositions(abilityHtml).map(row => ({ ...row, baseValue: basePositions.find(base => base.position === row.position)?.value ?? row.value, delta: row.value - (basePositions.find(base => base.position === row.position)?.value ?? row.value) }));
  const baseAbilities = parseAbilities(baseAbilityHtml);
  const abilities = parseAbilities(abilityHtml).map(row => ({ ...row, baseValue: baseAbilities.find(base => base.label === row.label)?.value ?? row.value, delta: row.value - (baseAbilities.find(base => base.label === row.label)?.value ?? row.value) }));
  const baseSummary = parseSummaryAbilities(baseAbilityHtml);
  const summaryAbilities = parseSummaryAbilities(abilityHtml).map(row => ({ ...row, baseValue: baseSummary.find(base => base.label === row.label)?.value ?? row.value, delta: row.value - (baseSummary.find(base => base.label === row.label)?.value ?? row.value) }));
  const seasonId = Math.floor(spId / 1_000_000);
  const pid = spId % 1_000_000;
  const foot = /<span class="etc foot">([\s\S]*?)<\/span>/i.exec(abilityHtml)?.[1] ?? "";
  const leftFoot = Number(/L\s*(\d+)/i.exec(decodeHtml(foot))?.[1] ?? 0);
  const rightFoot = Number(/R\s*(\d+)/i.exec(decodeHtml(foot))?.[1] ?? 0);
  const name = firstMatch(abilityHtml, /<div class="name">([\s\S]*?)<\/div>/i, meta.players.get(spId) ?? `선수 ${spId}`);
  const price = parsePrice(priceHtml);
  const overall = Number(firstMatch(abilityHtml, /<div class="ovr value">\s*(\d+)/i, "0"));
  const baseOverall = Number(firstMatch(baseAbilityHtml, /<div class="ovr value">\s*(\d+)/i, "0"));
  return {
    spId, grade, name, seasonId, seasonName: meta.seasons.get(seasonId) ?? "시즌 정보 없음",
    overall, baseOverall, overallDelta: overall - baseOverall,
    primaryPosition: firstMatch(abilityHtml, /<div class="position">([\s\S]*?)<\/div>/i, positions[0]?.position ?? "-"),
    salary: Number(firstMatch(abilityHtml, /<div class="pay">[\s\S]*?<span>\s*(\d+)/i, "0")),
    birthDate: classText(abilityHtml, "birth"), height: classText(abilityHtml, "height"), weight: classText(abilityHtml, "weight"),
    bodyType: classText(abilityHtml, "physical"), playerClass: classText(abilityHtml, "season"),
    skillMoves: (/<span class="etc skill">\s*<span>([^<]*)<\/span>/i.exec(abilityHtml)?.[1].match(/★/g) ?? []).length,
    leftFoot, rightFoot,
    nation: firstMatch(abilityHtml, /<div class="etc nation">[\s\S]*?<span class="txt">([\s\S]*?)<\/span>/i),
    traits: parseTraits(abilityHtml), positions, summaryAbilities, abilities, teamColorOptions: parseTeamColorOptions(baseAbilityHtml),
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
      const isDashboard = url.pathname === "/v1/dashboard";
      const isPlayerSearch = url.pathname === "/v1/players/search";
      const isPlayerDetail = url.pathname === "/v1/players/detail";
      if (!isDashboard && !isPlayerSearch && !isPlayerDetail) throw new ApiError(404, "요청한 API를 찾을 수 없습니다.", "NOT_FOUND");
      checkRateLimit(request);

      const cache = await caches.open("fc-online-lab-api");
      const cacheUrl = new URL(url);
      cacheUrl.searchParams.sort();
      const cacheKey = new Request(cacheUrl.toString(), { method: "GET" });
      const cached = await cache.match(cacheKey);
      if (cached) return new Response(cached.body, { status: cached.status, headers: { ...Object.fromEntries(cached.headers), ...corsHeaders(request, env), "X-Cache": "HIT" } });

      const result = isPlayerSearch ? await searchPlayers(url) : isPlayerDetail ? await playerDetail(url) : await dashboard(url, env);
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
