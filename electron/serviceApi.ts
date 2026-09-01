import { requestJson } from "../shared/apiClient";
import type {
  DashboardResponse,
  PlayerAbilityFilter,
  PlayerCard,
  PlayerDetail,
  PlayerDetailOptions,
  PlayerFilterMetadata,
  PlayerSearchFilters,
  PlayerSearchResponse,
  ClientErrorEvent,
  DiagnosticInfo,
} from "../shared/contracts";

const SERVICE_API = process.env.FC_ONLINE_API_BASE_URL?.trim() || "https://fc-online-lab-api.bebebe97.workers.dev";
const CLIENT_VERSION = "desktop/0.1.0";
let diagnosticsListener: ((diagnostics: DiagnosticInfo) => void) | undefined;

export function setServiceDiagnosticsListener(listener?: (diagnostics: DiagnosticInfo) => void) {
  diagnosticsListener = listener;
}

const commonOptions = { clientVersion: CLIENT_VERSION, onDiagnostics: (value: DiagnosticInfo) => diagnosticsListener?.(value) };

export async function fetchServiceDashboard(nickname: string, offset: number, matchType: number) {
  const url = new URL("/v1/dashboard", SERVICE_API);
  url.searchParams.set("nickname", nickname);
  url.searchParams.set("offset", String(offset));
  url.searchParams.set("limit", "20");
  url.searchParams.set("matchtype", String(matchType));
  const body = await requestJson<DashboardResponse>(url, {
    timeoutMs: 35_000,
    ...commonOptions,
    notFoundMessage: "구단주명을 찾을 수 없습니다.",
    fallbackMessage: "전적 조회에 실패했습니다.",
  });
  return {
    profile: body.profile ?? null,
    matches: body.matches ?? [],
    failures: (body.warnings ?? []).map((message, index) => ({ matchId: `warning-${index}`, message })),
    matchTypes: [
      { id: 50, name: "공식경기" }, { id: 52, name: "감독모드" }, { id: 60, name: "공식 친선" },
      { id: 40, name: "커스텀 매치" }, { id: 30, name: "리그 친선" },
    ],
  };
}

function appendPlayerFilters(url: URL, filters: PlayerSearchFilters) {
  url.searchParams.set("q", filters.query.trim());
  for (const [key, value] of Object.entries(filters)) {
    if (key === "query" || value === undefined || value === "" || Array.isArray(value) && !value.length) continue;
    if (key === "abilities") url.searchParams.set(key, (value as PlayerAbilityFilter[]).map(row => `${row.label}:${row.min ?? ""}:${row.max ?? ""}`).join(","));
    else url.searchParams.set(key, Array.isArray(value) ? value.join(",") : String(value));
  }
}

export async function fetchServicePlayers(filters: PlayerSearchFilters) {
  const url = new URL("/v1/players/search", SERVICE_API);
  appendPlayerFilters(url, { pageSize: 30, ...filters });
  return requestJson<PlayerSearchResponse>(url, {
    timeoutMs: 40_000,
    ...commonOptions,
    fallbackMessage: "선수 검색에 실패했습니다.",
  });
}

export function fetchServicePlayerFilters() {
  return requestJson<PlayerFilterMetadata>(new URL("/v1/players/filters", SERVICE_API), {
    timeoutMs: 20_000,
    ...commonOptions,
    fallbackMessage: "검색 조건을 불러오지 못했습니다.",
  });
}

export function fetchServicePlayerDetail(spId: number, grade: number, options: PlayerDetailOptions = {}) {
  const url = new URL("/v1/players/detail", SERVICE_API);
  url.searchParams.set("spid", String(spId));
  url.searchParams.set("grade", String(grade));
  for (const [key, value] of Object.entries(options)) {
    if (Number.isInteger(value) && Number(value) >= 0) url.searchParams.set(key, String(value));
  }
  return requestJson<PlayerDetail>(url, {
    timeoutMs: 25_000,
    ...commonOptions,
    fallbackMessage: "선수 상세 정보를 불러오지 못했습니다.",
  });
}

export function reportServiceClientError(event: ClientErrorEvent) {
  return requestJson<{ accepted: true; requestId: string }>(new URL("/v1/telemetry/client-error", SERVICE_API), {
    method: "POST",
    body: JSON.stringify(event),
    timeoutMs: 10_000,
    retries: 0,
    ...commonOptions,
    fallbackMessage: "오류 보고를 전송하지 못했습니다.",
  });
}

export type { PlayerDetailOptions, PlayerSearchFilters };
