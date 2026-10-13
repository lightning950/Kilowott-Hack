import type { AttributeDef, Paginated, Product, ProductFields, ProductListQuery, SyncStatus } from "@pim/shared";
import { db, now } from "../../db/client";

interface ProductRow {
  id: number;
  sku: string;
  name: string;
  description: string;
  short_description: string;
  type: Product["type"];
  regular_price: number;
  sale_price: number | null;
  stock_quantity: number;
  category: string;
  image_url: string | null;
  attribute_set_id: number | null;
  attributes: string;
  woo_id: number | null;
  sync_status: SyncStatus;
  last_error: string | null;
  last_synced_at: string | null;
  created_at: string;
  updated_at: string;
  variation_count: number;
}

const toProduct = (r: ProductRow): Product => ({
  id: r.id,
  sku: r.sku,
  name: r.name,
  description: r.description,
  shortDescription: r.short_description,
  type: r.type,
  regularPrice: r.regular_price,
  salePrice: r.sale_price,
  stockQuantity: r.stock_quantity,
  category: r.category,
  imageUrl: r.image_url,
  attributeSetId: r.attribute_set_id,
  attributes: JSON.parse(r.attributes) as AttributeDef[],
  wooId: r.woo_id,
  syncStatus: r.sync_status,
  lastError: r.last_error,
  lastSyncedAt: r.last_synced_at,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
  variationCount: r.variation_count,
});

/** Editable content columns. Changing any of these bumps updated_at. */
const CONTENT_COLUMNS: Record<keyof ProductFields, string> = {
  sku: "sku",
  name: "name",
  description: "description",
  shortDescription: "short_description",
  type: "type",
  regularPrice: "regular_price",
  salePrice: "sale_price",
  stockQuantity: "stock_quantity",
  category: "category",
  imageUrl: "image_url",
  attributeSetId: "attribute_set_id",
  attributes: "attributes",
};

/** Sync bookkeeping. Changing these does NOT bump updated_at. */
export interface SyncState {
  syncStatus: SyncStatus;
  lastError: string | null;
  wooId: number | null;
  lastSyncedAt: string | null;
}
const SYNC_COLUMNS: Record<keyof SyncState, string> = {
  syncStatus: "sync_status",
  lastError: "last_error",
  wooId: "woo_id",
  lastSyncedAt: "last_synced_at",
};

const encode = (key: string, value: unknown) => (key === "attributes" ? JSON.stringify(value) : value);

const SELECT = `
  SELECT p.*, (SELECT COUNT(*) FROM variations v WHERE v.product_id = p.id) AS variation_count
  FROM products p`;

export const productRepo = {
  list(q: ProductListQuery): Paginated<Product> {
    const where: string[] = [];
    const args: Record<string, unknown> = {};
    if (q.search) {
      where.push("(p.name LIKE @search ESCAPE '\\' OR p.sku LIKE @search ESCAPE '\\')");
      args.search = `%${q.search.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
    }
    if (q.status) {
      where.push("p.sync_status = @status");
      args.status = q.status;
    }
    if (q.type) {
      where.push("p.type = @type");
      args.type = q.type;
    }
    const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";
    const total = (db.prepare(`SELECT COUNT(*) AS n FROM products p ${whereSql}`).get(args) as { n: number }).n;
    const rows = db
      .prepare(`${SELECT} ${whereSql} ORDER BY p.updated_at DESC, p.id DESC LIMIT @limit OFFSET @offset`)
      .all({ ...args, limit: q.pageSize, offset: (q.page - 1) * q.pageSize }) as ProductRow[];
    return {
      items: rows.map(toProduct),
      page: q.page,
      pageSize: q.pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / q.pageSize)),
    };
  },

  findById(id: number): Product | undefined {
    const row = db.prepare(`${SELECT} WHERE p.id = ?`).get(id) as ProductRow | undefined;
    return row && toProduct(row);
  },

  findBySku(sku: string): Product | undefined {
    const row = db.prepare(`${SELECT} WHERE p.sku = ? COLLATE NOCASE`).get(sku) as ProductRow | undefined;
    return row && toProduct(row);
  },

  findByWooId(wooId: number): Product | undefined {
    const row = db.prepare(`${SELECT} WHERE p.woo_id = ?`).get(wooId) as ProductRow | undefined;
    return row && toProduct(row);
  },

  insert(fields: ProductFields, sync: Partial<SyncState> = {}): Product {
    const ts = now();
    const cols = { ...fields, ...sync };
    const keys = Object.keys(cols) as (keyof typeof cols)[];
    const columnOf = (k: string) =>
      (CONTENT_COLUMNS as Record<string, string>)[k] ?? (SYNC_COLUMNS as Record<string, string>)[k]!;
    const values = Object.fromEntries(keys.map((k) => [k, encode(k, cols[k])]));
    const { lastInsertRowid } = db
      .prepare(
        `INSERT INTO products (${keys.map(columnOf).join(", ")}, created_at, updated_at)
         VALUES (${keys.map((k) => `@${k}`).join(", ")}, @ts, @ts)`,
      )
      .run({ ...values, ts });
    return this.findById(Number(lastInsertRowid))!;
  },

  /** Updates content columns (bumps updated_at) and/or sync columns in one statement. */
  update(id: number, content: Partial<ProductFields>, sync: Partial<SyncState> = {}): Product {
    const sets: string[] = [];
    const args: Record<string, unknown> = { id };
    for (const [k, v] of Object.entries(content)) {
      if (v === undefined) continue;
      sets.push(`${CONTENT_COLUMNS[k as keyof ProductFields]} = @c_${k}`);
      args[`c_${k}`] = encode(k, v);
    }
    if (sets.length) {
      sets.push("updated_at = @ts");
      args.ts = now();
    }
    for (const [k, v] of Object.entries(sync)) {
      if (v === undefined) continue;
      sets.push(`${SYNC_COLUMNS[k as keyof SyncState]} = @s_${k}`);
      args[`s_${k}`] = v;
    }
    if (sets.length) db.prepare(`UPDATE products SET ${sets.join(", ")} WHERE id = @id`).run(args);
    return this.findById(id)!;
  },

  setSyncState(id: number, sync: Partial<SyncState>): Product {
    return this.update(id, {}, sync);
  },

  /** Marks a product as changed since its last sync. Only products that exist in the store go out_of_sync. */
  markEdited(id: number) {
    db.prepare(
      `UPDATE products
         SET sync_status = CASE WHEN woo_id IS NOT NULL THEN 'out_of_sync' ELSE 'draft' END,
             last_error  = NULL,
             updated_at  = @ts
       WHERE id = @id AND sync_status <> 'syncing'`,
    ).run({ id, ts: now() });
  },

  delete(id: number) {
    db.prepare("DELETE FROM products WHERE id = ?").run(id);
  },

  idsWithStatus(statuses: readonly SyncStatus[]): number[] {
    const rows = db
      .prepare(`SELECT id FROM products WHERE sync_status IN (${statuses.map(() => "?").join(",")}) ORDER BY id`)
      .all(...statuses) as { id: number }[];
    return rows.map((r) => r.id);
  },

  existingIds(ids: number[]): number[] {
    if (!ids.length) return [];
    const rows = db
      .prepare(`SELECT id FROM products WHERE id IN (${ids.map(() => "?").join(",")}) ORDER BY id`)
      .all(...ids) as { id: number }[];
    return rows.map((r) => r.id);
  },

  /** A sync can't be running at boot (locks live in memory), so any "syncing" row was interrupted. */
  resetInterruptedSyncs(): number {
    return db
      .prepare(
        `UPDATE products SET sync_status = 'failed', last_error = 'Sync was interrupted (server restarted). Try again.'
         WHERE sync_status = 'syncing'`,
      )
      .run().changes;
  },

  countsByStatus(): Record<SyncStatus, number> {
    const counts: Record<SyncStatus, number> = { draft: 0, syncing: 0, synced: 0, out_of_sync: 0, failed: 0 };
    const rows = db.prepare("SELECT sync_status AS s, COUNT(*) AS n FROM products GROUP BY sync_status").all() as {
      s: SyncStatus;
      n: number;
    }[];
    for (const r of rows) counts[r.s] = r.n;
    return counts;
  },

  countsByType(): { simple: number; variable: number } {
    const rows = db.prepare("SELECT type AS t, COUNT(*) AS n FROM products GROUP BY type").all() as {
      t: "simple" | "variable";
      n: number;
    }[];
    return { simple: 0, variable: 0, ...Object.fromEntries(rows.map((r) => [r.t, r.n])) };
  },
};

/** Who owns a SKU? WooCommerce requires uniqueness across products AND variations. */
export const skuOwner = (sku: string): { kind: "product" | "variation"; id: number } | null => {
  const product = db.prepare("SELECT id FROM products WHERE sku = ? COLLATE NOCASE").get(sku) as { id: number } | undefined;
  if (product) return { kind: "product", id: product.id };
  const variation = db.prepare("SELECT id FROM variations WHERE sku = ? COLLATE NOCASE").get(sku) as { id: number } | undefined;
  return variation ? { kind: "variation", id: variation.id } : null;
};
