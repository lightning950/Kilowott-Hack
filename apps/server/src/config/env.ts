import path from "node:path";
import { fileURLToPath } from "node:url";
import { config as loadDotenv } from "dotenv";
import { z } from "zod";

/** Repo root, so `.env` and `data/` resolve the same no matter where the server is started. */
export const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");

loadDotenv({ path: path.join(ROOT_DIR, ".env") });

const envSchema = z
  .object({
    NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
    PORT: z.coerce.number().int().min(1).max(65535).default(4000),
    CORS_ORIGIN: z.string().default("http://localhost:5173"),
    DATABASE_PATH: z.string().default("./data/pim.db"),
    LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace"]).default("info"),
    WOO_MODE: z.enum(["real", "mock"]).default("mock"),
    WOO_URL: z.string().optional(),
    WOO_KEY: z.string().optional(),
    WOO_SECRET: z.string().optional(),
    WOO_TIMEOUT_MS: z.coerce.number().int().min(1000).max(120_000).default(15_000),
  })
  .superRefine((env, ctx) => {
    if (env.WOO_MODE !== "real") return;
    const url = env.WOO_URL?.trim() ?? "";
    if (!/^https?:\/\/[^\s/]+/i.test(url) || url.includes("your-store.example.com")) {
      ctx.addIssue({ code: "custom", path: ["WOO_URL"], message: "set it to your store URL, e.g. https://mystore.tastewp.com" });
    }
    if (!env.WOO_KEY?.startsWith("ck_") || env.WOO_KEY.includes("xxxx")) {
      ctx.addIssue({ code: "custom", path: ["WOO_KEY"], message: "must be a WooCommerce consumer key starting with ck_" });
    }
    if (!env.WOO_SECRET?.startsWith("cs_") || env.WOO_SECRET.includes("xxxx")) {
      ctx.addIssue({ code: "custom", path: ["WOO_SECRET"], message: "must be a WooCommerce consumer secret starting with cs_" });
    }
  });

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  const lines = parsed.error.issues.map((i) => `  • ${i.path.join(".")}: ${i.message}`);
  console.error(
    [
      "",
      "✖ Invalid configuration in .env",
      ...lines,
      "",
      "  Copy .env.example to .env and fill it in, or set WOO_MODE=mock to run without a store.",
      "",
    ].join("\n"),
  );
  process.exit(1);
}

const raw = parsed.data;

export const env = {
  ...raw,
  /** Absolute path to the SQLite file. */
  DATABASE_PATH: path.resolve(ROOT_DIR, raw.DATABASE_PATH),
  /** Store URL without a trailing slash; a local placeholder in mock mode. */
  WOO_URL: raw.WOO_MODE === "real" ? raw.WOO_URL!.trim().replace(/\/+$/, "") : "mock://catalyst-store",
  WOO_KEY: raw.WOO_KEY ?? "",
  WOO_SECRET: raw.WOO_SECRET ?? "",
  isProduction: raw.NODE_ENV === "production",
} as const;

export type Env = typeof env;
