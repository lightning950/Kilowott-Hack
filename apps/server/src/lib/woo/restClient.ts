import crypto from "node:crypto";
import { WOO_CODES, WooError } from "./types";
import type {
  WooBatchResult,
  WooClient,
  WooPage,
  WooProduct,
  WooProductPayload,
  WooVariation,
  WooVariationBatch,
} from "./types";

interface RestOptions {
  url: string;
  key: string;
  secret: string;
  timeoutMs: number;
}

type Query = Record<string, string | number | boolean | undefined>;

/** RFC 3986 encoding, as OAuth 1.0a requires. */
const rfc3986 = (s: string) =>
  encodeURIComponent(s).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);

/** WooCommerce returns HTML entities and tags inside error messages. */
const cleanMessage = (s: string) =>
  s
    .replace(/<[^>]+>/g, "")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .trim();

/**
 * Minimal WooCommerce REST v3 client on top of fetch.
 * HTTPS stores: Basic auth plus query-string keys (some hosts strip the Authorization header).
 * HTTP stores (LocalWP etc.): OAuth 1.0a one-legged signatures, which WooCommerce requires there.
 */
export class RestWooClient implements WooClient {
  readonly mode = "real" as const;
  readonly storeUrl: string;
  private readonly isHttps: boolean;
  private readonly categoryCache = new Map<string, number>();

  constructor(private readonly opts: RestOptions) {
    this.storeUrl = opts.url;
    this.isHttps = opts.url.toLowerCase().startsWith("https://");
  }

  productUrl(wooId: number) {
    return `${this.storeUrl}/?p=${wooId}`;
  }

  /* ----------------------------------- transport ----------------------------------- */

  private sign(method: string, endpoint: string, query: Record<string, string>) {
    const oauth: Record<string, string> = {
      oauth_consumer_key: this.opts.key,
      oauth_nonce: crypto.randomBytes(16).toString("hex"),
      oauth_signature_method: "HMAC-SHA256",
      oauth_timestamp: String(Math.floor(Date.now() / 1000)),
    };
    const all = { ...query, ...oauth };
    // WooCommerce's server-side normalisation: encode each key/value once, join with %3D / %26.
    const paramString = Object.keys(all)
      .sort()
      .map((k) => `${rfc3986(k)}%3D${rfc3986(all[k]!)}`)
      .join("%26");
    const base = `${method}&${rfc3986(endpoint)}&${paramString}`;
    const signature = crypto.createHmac("sha256", `${this.opts.secret}&`).update(base).digest("base64");
    return { ...oauth, oauth_signature: signature };
  }

  private async request<T>(
    method: "GET" | "POST" | "PUT" | "DELETE",
    path: string,
    { query = {}, body }: { query?: Query; body?: unknown } = {},
  ): Promise<{ data: T; headers: Headers }> {
    const endpoint = `${this.storeUrl}/wp-json/wc/v3/${path}`;
    const params: Record<string, string> = {};
    for (const [k, v] of Object.entries(query)) if (v !== undefined) params[k] = String(v);

    const headers: Record<string, string> = { Accept: "application/json" };
    if (body !== undefined) headers["Content-Type"] = "application/json";

    if (this.isHttps) {
      headers.Authorization = `Basic ${Buffer.from(`${this.opts.key}:${this.opts.secret}`).toString("base64")}`;
      params.consumer_key = this.opts.key;
      params.consumer_secret = this.opts.secret;
    } else {
      Object.assign(params, this.sign(method, endpoint, params));
    }

    const url = `${endpoint}?${new URLSearchParams(params).toString()}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.opts.timeoutMs);

    let res: Response;
    try {
      res = await fetch(url, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: controller.signal,
      });
    } catch (err) {
      if ((err as Error).name === "AbortError") {
        throw new WooError("WOO_TIMEOUT", `The store did not respond within ${this.opts.timeoutMs / 1000}s`);
      }
      const cause = (err as { cause?: { code?: string; message?: string } }).cause;
      const detail = cause?.code ?? cause?.message ?? (err as Error).message;
      throw new WooError("WOO_UNREACHABLE", `Could not reach the store at ${this.storeUrl} (${detail})`);
    } finally {
      clearTimeout(timer);
    }

    const text = await res.text();
    let json: unknown;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      throw new WooError(
        "WOO_MISCONFIGURED",
        "The store returned a web page instead of API data. Check WOO_URL and set WordPress Permalinks to 'Post name'.",
        { httpStatus: res.status },
      );
    }

    if (res.ok) return { data: json as T, headers: res.headers };

    const err = (json ?? {}) as { code?: string; message?: string; data?: { resource_id?: number } };
    const wooCode = err.code ?? "";
    const message = cleanMessage(err.message ?? `Store responded with HTTP ${res.status}`);
    const meta = { httpStatus: res.status, wooCode, resourceId: err.data?.resource_id };

    if (res.status === 401 || res.status === 403) {
      throw new WooError(
        "WOO_UNAUTHORIZED",
        `The store rejected the API keys: ${message}. Check they exist and have Read/Write permission.`,
        meta,
      );
    }
    if (res.status === 404 && wooCode === "rest_no_route") {
      throw new WooError("WOO_MISCONFIGURED", "WooCommerce REST API not found. Is the WooCommerce plugin active?", meta);
    }
    if (res.status === 404) throw new WooError("WOO_NOT_FOUND", message, meta);
    if (res.status >= 500) throw new WooError("WOO_UNREACHABLE", `The store had an internal error: ${message}`, meta);
    throw new WooError("WOO_REJECTED", message, meta);
  }

  /* ------------------------------------- API -------------------------------------- */

  async ping() {
    await this.request("GET", "products", { query: { per_page: 1, _fields: "id" } });
  }

  async getProduct(id: number) {
    return (await this.request<WooProduct>("GET", `products/${id}`)).data;
  }

  async findProductBySku(sku: string) {
    // `status=any` so drafts and trashed-but-not-deleted products are found too.
    const { data } = await this.request<WooProduct[]>("GET", "products", { query: { sku, status: "any" } });
    return data.find((p) => p.sku.toUpperCase() === sku.toUpperCase()) ?? null;
  }

  async createProduct(payload: WooProductPayload) {
    return (await this.request<WooProduct>("POST", "products", { body: payload })).data;
  }

  async updateProduct(id: number, payload: WooProductPayload) {
    return (await this.request<WooProduct>("PUT", `products/${id}`, { body: payload })).data;
  }

  async deleteProduct(id: number) {
    await this.request("DELETE", `products/${id}`, { query: { force: true } });
  }

  async listProducts(page: number, perPage: number): Promise<WooPage<WooProduct>> {
    const { data, headers } = await this.request<WooProduct[]>("GET", "products", {
      query: { page, per_page: perPage, status: "any", orderby: "id", order: "asc" },
    });
    return { items: data, totalPages: Number(headers.get("x-wp-totalpages") ?? 1) || 1 };
  }

  async listVariations(productId: number) {
    const all: WooVariation[] = [];
    for (let page = 1; page <= 10; page++) {
      const { data, headers } = await this.request<WooVariation[]>("GET", `products/${productId}/variations`, {
        query: { page, per_page: 100 },
      });
      all.push(...data);
      if (page >= Number(headers.get("x-wp-totalpages") ?? 1)) break;
    }
    return all;
  }

  async batchVariations(productId: number, batch: WooVariationBatch) {
    const { data } = await this.request<Partial<WooBatchResult>>("POST", `products/${productId}/variations/batch`, {
      body: batch,
    });
    return { create: data.create ?? [], update: data.update ?? [], delete: data.delete ?? [] };
  }

  async ensureCategory(name: string) {
    const key = name.trim().toLowerCase();
    const cached = this.categoryCache.get(key);
    if (cached) return cached;

    const { data } = await this.request<{ id: number; name: string }[]>("GET", "products/categories", {
      query: { search: name, per_page: 100 },
    });
    let id = data.find((c) => cleanMessage(c.name).toLowerCase() === key)?.id;
    if (!id) {
      try {
        id = (await this.request<{ id: number }>("POST", "products/categories", { body: { name } })).data.id;
      } catch (e) {
        // Created concurrently, or exists with a different case: WooCommerce tells us its id.
        if (e instanceof WooError && e.meta.wooCode === WOO_CODES.termExists && e.meta.resourceId) id = e.meta.resourceId;
        else throw e;
      }
    }
    this.categoryCache.set(key, id);
    return id;
  }
}
