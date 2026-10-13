import type { SyncStatus } from "./schemas/sync";

/** Every error the API can return. The web app switches on these, never on messages. */
export const ERROR_CODES = [
  "VALIDATION_ERROR",
  "INVALID_JSON",
  "NOT_FOUND",
  "ROUTE_NOT_FOUND",
  "SKU_TAKEN",
  "NAME_TAKEN",
  "SYNC_IN_PROGRESS",
  "IMPORT_IN_PROGRESS",
  "VARIATIONS_EXIST",
  "VARIATIONS_OUTDATED",
  "TOO_MANY_VARIATIONS",
  "NOT_SYNCABLE",
  "NOT_IMPLEMENTED",
  "WOO_UNREACHABLE",
  "WOO_UNAUTHORIZED",
  "WOO_TIMEOUT",
  "WOO_NOT_FOUND",
  "WOO_REJECTED",
  "WOO_MISCONFIGURED",
  "INTERNAL_ERROR",
] as const;
export type ErrorCode = (typeof ERROR_CODES)[number];

export interface ApiErrorBody {
  code: ErrorCode;
  message: string;
  /** Field-level messages keyed by path, e.g. { "salePrice": "Sale price must be lower…" } */
  fieldErrors?: Record<string, string>;
  details?: unknown;
}

export type ApiSuccess<T> = { data: T };
export type ApiFailure = { error: ApiErrorBody };
export type ApiResponse<T> = ApiSuccess<T> | ApiFailure;

export const isApiFailure = (r: unknown): r is ApiFailure =>
  typeof r === "object" && r !== null && "error" in r;

/* ------------------------------------ System ------------------------------------ */

export type WooMode = "real" | "mock";
export type WooConnectionState = "connected" | "unauthorized" | "unreachable" | "misconfigured";

export interface WooConnection {
  mode: WooMode;
  storeUrl: string;
  state: WooConnectionState;
  message: string;
  latencyMs: number | null;
  checkedAt: string;
}

export interface HealthReport {
  status: "ok" | "degraded";
  version: string;
  database: "ok";
  woo: WooConnection;
}

export interface Stats {
  total: number;
  byStatus: Record<SyncStatus, number>;
  byType: { simple: number; variable: number };
  variations: number;
  /** Products that are draft, out_of_sync or failed. */
  pending: number;
  lastSyncAt: string | null;
  last24h: { succeeded: number; failed: number };
}
