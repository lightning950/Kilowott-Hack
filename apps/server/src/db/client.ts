import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { env } from "../config/env";

fs.mkdirSync(path.dirname(env.DATABASE_PATH), { recursive: true });

export const db = new Database(env.DATABASE_PATH);
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");
db.pragma("busy_timeout = 5000");

/** Run `fn` atomically. Nested calls join the outer transaction. */
export const transaction = <T>(fn: () => T): T => db.transaction(fn)();

/** ISO-8601 UTC timestamp used for every *_at column. */
export const now = () => new Date().toISOString();
