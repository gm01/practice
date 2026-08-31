import { createClientErrorEvent, enqueueBounded } from "../shared/clientTelemetry";

const QUEUE_KEY = "fconline.client-errors.v1";
let relatedRequestId: string | undefined;

function loadQueue(): ClientErrorEvent[] {
  try { return JSON.parse(localStorage.getItem(QUEUE_KEY) ?? "[]") as ClientErrorEvent[]; } catch { return []; }
}

function saveQueue(queue: ClientErrorEvent[]) {
  localStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
}

export function setRelatedRequestId(requestId: string | null) {
  relatedRequestId = requestId ?? undefined;
}

export async function reportDesktopError(error: unknown, errorCode = "CLIENT_ERROR", screen = window.location.hash || "app") {
  const event = createClientErrorEvent({ platform: "desktop", appVersion: "0.1.0", screen, errorCode, error, relatedRequestId });
  try { await window.fcOnline.reportClientError(event); }
  catch { saveQueue(enqueueBounded(loadQueue(), event)); }
}

export async function flushDesktopErrors() {
  const pending = loadQueue();
  if (!pending.length) return;
  const failed: ClientErrorEvent[] = [];
  for (const event of pending) {
    try { await window.fcOnline.reportClientError(event); } catch { failed.push(event); }
  }
  saveQueue(failed.slice(-20));
}

export function installDesktopErrorHandlers() {
  const onError = (event: ErrorEvent) => void reportDesktopError(event.error ?? event.message, "WINDOW_ERROR");
  const onRejection = (event: PromiseRejectionEvent) => void reportDesktopError(event.reason, "UNHANDLED_REJECTION");
  window.addEventListener("error", onError);
  window.addEventListener("unhandledrejection", onRejection);
  void flushDesktopErrors();
  return () => {
    window.removeEventListener("error", onError);
    window.removeEventListener("unhandledrejection", onRejection);
  };
}
