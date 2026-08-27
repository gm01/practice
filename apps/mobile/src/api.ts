import type { Dashboard } from "./types";

const API = "https://fc-online-lab-api.bebebe97.workers.dev";

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
