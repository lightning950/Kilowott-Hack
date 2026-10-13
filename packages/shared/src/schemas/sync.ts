import { z } from "zod";
import { paginationQuerySchema } from "./common";

/**
 * draft        – never synced
 * syncing      – a sync is running right now
 * synced       – WooCommerce matches the PIM
 * out_of_sync  – edited in the PIM after the last successful sync
 * failed       – last sync failed; see lastError
 */
export const SYNC_STATUSES = ["draft", "syncing", "synced", "out_of_sync", "failed"] as const;
export type SyncStatus = (typeof SYNC_STATUSES)[number];

/** Statuses that "Sync all pending" picks up. */
export const PENDING_STATUSES: readonly SyncStatus[] = ["draft", "out_of_sync", "failed"];

export const SYNC_ACTIONS = ["create", "update", "delete", "import"] as const;
export type SyncAction = (typeof SYNC_ACTIONS)[number];

export const LOG_STATUSES = ["success", "failed"] as const;
export type LogStatus = (typeof LOG_STATUSES)[number];

export interface SyncLog {
  id: number;
  productId: number | null;
  productSku: string | null;
  action: SyncAction;
  status: LogStatus;
  message: string;
  /** Non-fatal issues, e.g. an image WooCommerce could not download. */
  warnings: string[];
  durationMs: number;
  createdAt: string;
}

export const logListQuerySchema = paginationQuerySchema.extend({
  productId: z.coerce.number().int().positive().optional(),
  status: z.enum(LOG_STATUSES).optional(),
  action: z.enum(SYNC_ACTIONS).optional(),
});
export type LogListQuery = z.infer<typeof logListQuerySchema>;

export interface SyncResult {
  productId: number;
  sku: string;
  status: LogStatus;
  action: SyncAction;
  wooId: number | null;
  message: string;
  warnings: string[];
  durationMs: number;
}

export interface BulkSyncResult {
  total: number;
  succeeded: number;
  failed: number;
  /** Products skipped because a sync for them was already running. */
  skipped: number;
  results: SyncResult[];
}

export const bulkSyncBodySchema = z
  .object({
    /** Sync these products. Omit to sync everything pending. */
    productIds: z.array(z.number().int().positive()).min(1).max(500).optional(),
  })
  .strict();
export type BulkSyncBody = z.infer<typeof bulkSyncBodySchema>;

export interface ImportResult {
  created: number;
  updated: number;
  /** Local products with unsynced edits are never overwritten. */
  conflicts: { sku: string; reason: string }[];
  skipped: { wooId: number; name: string; reason: string }[];
  durationMs: number;
}
