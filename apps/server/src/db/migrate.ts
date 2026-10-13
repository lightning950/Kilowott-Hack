import { pathToFileURL } from "node:url";
import { db } from "./client";

/**
 * Ordered, append-only migrations. Never edit a shipped entry; add a new one.
 * The applied version is stored in SQLite's built-in `user_version` pragma.
 */
const MIGRATIONS: string[] = [
  /* 1 – initial schema */ `
  CREATE TABLE attribute_sets (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    name        TEXT    NOT NULL UNIQUE COLLATE NOCASE,
    attributes  TEXT    NOT NULL DEFAULT '[]',
    created_at  TEXT    NOT NULL,
    updated_at  TEXT    NOT NULL
  );

  CREATE TABLE products (
    id                 INTEGER PRIMARY KEY AUTOINCREMENT,
    sku                TEXT    NOT NULL UNIQUE COLLATE NOCASE,
    name               TEXT    NOT NULL,
    description        TEXT    NOT NULL DEFAULT '',
    short_description  TEXT    NOT NULL DEFAULT '',
    type               TEXT    NOT NULL CHECK (type IN ('simple', 'variable')),
    regular_price      INTEGER NOT NULL DEFAULT 0 CHECK (regular_price >= 0),
    sale_price         INTEGER          CHECK (sale_price IS NULL OR sale_price >= 0),
    stock_quantity     INTEGER NOT NULL DEFAULT 0 CHECK (stock_quantity >= 0),
    category           TEXT    NOT NULL DEFAULT '',
    image_url          TEXT,
    attribute_set_id   INTEGER REFERENCES attribute_sets(id) ON DELETE SET NULL,
    attributes         TEXT    NOT NULL DEFAULT '[]',
    woo_id             INTEGER UNIQUE,
    sync_status        TEXT    NOT NULL DEFAULT 'draft'
                       CHECK (sync_status IN ('draft', 'syncing', 'synced', 'out_of_sync', 'failed')),
    last_error         TEXT,
    last_synced_at     TEXT,
    created_at         TEXT    NOT NULL,
    updated_at         TEXT    NOT NULL
  );
  CREATE INDEX idx_products_status  ON products(sync_status);
  CREATE INDEX idx_products_updated ON products(updated_at DESC);

  CREATE TABLE variations (
    id                INTEGER PRIMARY KEY AUTOINCREMENT,
    product_id        INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    sku               TEXT    NOT NULL UNIQUE COLLATE NOCASE,
    attributes        TEXT    NOT NULL,
    combo_key         TEXT    NOT NULL,
    regular_price     INTEGER NOT NULL DEFAULT 0 CHECK (regular_price >= 0),
    sale_price        INTEGER          CHECK (sale_price IS NULL OR sale_price >= 0),
    stock_quantity    INTEGER NOT NULL DEFAULT 0 CHECK (stock_quantity >= 0),
    woo_variation_id  INTEGER,
    created_at        TEXT    NOT NULL,
    updated_at        TEXT    NOT NULL,
    UNIQUE (product_id, combo_key)
  );
  CREATE INDEX idx_variations_product ON variations(product_id);

  CREATE TABLE sync_logs (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    product_id   INTEGER REFERENCES products(id) ON DELETE SET NULL,
    product_sku  TEXT,
    action       TEXT    NOT NULL CHECK (action IN ('create', 'update', 'delete', 'import')),
    status       TEXT    NOT NULL CHECK (status IN ('success', 'failed')),
    message      TEXT    NOT NULL,
    warnings     TEXT    NOT NULL DEFAULT '[]',
    duration_ms  INTEGER NOT NULL DEFAULT 0,
    created_at   TEXT    NOT NULL
  );
  CREATE INDEX idx_logs_created ON sync_logs(created_at DESC);
  CREATE INDEX idx_logs_product ON sync_logs(product_id);
  `,
];

export const runMigrations = (): { from: number; to: number } => {
  const from = Number(db.pragma("user_version", { simple: true }));
  for (let v = from; v < MIGRATIONS.length; v++) {
    db.transaction(() => {
      db.exec(MIGRATIONS[v]!);
      db.pragma(`user_version = ${v + 1}`);
    })();
  }
  return { from, to: MIGRATIONS.length };
};

// `npm run db:migrate`
if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const { from, to } = runMigrations();
  console.log(from === to ? `✔ Database already at version ${to}` : `✔ Migrated database ${from} → ${to}`);
}
