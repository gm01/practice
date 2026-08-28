import { app, BrowserWindow, ipcMain, shell } from "electron";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { gameMinute } from "../shared/nexon";

const API_BASE_URL = "https://open.api.nexon.com/fconline/v1";
const NEXON_LOGIN_URL =
  "https://nxlogin.nexon.com/common/login.aspx?redirect=https%3A%2F%2Ffconline.nexon.com%2Fmain%2Findex";
const SERVICE_API = process.env.FC_ONLINE_API_BASE_URL?.trim() || "https://fc-online-lab-api.bebebe97.workers.dev";

type MatchSummary = {
  id: string;
  matchDate: string;
  result: string;
  myScore: number;
  opponentScore: number;
  ownGoalsFor: number;
  ownGoalsAgainst: number;
  opponentNickname: string;
  divisionName: string;
  opponentDivisionName: string;
  controller: string;
  endType: number;
  stats: MatchStats;
  opponentStats: MatchStats;
  players: PlayerSummary[];
  opponentPlayers: PlayerSummary[];
  topPlayers: PlayerSummary[];
  shots: ShotSummary[];
  opponentShots: ShotSummary[];
  goals: Array<{ minute: number; playerName: string; assistName: string | null; side: "mine" | "opponent" }>;
};

type MatchStats = {
    possession: number | null;
    shots: number | null;
    effectiveShots: number | null;
    passAccuracy: number | null;
    tackles: number | null;
    corners: number | null;
    fouls: number | null;
    offsides: number | null;
    yellowCards: number | null;
    redCards: number | null;
    averageRating: number | null;
};

type PlayerSummary = {
  spId: number;
  name: string;
  position: string;
  positionCode: number;
  grade: number;
  rating: number;
  goals: number;
  assists: number;
  shots: number;
  effectiveShots: number;
  passTry: number;
  passSuccess: number;
  imageUrls: string[];
};

type ShotSummary = { x: number; y: number; isGoal: boolean; playerName: string; assistName: string | null; minute: number; type: number; inPenalty: boolean };

type Profile = { ouid: string; nickname: string; level: number };
type DivisionRecord = { matchType: number; division: number; achievementDate: string };
type MetaData = {
  divisions: Map<number, string>;
  players: Map<number, string>;
  positions: Map<number, string>;
  matchTypes: Array<{ id: number; name: string }>;
  seasons: Map<number, { name: string; imageUrl: string }>;
};

type ApiErrorBody = { error?: { name?: string; message?: string } };

function networkErrorMessage(error: unknown): string {
  const cause = error instanceof Error ? (error as Error & { cause?: { code?: string } }).cause : undefined;
  if (cause?.code === "ENOTFOUND") return "넥슨 API 서버 주소를 찾지 못했습니다. 네트워크 연결을 확인한 뒤 다시 시도해 주세요.";
  if (error instanceof Error && error.name === "TimeoutError") return "넥슨 API 응답 시간이 초과되었습니다. 잠시 후 다시 시도해 주세요.";
  return "넥슨 API 서버에 연결하지 못했습니다. 네트워크 연결을 확인해 주세요.";
}

async function fetchWithRetry(url: URL | string, init: RequestInit = {}): Promise<Response> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await fetch(url, { ...init, signal: init.signal ?? AbortSignal.timeout(10_000) });
    } catch (error) {
      lastError = error;
      if (attempt < 2) await new Promise((resolve) => setTimeout(resolve, 600 * (attempt + 1)));
    }
  }
  throw new Error(networkErrorMessage(lastError), { cause: lastError });
}

async function nexonRequest<T>(path: string, apiKey: string, params: Record<string, string | number>): Promise<T> {
  const url = new URL(`${API_BASE_URL}${path}`);
  Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, String(value)));
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const response = await fetchWithRetry(url, {
      headers: { "x-nxopen-api-key": apiKey },
    });
    if (response.ok) return response.json() as Promise<T>;
    const body = (await response.json().catch(() => ({}))) as ApiErrorBody;
    const rawMessage = body.error?.message ?? `Nexon API 요청 실패 (${response.status})`;
    const message = /api\s*key|apikey/i.test(rawMessage) && /not valid|invalid/i.test(rawMessage)
      ? "Nexon Open API 키가 유효하지 않습니다. 새로 발급한 API 키를 입력해 주세요."
      : rawMessage;
    const retryable = response.status === 429 || response.status >= 500 || message.includes("try again");
    if (!retryable || attempt === 2) throw new Error(message);
    await new Promise((resolve) => setTimeout(resolve, 500 * (attempt + 1)));
  }
  throw new Error("Nexon API 요청을 완료하지 못했습니다.");
}

let metadataPromise: Promise<MetaData> | undefined;

function fetchMetadata(): Promise<MetaData> {
  if (!metadataPromise) {
    const base = "https://open.api.nexon.com/static/fconline/meta";
    metadataPromise = Promise.all([
      fetchWithRetry(`${base}/division.json`).then((response) => response.json()) as Promise<Array<{ divisionId: number; divisionName: string }>>,
      fetchWithRetry(`${base}/spid.json`).then((response) => response.json()) as Promise<Array<{ id: number; name: string }>>,
      fetchWithRetry(`${base}/spposition.json`).then((response) => response.json()) as Promise<Array<{ spposition: number; desc: string }>>,
      fetchWithRetry(`${base}/matchtype.json`).then((response) => response.json()) as Promise<Array<{ matchtype: number; desc: string }>>,
      fetchWithRetry(`${base}/seasonid.json`).then((response) => response.json()) as Promise<Array<{ seasonId: number; className: string; seasonImg: string }>>,
    ]).then(([divisions, players, positions, matchTypes, seasons]) => ({
      divisions: new Map(divisions.map((item) => [item.divisionId, item.divisionName])),
      players: new Map(players.map((item) => [item.id, item.name])),
      positions: new Map(positions.map((item) => [item.spposition, item.desc])),
      matchTypes: matchTypes.map((item) => ({ id: item.matchtype, name: item.desc })),
      seasons: new Map(seasons.map((item) => [item.seasonId, { name: item.className, imageUrl: item.seasonImg }])),
    })).catch((error) => {
      metadataPromise = undefined;
      throw error;
    });
  }
  return metadataPromise;
}

function numberOrNull(value: unknown): number | null {
  return typeof value === "number" ? value : null;
}

function mapStats(info: Record<string, unknown>): MatchStats {
  const detail = info.matchDetail as Record<string, unknown> | undefined;
  const shoot = info.shoot as Record<string, unknown> | undefined;
  const pass = info.pass as Record<string, unknown> | undefined;
  const defence = info.defence as Record<string, unknown> | undefined;
  const passTry = numberOrNull(pass?.passTry);
  const passSuccess = numberOrNull(pass?.passSuccess);
  return {
    possession: numberOrNull(detail?.possession),
    shots: numberOrNull(shoot?.shootTotal),
    effectiveShots: numberOrNull(shoot?.effectiveShootTotal),
    passAccuracy: passTry && passSuccess !== null ? Math.round((passSuccess / passTry) * 100) : null,
    tackles: numberOrNull(defence?.tackleSuccess),
    corners: numberOrNull(detail?.cornerKick),
    fouls: numberOrNull(detail?.foul),
    offsides: numberOrNull(detail?.offsideCount),
    yellowCards: numberOrNull(detail?.yellowCards),
    redCards: numberOrNull(detail?.redCards),
    averageRating: numberOrNull(detail?.averageRating),
  };
}

function mapPlayers(info: Record<string, unknown>, metadata: MetaData): PlayerSummary[] {
  const rawPlayers = (info.player as Array<Record<string, unknown>> | undefined) ?? [];
  return rawPlayers.map((player) => {
    const status = player.status as Record<string, unknown> | undefined;
    const spId = Number(player.spId);
    const pid = String(spId % 1_000_000);
    const season = metadata.seasons.get(Math.floor(spId / 1_000_000));
    return {
      spId,
      name: metadata.players.get(spId) ?? `선수 ${spId}`,
      position: metadata.positions.get(Number(player.spPosition)) ?? "-",
      positionCode: Number(player.spPosition),
      grade: Number(player.spGrade ?? 0),
      rating: Number(status?.spRating ?? 0),
      goals: Number(status?.goal ?? 0),
      assists: Number(status?.assist ?? 0),
      shots: Number(status?.shoot ?? 0),
      effectiveShots: Number(status?.effectiveShoot ?? 0),
      passTry: Number(status?.passTry ?? 0),
      passSuccess: Number(status?.passSuccess ?? 0),
      imageUrls: [
        `https://fco.dn.nexoncdn.co.kr/live/externalAssets/common/players/p${spId}.png`,
        `https://fco.dn.nexoncdn.co.kr/live/externalAssets/common/playersAction/p${spId}.png`,
        `https://fco.dn.nexoncdn.co.kr/live/externalAssets/common/players/p${pid}.png`,
        `https://fco.dn.nexoncdn.co.kr/live/externalAssets/common/playersAction/p${pid}.png`,
      ],
      seasonName: season?.name ?? "시즌 정보 없음",
      seasonImageUrl: season?.imageUrl ?? "",
    };
  });
}

function mapShots(info: Record<string, unknown>, metadata: MetaData): ShotSummary[] {
  const rawShots = (info.shootDetail as Array<Record<string, unknown>> | undefined) ?? [];
  return rawShots.map((shot) => {
    const spId = Number(shot.spId);
    const assistSpId = Number(shot.assistSpId ?? 0);
    return {
      x: Math.max(0, Math.min(1, Number(shot.x ?? 0))),
      y: Math.max(0, Math.min(1, Number(shot.y ?? 0))),
      isGoal: Number(shot.result) === 3,
      playerName: metadata.players.get(spId) ?? "선수 정보 없음",
      assistName: Boolean(shot.assist) && assistSpId ? metadata.players.get(assistSpId) ?? `선수 ${assistSpId}` : null,
      minute: gameMinute(Number(shot.goalTime ?? 0)),
      type: Number(shot.type ?? 0),
      inPenalty: Boolean(shot.inPenalty),
    };
  });
}

async function resolveOuid(apiKey: string, nickname: string): Promise<string> {
  const identity = await nexonRequest<{ ouid?: string }>("/id", apiKey, { nickname: nickname.trim() });
  if (!identity.ouid) throw new Error("구단주 정보를 찾지 못했습니다.");
  return identity.ouid;
}

async function fetchDashboard(apiKey: string, nickname: string, offset: number, matchType: number) {
  const ouid = await resolveOuid(apiKey, nickname);

  const [profile, divisions, matchIds, metadata] = await Promise.all([
    offset === 0 ? nexonRequest<Profile>("/user/basic", apiKey, { ouid }) : Promise.resolve(null),
    offset === 0 ? nexonRequest<DivisionRecord[]>("/user/maxdivision", apiKey, { ouid }) : Promise.resolve([]),
    nexonRequest<string[]>("/user/match", apiKey, { ouid, matchtype: matchType, offset, limit: 20 }),
    fetchMetadata(),
  ]);

  const matches: MatchSummary[] = [];
  const failures: Array<{ matchId: string; message: string }> = [];
  for (const matchId of matchIds) {
    try {
      const detail = await nexonRequest<{ matchDate?: string; matchInfo?: Array<Record<string, unknown>> }>(
        "/match-detail",
        apiKey,
        { matchid: matchId },
      );
      const players = detail.matchInfo ?? [];
      const mine = players.find((player) => player.ouid === ouid);
      const opponent = players.find((player) => player.ouid !== ouid);
      if (!mine || !opponent) throw new Error("경기 상세 정보를 해석할 수 없습니다.");

      const mineDetail = mine.matchDetail as { matchResult?: string } | undefined;
      const mineShoot = mine.shoot as Record<string, unknown> | undefined;
      const opponentShoot = opponent.shoot as Record<string, unknown> | undefined;
      const myPlayers = mapPlayers(mine, metadata);
      const opponentPlayers = mapPlayers(opponent, metadata);
      const topPlayers = myPlayers
        .filter((player) => player.rating > 0)
        .sort((a, b) => b.rating - a.rating)
        .slice(0, 3);
      const divisionId = Number(mine.division ?? 0);
      const opponentDivisionId = Number(opponent.division ?? 0);
      const shots = mapShots(mine, metadata);
      const opponentShots = mapShots(opponent, metadata);
      const detailInfo = mine.matchDetail as Record<string, unknown> | undefined;
      matches.push({
        id: matchId,
        matchDate: detail.matchDate ?? "",
        result: mineDetail?.matchResult ?? "기록 없음",
        myScore: Number(mineShoot?.goalTotalDisplay ?? mineShoot?.goalTotal ?? 0),
        opponentScore: Number(opponentShoot?.goalTotalDisplay ?? opponentShoot?.goalTotal ?? 0),
        // ownGoal belongs to the participant who put the ball into their own net.
        // It therefore contributes to the other participant's score.
        ownGoalsFor: Number(opponentShoot?.ownGoal ?? 0),
        ownGoalsAgainst: Number(mineShoot?.ownGoal ?? 0),
        opponentNickname: String(opponent.nickname ?? "상대 구단주"),
        divisionName: metadata.divisions.get(divisionId) ?? "등급 정보 없음",
        opponentDivisionName: metadata.divisions.get(opponentDivisionId) ?? "등급 정보 없음",
        controller: String(detailInfo?.controller ?? "정보 없음"),
        endType: Number(detailInfo?.matchEndType ?? 0),
        stats: mapStats(mine),
        opponentStats: mapStats(opponent),
        players: myPlayers,
        opponentPlayers,
        topPlayers,
        shots,
        opponentShots,
        goals: [
          ...shots.filter((shot) => shot.isGoal).map(({ minute, playerName, assistName }) => ({ minute, playerName, assistName, side: "mine" as const })),
          ...opponentShots.filter((shot) => shot.isGoal).map(({ minute, playerName, assistName }) => ({ minute, playerName, assistName, side: "opponent" as const })),
        ].sort((a, b) => a.minute - b.minute),
      });
    } catch (error) {
      failures.push({ matchId, message: error instanceof Error ? error.message : "경기 상세 조회 실패" });
    }
      await new Promise((resolve) => setTimeout(resolve, 180));
  }

  const officialDivision = divisions.find((item) => item.matchType === matchType);
  return {
    profile: profile ? {
      ...profile,
      divisionName: officialDivision ? metadata.divisions.get(officialDivision.division) ?? "등급 정보 없음" : "기록 없음",
      divisionDate: officialDivision?.achievementDate ?? null,
    } : null,
    matches,
    failures,
    matchTypes: metadata.matchTypes,
  };
}

async function fetchTrades(apiKey: string) {
  const metadata = await fetchMetadata();
  const enrich = (type: "buy" | "sell") => async (item: { tradeDate: string; saleSn: string; spid: number; grade: number; value: number }) => {
    const season = metadata.seasons.get(Math.floor(item.spid / 1_000_000));
    return { ...item, type, playerName: metadata.players.get(item.spid) ?? `선수 ${item.spid}`, seasonName: season?.name ?? "시즌 정보 없음", seasonImageUrl: season?.imageUrl ?? "" };
  };
  const buys = await nexonRequest<Array<{ tradeDate: string; saleSn: string; spid: number; grade: number; value: number }>>("/user/trade", apiKey, { tradetype: "buy", offset: 0, limit: 20 });
  await new Promise((resolve) => setTimeout(resolve, 250));
  const sells = await nexonRequest<Array<{ tradeDate: string; saleSn: string; spid: number; grade: number; value: number }>>("/user/trade", apiKey, { tradetype: "sell", offset: 0, limit: 20 });
  const trades = [...await Promise.all(buys.map(enrich("buy"))), ...await Promise.all(sells.map(enrich("sell")))].sort((a, b) => b.tradeDate.localeCompare(a.tradeDate));
  return { trades };
}

async function fetchRankerStats(apiKey: string, players: Array<{ id: number; po: number }>) {
  const metadata = await fetchMetadata();
  const result = await nexonRequest<Array<{ spid: number; spPosition: number; status: Record<string, number>; createDate: string }>>("/ranker-stats", apiKey, { matchtype: 50, players: JSON.stringify(players.slice(0, 5)) });
  return result.map((item) => ({ ...item, playerName: metadata.players.get(item.spid) ?? `선수 ${item.spid}`, position: metadata.positions.get(item.spPosition) ?? "-" }));
}

function createWindow(): void {
  const window = new BrowserWindow({
    width: 1120,
    height: 760,
    minWidth: 900,
    minHeight: 640,
    backgroundColor: "#07110d",
    titleBarStyle: process.platform === "darwin" ? "hiddenInset" : "default",
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, "../preload/preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  window.once("ready-to-show", () => window.show());

  window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  window.webContents.on("will-navigate", (event, url) => {
    const allowed = process.env.ELECTRON_RENDERER_URL ?? `file://${join(__dirname, "../renderer/index.html")}`;
    if (!url.startsWith(allowed)) event.preventDefault();
  });

  if (process.env.ELECTRON_RENDERER_URL) window.loadURL(process.env.ELECTRON_RENDERER_URL);
  else window.loadFile(join(__dirname, "../renderer/index.html"));
}

const hasSingleInstanceLock = app.requestSingleInstanceLock();
if (!hasSingleInstanceLock) app.quit();
else app.on("second-instance", () => {
  const window = BrowserWindow.getAllWindows()[0];
  if (window?.isMinimized()) window.restore();
  window?.focus();
});

app.setAboutPanelOptions({
  applicationName: "FC Online Lab",
  applicationVersion: app.getVersion(),
  copyright: "Data based on NEXON Open API",
});

async function fetchServiceDashboard(nickname: string, offset: number, matchType: number) {
  const url = new URL("/v1/dashboard", SERVICE_API);
  url.searchParams.set("nickname", nickname);
  url.searchParams.set("offset", String(offset));
  url.searchParams.set("limit", "20");
  url.searchParams.set("matchtype", String(matchType));
  const response = await fetch(url, { signal: AbortSignal.timeout(35_000) });
  const body = await response.json().catch(() => ({})) as Record<string, unknown>;
  if (!response.ok) {
    const error = body.error as { message?: string } | undefined;
    throw new Error(error?.message ?? `전적 조회에 실패했습니다. (${response.status})`);
  }
  return {
    profile: body.profile ?? null,
    matches: body.matches ?? [],
    failures: ((body.warnings as string[] | undefined) ?? []).map((message, index) => ({ matchId: `warning-${index}`, message })),
    matchTypes: [
      { id: 50, name: "공식경기" }, { id: 52, name: "감독모드" }, { id: 60, name: "공식 친선" },
      { id: 40, name: "커스텀 매치" }, { id: 30, name: "리그 친선" },
    ],
  };
}

async function fetchServicePlayers(query: string) {
  const url = new URL("/v1/players/search", SERVICE_API);
  url.searchParams.set("q", query);
  url.searchParams.set("limit", "50");
  const response = await fetch(url, { signal: AbortSignal.timeout(20_000) });
  const body = await response.json().catch(() => ({})) as { players?: unknown[]; error?: { message?: string } };
  if (!response.ok) throw new Error(body.error?.message ?? "선수 검색에 실패했습니다.");
  return body.players ?? [];
}

type PlayerDetailOptions = { adaptation?: 1 | 5; affiliationId?: number; enhancementId?: number; enhancementLevel?: number; featureId?: number };

async function fetchServicePlayerDetail(spId: number, grade: number, options: PlayerDetailOptions = {}) {
  const url = new URL("/v1/players/detail", SERVICE_API);
  url.searchParams.set("spid", String(spId));
  url.searchParams.set("grade", String(grade));
  for (const [key, value] of Object.entries(options)) if (Number.isInteger(value) && Number(value) >= 0) url.searchParams.set(key, String(value));
  const response = await fetch(url, { signal: AbortSignal.timeout(25_000) });
  const body = await response.json().catch(() => ({})) as { error?: { message?: string } };
  if (!response.ok) throw new Error(body.error?.message ?? "선수 상세 정보를 불러오지 못했습니다.");
  return body;
}

app.whenReady().then(() => {
  const requireText = (value: unknown, label: string, maxLength: number): string => {
    if (typeof value !== "string" || !value.trim() || value.length > maxLength) throw new Error(`${label} 입력값이 올바르지 않습니다.`);
    return value.trim();
  };
  const allowedMatchTypes = new Set([30, 40, 50, 52, 60, 204, 214, 224, 234]);
  ipcMain.handle("dashboard:fetch", (_event, input: { apiKey?: string; nickname: string; offset: number; matchType: number }) =>
    fetchServiceDashboard(
      requireText(input?.nickname, "구단주명", 32),
      Number.isInteger(input?.offset) && input.offset >= 0 && input.offset <= 10_000 ? input.offset : 0,
      allowedMatchTypes.has(input?.matchType) ? input.matchType : 50,
    ),
  );
  ipcMain.handle("players:search", (_event, query: string) => fetchServicePlayers(requireText(query, "선수명", 40)));
  ipcMain.handle("players:detail", (_event, input: { spId: number; grade: number; options?: PlayerDetailOptions }) => {
    if (!Number.isInteger(input?.spId) || input.spId < 1) throw new Error("선수 식별자가 올바르지 않습니다.");
    const grade = Number.isInteger(input?.grade) && input.grade >= 0 && input.grade <= 13 ? input.grade : 1;
    return fetchServicePlayerDetail(input.spId, grade, input.options);
  });
  ipcMain.handle("trades:fetch", (_event, input: { apiKey: string }) => fetchTrades(requireText(input?.apiKey, "API 키", 512)));
  ipcMain.handle("ranker:fetch", (_event, input: { apiKey: string; players: Array<{ id: number; po: number }> }) => {
    const players = Array.isArray(input?.players) ? input.players.filter((player) => Number.isInteger(player?.id) && Number.isInteger(player?.po)).slice(0, 5) : [];
    if (!players.length) throw new Error("랭커 비교 선수 정보가 올바르지 않습니다.");
    return fetchRankerStats(requireText(input?.apiKey, "API 키", 512), players);
  });
  ipcMain.handle("settings:load", async () => {
    try {
      return JSON.parse(await readFile(join(app.getPath("userData"), "settings.json"), "utf8"));
    } catch {
      return { nickname: "" };
    }
  });
  ipcMain.handle("settings:save", async (_event, nickname: string) => {
    await writeFile(
      join(app.getPath("userData"), "settings.json"),
      JSON.stringify({ nickname: nickname.trim() }, null, 2),
      "utf8",
    );
  });
  ipcMain.handle("login:open", () => shell.openExternal(NEXON_LOGIN_URL));
  createWindow();
  app.on("activate", () => BrowserWindow.getAllWindows().length === 0 && createWindow());
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
