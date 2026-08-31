import type { ClientErrorEvent } from "./contracts";

function uuid() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, character => {
    const value = Math.floor(Math.random() * 16);
    return (character === "x" ? value : value & 0x3 | 0x8).toString(16);
  });
}

function safeText(value: unknown, fallback: string, maxLength: number) {
  return (typeof value === "string" && value.trim() ? value.trim() : fallback).slice(0, maxLength);
}

export function createClientErrorEvent(input: {
  platform: ClientErrorEvent["platform"];
  appVersion: string;
  screen?: string;
  errorCode?: string;
  error: unknown;
  relatedRequestId?: string;
}): ClientErrorEvent {
  const error = input.error instanceof Error ? input.error : new Error(String(input.error));
  return {
    eventId: uuid(),
    relatedRequestId: input.relatedRequestId,
    platform: input.platform,
    appVersion: safeText(input.appVersion, "unknown", 80),
    screen: safeText(input.screen, "unknown", 80),
    errorCode: safeText(input.errorCode, "CLIENT_ERROR", 80).toUpperCase().replace(/[^A-Z0-9_:-]/g, "_") || "CLIENT_ERROR",
    message: safeText(error.message, "Unknown client error", 500),
    stack: error.stack?.slice(0, 4_000),
    occurredAt: new Date().toISOString(),
  };
}

export function enqueueBounded<T>(queue: T[], item: T, limit = 20) {
  return [...queue, item].slice(-Math.max(1, limit));
}
