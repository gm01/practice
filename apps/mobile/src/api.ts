import type { Dashboard } from "./types";

const API = process.env.EXPO_PUBLIC_API_BASE_URL?.trim() || "https://fc-online-lab-api.bebebe97.workers.dev";

export type PlayerCard = { spId: number; name: string; seasonId: number; seasonName: string; imageUrls: string[]; seasonImageUrl: string; overall: number; primaryPosition: string; salary: number; height: string; weight: string; bodyType: string; leftFoot: number; rightFoot: number; weakFoot: number; preferredFoot: string };
export type PlayerDetail = {
  spId: number; grade: number; name: string; seasonId: number; seasonName: string; overall: number; baseOverall: number; overallDelta: number; primaryPosition: string; salary: number;
  birthDate: string; height: string; weight: string; bodyType: string; playerClass: string; skillMoves: number; leftFoot: number; rightFoot: number;
  nation: string; traits: string[]; positions: Array<{ position: string; value: number; baseValue: number; delta: number }>; summaryAbilities: Array<{ label: string; value: number; baseValue: number; delta: number }>;
  abilities: Array<{ label: string; value: number; baseValue: number; delta: number }>; clubCareer: Array<{ years: string; club: string; loan: string }>;
  rankerStats: Record<string, string>; rankerUpdatedAt: string; currentPrice: number; priceHistory: Array<{ date: string; value: number }>;
  teamColorOptions: { enhancement: Array<{ id: number; level: number; name: string }>; affiliation: Array<{ id: number; level: number; name: string }>; feature: Array<{ id: number; level: number; name: string }> };
  selection: { adaptation: 1 | 5; affiliationId: number; affiliationLevel: number; enhancementId: number; enhancementLevel: number; featureId: number };
  imageUrls: string[]; sourceUrl: string; source: string;
};
export type PlayerDetailOptions = { adaptation?: 1 | 5; affiliationId?: number; affiliationLevel?: number; enhancementId?: number; enhancementLevel?: number; featureId?: number };

type ErrorBody = { error?: { code?: string; message?: string } };

export class DashboardError extends Error {
  constructor(message: string, readonly kind: "offline" | "timeout" | "not-found" | "rate-limit" | "server" | "unknown") { super(message); }
}

export async function fetchDashboard(nickname: string): Promise<Dashboard> {
  const url = new URL("/v1/dashboard", API);
  url.searchParams.set("nickname", nickname.trim());
  url.searchParams.set("matchtype", "50");
  url.searchParams.set("offset", "0");
  url.searchParams.set("limit", "20");
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30_000);
  try {
    const response = await fetch(url.toString(), { headers: { Accept: "application/json" }, signal: controller.signal });
    if (response.ok) return response.json() as Promise<Dashboard>;
    const body = await response.json().catch(() => ({})) as ErrorBody;
    if (response.status === 404) throw new DashboardError("구단주명을 찾을 수 없습니다. 철자와 띄어쓰기를 확인해 주세요.", "not-found");
    if (response.status === 429) throw new DashboardError("조회 요청이 많습니다. 잠시 후 다시 시도해 주세요.", "rate-limit");
    if (response.status >= 500) throw new DashboardError("서비스 연결이 원활하지 않습니다. 잠시 후 다시 시도해 주세요.", "server");
    throw new DashboardError(body.error?.message ?? `전적 조회에 실패했습니다. (${response.status})`, "unknown");
  } catch (error) {
    if (error instanceof DashboardError) throw error;
    if (error instanceof Error && error.name === "AbortError") throw new DashboardError("조회 시간이 초과되었습니다. 네트워크 상태를 확인해 주세요.", "timeout");
    if (error instanceof TypeError) throw new DashboardError("인터넷에 연결할 수 없습니다. Wi-Fi 또는 모바일 데이터를 확인해 주세요.", "offline");
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

export async function searchPlayers(query: string): Promise<PlayerCard[]> {
  const url = new URL("/v1/players/search", API);
  url.searchParams.set("q", query.trim());
  url.searchParams.set("limit", "40");
  const response = await fetch(url.toString(), { headers: { Accept: "application/json" } });
  if (!response.ok) {
    const body = await response.json().catch(() => ({})) as ErrorBody;
    throw new DashboardError(body.error?.message ?? "선수 검색에 실패했습니다.", response.status === 429 ? "rate-limit" : "server");
  }
  const body = await response.json() as { players: PlayerCard[] };
  return body.players;
}

export async function fetchPlayerDetail(spId: number, grade: number, options: PlayerDetailOptions = {}): Promise<PlayerDetail> {
  const url = new URL("/v1/players/detail", API);
  url.searchParams.set("spid", String(spId));
  url.searchParams.set("grade", String(grade));
  if (options.adaptation) url.searchParams.set("adaptation", String(options.adaptation));
  if (options.affiliationId) url.searchParams.set("affiliationId", String(options.affiliationId));
  if (options.affiliationLevel) url.searchParams.set("affiliationLevel", String(options.affiliationLevel));
  if (options.enhancementId) url.searchParams.set("enhancementId", String(options.enhancementId));
  if (options.enhancementLevel) url.searchParams.set("enhancementLevel", String(options.enhancementLevel));
  if (options.featureId) url.searchParams.set("featureId", String(options.featureId));
  const response = await fetch(url.toString(), { headers: { Accept: "application/json" } });
  if (!response.ok) {
    const body = await response.json().catch(() => ({})) as ErrorBody;
    throw new DashboardError(body.error?.message ?? "선수 상세 정보를 불러오지 못했습니다.", response.status === 429 ? "rate-limit" : "server");
  }
  return response.json() as Promise<PlayerDetail>;
}
