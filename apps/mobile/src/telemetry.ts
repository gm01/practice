import { Platform } from "react-native";
import { createClientErrorEvent } from "../../../shared/clientTelemetry";
import { reportClientError } from "./api";
import { loadClientErrors, queueClientError, saveClientErrors } from "./storage";

let relatedRequestId: string | undefined;

export function setRelatedRequestId(requestId: string | null) {
  relatedRequestId = requestId ?? undefined;
}

export async function reportMobileError(error: unknown, errorCode = "CLIENT_ERROR", screen = "app") {
  const event = createClientErrorEvent({
    platform: Platform.OS === "ios" ? "ios" : "android",
    appVersion: "0.1.0",
    screen,
    errorCode,
    error,
    relatedRequestId,
  });
  try { await reportClientError(event); } catch { await queueClientError(event); }
}

export async function flushMobileErrors() {
  const failed = [];
  for (const event of await loadClientErrors()) {
    try { await reportClientError(event); } catch { failed.push(event); }
  }
  await saveClientErrors(failed);
}

type ErrorUtilsLike = {
  getGlobalHandler?: () => (error: Error, fatal?: boolean) => void;
  setGlobalHandler?: (handler: (error: Error, fatal?: boolean) => void) => void;
};

export function installMobileErrorHandler() {
  const errorUtils = (globalThis as typeof globalThis & { ErrorUtils?: ErrorUtilsLike }).ErrorUtils;
  const previous = errorUtils?.getGlobalHandler?.();
  errorUtils?.setGlobalHandler?.((error, fatal) => {
    void reportMobileError(error, fatal ? "FATAL_JS_ERROR" : "JS_ERROR");
    previous?.(error, fatal);
  });
  void flushMobileErrors();
  return () => { if (previous) errorUtils?.setGlobalHandler?.(previous); };
}
