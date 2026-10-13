import type { LogListQuery, LogStatus, Paginated, SyncAction, SyncLog } from "@pim/shared";
import { db, now } from "../../db/client";

interface LogRow {
  id: number;
  product_id: number | null;
  product_sku: string | null;
  action: SyncAction;
  status: LogStatus;
  message: string;
  warnings: string;
  duration_ms: number;
  created_at: string;
}

const toLog = (r: LogRow): SyncLog => ({
  id: r.id,
  productId: r.product_id,
  productSku: r.product_sku,
  action: r.action,
  status: r.status,
  message: r.message,
  warnings: JSON.parse(r.warnings) as string[],
  durationMs: r.duration_ms,
  createdAt: r.created_at,
});

export interface NewLog {
  productId: number | null;
  productSku: string | null;
  action: SyncAction;
  status: LogStatus;
  message: string;
  warnings?: string[];
  durationMs: number;
}

export const logRepo = {
  insert(log: NewLog): SyncLog {
    const { lastInsertRowid } = db
      .prepare(
        `INSERT INTO sync_logs (product_id, product_sku, action, status, message, warnings, duration_ms, created_at)
         VALUES (@productId, @productSku, @action, @status, @message, @warnings, @durationMs, @createdAt)`,
      )
      .run({ ...log, warnings: JSON.stringify(log.warnings ?? []), createdAt: now() });
    return toLog(db.prepare("SELECT * FROM sync_logs WHERE id = ?").get(Number(lastInsertRowid)) as LogRow);
  },

  list(q: LogListQuery): Paginated<SyncLog> {
    const where: string[] = [];
    const args: Record<string, unknown> = {};
    if (q.productId) {
      where.push("product_id = @productId");
      args.productId = q.productId;
    }
    if (q.status) {
      where.push("status = @status");
      args.status = q.status;
    }
    if (q.action) {
      where.push("action = @action");
      args.action = q.action;
    }
    const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";
    const total = (db.prepare(`SELECT COUNT(*) AS n FROM sync_logs ${whereSql}`).get(args) as { n: number }).n;
    const rows = db
      .prepare(`SELECT * FROM sync_logs ${whereSql} ORDER BY id DESC LIMIT @limit OFFSET @offset`)
      .all({ ...args, limit: q.pageSize, offset: (q.page - 1) * q.pageSize }) as LogRow[];
    return {
      items: rows.map(toLog),
      page: q.page,
      pageSize: q.pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / q.pageSize)),
    };
  },

  lastSuccessAt(): string | null {
    const row = db
      .prepare("SELECT created_at FROM sync_logs WHERE status = 'success' AND action IN ('create','update') ORDER BY id DESC LIMIT 1")
      .get() as { created_at: string } | undefined;
    return row?.created_at ?? null;
  },

  countsSince(sinceIso: string): { succeeded: number; failed: number } {
    const rows = db
      .prepare("SELECT status, COUNT(*) AS n FROM sync_logs WHERE created_at >= ? GROUP BY status")
      .all(sinceIso) as { status: LogStatus; n: number }[];
    return {
      succeeded: rows.find((r) => r.status === "success")?.n ?? 0,
      failed: rows.find((r) => r.status === "failed")?.n ?? 0,
    };
  },
};
