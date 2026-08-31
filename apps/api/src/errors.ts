export type ErrorSource = "nexon" | "data-center" | "parser" | "worker" | "client";

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly code = "API_ERROR",
    readonly source: ErrorSource = "worker",
    readonly details: { upstreamStatus?: number; stage?: string; missingFields?: string[] } = {},
  ) {
    super(message);
  }
}
