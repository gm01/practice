import { app, BrowserWindow, ipcMain, shell } from "electron";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

const API_BASE_URL = "https://open.api.nexon.com/fconline/v1";
const NEXON_LOGIN_URL =
  "https://nxlogin.nexon.com/common/login.aspx?redirect=https%3A%2F%2Ffconline.nexon.com%2Fmain%2Findex";

type MatchSummary = {
  id: string;
  matchDate: string;
  result: string;
  myScore: number;
  opponentScore: number;
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
  imageUrls: string[];
};

type ShotSummary = { x: number; y: number; isGoal: boolean; playerName: string; assistName: string | null; minute: number };

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

async function nexonRequest<T>(path: string, apiKey: string, params: Record<string, string | number>): Promise<T> {
  const url = new URL(`${API_BASE_URL}${path}`);
  Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, String(value)));
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const response = await fetch(url, {
      headers: { "x-nxopen-api-key": apiKey },
      signal: AbortSignal.timeout(10_000),
    });
    if (response.ok) return response.json() as Promise<T>;
    const body = (await response.json().catch(() => ({}))) as ApiErrorBody;
    const message = body.error?.message ?? `Nexon API 요청 실패 (${response.status})`;
    const retryable = response.status === 429 || response.status >= 500 || message.includes("try again");
    if (!retryable || attempt === 2) throw new Error(message);
    await new Promise((resolve) => setTimeout(resolve, 500 * (attempt + 1)));
  }
  throw new Error("Nexon API 요청을 완료하지 못했습니다.");
}

let metadataPromise: Promise<MetaData> | undefined;
const identityCache = new Map<string, string>();

function fetchMetadata(): Promise<MetaData> {
  if (!metadataPromise) {
    const base = "https://open.api.nexon.com/static/fconline/meta";
    metadataPromise = Promise.all([
      fetch(`${base}/division.json`).then((response) => response.json()) as Promise<Array<{ divisionId: number; divisionName: string }>>,
      fetch(`${base}/spid.json`).then((response) => response.json()) as Promise<Array<{ id: number; name: string }>>,
      fetch(`${base}/spposition.json`).then((response) => response.json()) as Promise<Array<{ spposition: number; desc: string }>>,
      fetch(`${base}/matchtype.json`).then((response) => response.json()) as Promise<Array<{ matchtype: number; desc: string }>>,
      fetch(`${base}/seasonid.json`).then((response) => response.json()) as Promise<Array<{ seasonId: number; className: string; seasonImg: string }>>,
    ]).then(([divisions, players, positions, matchTypes, seasons]) => ({
      divisions: new Map(divisions.map((item) => [item.divisionId, item.divisionName])),
      players: new Map(players.map((item) => [item.id, item.name])),
      positions: new Map(positions.map((item) => [item.spposition, item.desc])),
      matchTypes: matchTypes.map((item) => ({ id: item.matchtype, name: item.desc })),
      seasons: new Map(seasons.map((item) => [item.seasonId, { name: item.className, imageUrl: item.seasonImg }])),
    }));
  }
  return metadataPromise;
}

function numberOrNull(value: unknown): number | null {
  return typeof value === "number" ? value : null;
}

function gameMinute(rawTime: number): number {
  const periodSize = 2 ** 24;
  const period = Math.min(Math.floor(rawTime / periodSize), 4);
  const periodOffsets = [0, 45 * 60, 90 * 60, 105 * 60, 120 * 60];
  const seconds = rawTime - period * periodSize + periodOffsets[period];
  return Math.floor(seconds / 60) + 1;
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
    const pid = String(spId % 1_000_000).padStart(6, "0");
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
    };
  });
}

async function resolveOuid(apiKey: string, nickname: string): Promise<string> {
  let ouid = identityCache.get(nickname);
  if (!ouid) {
    const identity = await nexonRequest<{ ouid?: string }>("/id", apiKey, { nickname });
    if (!identity.ouid) throw new Error("구단주 정보를 찾지 못했습니다.");
    ouid = identity.ouid;
    identityCache.set(nickname, ouid);
  }
  return ouid;
}

async function fetchDashboard(apiKey: string, nickname: string, offset: number, matchType: number) {
  const ouid = await resolveOuid(apiKey, nickname);

  const [profile, divisions, matchIds, metadata] = await Promise.all([
    offset === 0 ? nexonRequest<Profile>("/user/basic", apiKey, { ouid }) : Promise.resolve(null),
    offset === 0 ? nexonRequest<DivisionRecord[]>("/user/maxdivision", apiKey, { ouid }) : Promise.resolve([]),
    nexonRequest<string[]>("/user/match", apiKey, { ouid, matchtype: matchType, offset, limit: 3 }),
    fetchMetadata(),
  ]);

  const matches: MatchSummary[] = [];
  for (const matchId of matchIds) {
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
    matchTypes: metadata.matchTypes,
  };
}

async function fetchTrades(apiKey: string, nickname: string) {
  const ouid = await resolveOuid(apiKey, nickname);
  const metadata = await fetchMetadata();
  const enrich = (type: "buy" | "sell") => async (item: { tradeDate: string; saleSn: string; spid: number; grade: number; value: number }) => {
    const season = metadata.seasons.get(Math.floor(item.spid / 1_000_000));
    return { ...item, type, playerName: metadata.players.get(item.spid) ?? `선수 ${item.spid}`, seasonName: season?.name ?? "시즌 정보 없음", seasonImageUrl: season?.imageUrl ?? "" };
  };
  const buys = await nexonRequest<Array<{ tradeDate: string; saleSn: string; spid: number; grade: number; value: number }>>("/user/trade", apiKey, { ouid, tradetype: "buy", offset: 0, limit: 20 });
  await new Promise((resolve) => setTimeout(resolve, 250));
  const sells = await nexonRequest<Array<{ tradeDate: string; saleSn: string; spid: number; grade: number; value: number }>>("/user/trade", apiKey, { ouid, tradetype: "sell", offset: 0, limit: 20 });
  return [...await Promise.all(buys.map(enrich("buy"))), ...await Promise.all(sells.map(enrich("sell")))].sort((a, b) => b.tradeDate.localeCompare(a.tradeDate));
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
    webPreferences: {
      preload: join(__dirname, "../preload/preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  if (process.env.ELECTRON_RENDERER_URL) window.loadURL(process.env.ELECTRON_RENDERER_URL);
  else window.loadFile(join(__dirname, "../renderer/index.html"));
}

app.whenReady().then(() => {
  ipcMain.handle("dashboard:fetch", (_event, input: { apiKey: string; nickname: string; offset: number; matchType: number }) =>
    fetchDashboard(input.apiKey.trim(), input.nickname.trim(), input.offset, input.matchType),
  );
  ipcMain.handle("trades:fetch", (_event, input: { apiKey: string; nickname: string }) => fetchTrades(input.apiKey.trim(), input.nickname.trim()));
  ipcMain.handle("ranker:fetch", (_event, input: { apiKey: string; players: Array<{ id: number; po: number }> }) => fetchRankerStats(input.apiKey.trim(), input.players));
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
