import path from "node:path";
import type { WooConnection } from "@pim/shared";
import { env } from "../../config/env";
import { MockWooClient } from "./mockClient";
import { RestWooClient } from "./restClient";
import { WooError } from "./types";
import type { WooClient } from "./types";

export * from "./types";

/** Present only in mock mode; exposes demo controls (outage, delete-in-store). */
export const mockStore =
  env.WOO_MODE === "mock"
    ? new MockWooClient(path.join(path.dirname(env.DATABASE_PATH), "mock-woo.json"), `http://localhost:${env.PORT}`)
    : null;

/** The single store client the app talks to. Only sync/ and import/ should use it. */
export const woo: WooClient =
  mockStore ??
  new RestWooClient({ url: env.WOO_URL, key: env.WOO_KEY, secret: env.WOO_SECRET, timeoutMs: env.WOO_TIMEOUT_MS });

/** Health check that tells "unreachable" apart from "wrong keys" apart from "wrong URL". */
export const checkWooConnection = async (): Promise<WooConnection> => {
  const started = Date.now();
  const base = { mode: woo.mode, storeUrl: woo.storeUrl, checkedAt: new Date().toISOString() };
  try {
    await woo.ping();
    return {
      ...base,
      state: "connected",
      message: woo.mode === "mock" ? "Connected to the built-in mock store" : "Connected",
      latencyMs: Date.now() - started,
    };
  } catch (e) {
    const err = e instanceof WooError ? e : new WooError("WOO_UNREACHABLE", (e as Error).message);
    const state =
      err.code === "WOO_UNAUTHORIZED" ? "unauthorized" : err.code === "WOO_MISCONFIGURED" ? "misconfigured" : "unreachable";
    return { ...base, state, message: err.message, latencyMs: null };
  }
};
