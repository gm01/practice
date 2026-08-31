import type {
  DashboardResponse as Dashboard,
  PlayerAbilityFilter,
  PlayerCard,
  PlayerDetail,
  PlayerDetailOptions,
  PlayerFilterMetadata,
  PlayerSearchFilters,
  ClientErrorEvent,
} from "../../../shared/contracts";
import type { DiagnosticInfo } from "../../../shared/contracts";
import { ApiClientError, requestJson } from "../../../shared/apiClient";

export type {
  PlayerAbilityFilter,
  PlayerCard,
  PlayerDetail,
  PlayerDetailOptions,
  PlayerFilterMetadata,
  PlayerSearchFilters,
} from "../../../shared/contracts";

const API = process.env.EXPO_PUBLIC_API_BASE_URL?.trim() || "https://fc-online-lab-api.bebebe97.workers.dev";
const CLIENT_VERSION = "mobile/0.1.0";
let diagnosticListener: ((diagnostics: DiagnosticInfo) => void) | undefined;

export { ApiClientError as DashboardError };

export function setDiagnosticListener(listener?: (diagnostics: DiagnosticInfo) => void) {
  diagnosticListener = listener;
}

export function fetchDashboard(nickname: string, signal?: AbortSignal): Promise<Dashboard> {
  const url = new URL("/v1/dashboard", API);
  url.searchParams.set("nickname", nickname.trim());
  url.searchParams.set("matchtype", "50");
  url.searchParams.set("offset", "0");
  url.searchParams.set("limit", "20");
  return requestJson<Dashboard>(url, {
    timeoutMs: 30_000,
    signal,
    clientVersion: CLIENT_VERSION,
    notFoundMessage: "구단주명을 찾을 수 없습니다. 철자와 띄어쓰기를 확인해 주세요.",
    fallbackMessage: "전적 조회에 실패했습니다.",
    onDiagnostics: diagnosticListener,
  });
}

function appendPlayerFilters(url: URL, filters: PlayerSearchFilters) {
  url.searchParams.set("q", filters.query.trim());
  for (const [key, value] of Object.entries(filters)) {
    if (key === "query" || value === undefined || value === "" || (Array.isArray(value) && !value.length)) continue;
    if (key === "abilities") url.searchParams.set(key, (value as PlayerAbilityFilter[]).map(row => `${row.label}:${row.min ?? ""}:${row.max ?? ""}`).join(","));
    else url.searchParams.set(key, Array.isArray(value) ? value.join(",") : String(value));
  }
}

export async function searchPlayers(filters: PlayerSearchFilters, signal?: AbortSignal): Promise<PlayerCard[]> {
  const url = new URL("/v1/players/search", API);
  appendPlayerFilters(url, { limit: 40, ...filters });
  const body = await requestJson<{ players: PlayerCard[] }>(url, { timeoutMs: 40_000, signal, clientVersion: CLIENT_VERSION, fallbackMessage: "선수 검색에 실패했습니다.", onDiagnostics: diagnosticListener });
  return body.players ?? [];
}

export function fetchPlayerFilters(signal?: AbortSignal): Promise<PlayerFilterMetadata> {
  return requestJson<PlayerFilterMetadata>(new URL("/v1/players/filters", API), { timeoutMs: 20_000, signal, clientVersion: CLIENT_VERSION, fallbackMessage: "검색 조건을 불러오지 못했습니다.", onDiagnostics: diagnosticListener });
}

export function fetchPlayerDetail(spId: number, grade: number, options: PlayerDetailOptions = {}, signal?: AbortSignal): Promise<PlayerDetail> {
  const url = new URL("/v1/players/detail", API);
  url.searchParams.set("spid", String(spId));
  url.searchParams.set("grade", String(grade));
  if (options.adaptation) url.searchParams.set("adaptation", String(options.adaptation));
  if (options.affiliationId) url.searchParams.set("affiliationId", String(options.affiliationId));
  if (options.affiliationLevel) url.searchParams.set("affiliationLevel", String(options.affiliationLevel));
  if (options.enhancementId) url.searchParams.set("enhancementId", String(options.enhancementId));
  if (options.enhancementLevel) url.searchParams.set("enhancementLevel", String(options.enhancementLevel));
  if (options.featureId) url.searchParams.set("featureId", String(options.featureId));
  return requestJson<PlayerDetail>(url, { timeoutMs: 25_000, signal, clientVersion: CLIENT_VERSION, fallbackMessage: "선수 상세 정보를 불러오지 못했습니다.", onDiagnostics: diagnosticListener });
}

export function reportClientError(event: ClientErrorEvent) {
  return requestJson<{ accepted: true; requestId: string }>(new URL("/v1/telemetry/client-error", API), {
    method: "POST",
    body: JSON.stringify(event),
    timeoutMs: 10_000,
    retries: 0,
    clientVersion: CLIENT_VERSION,
    onDiagnostics: diagnosticListener,
    fallbackMessage: "오류 보고를 전송하지 못했습니다.",
  });
}
