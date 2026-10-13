import type {
  ApiResponse,
  AttributeSet,
  AttributeSetCreateInput,
  AttributeSetUpdateInput,
  BulkSyncResult,
  ErrorCode,
  GenerateVariationsResult,
  HealthReport,
  ImportResult,
  LogListQuery,
  Paginated,
  Product,
  ProductCreateInput,
  ProductDeleteScope,
  ProductDetail,
  ProductListQuery,
  ProductUpdateInput,
  Stats,
  SyncLog,
  SyncResult,
  Variation,
  VariationUpdateInput,
} from "@pim/shared";

/** Thrown for every non-2xx response. Components switch on `code`, never on `message`. */
export class ApiError extends Error {
  constructor(
    public readonly code: ErrorCode | "NETWORK_ERROR",
    message: string,
    public readonly status: number,
    public readonly fieldErrors: Record<string, string> = {},
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

type Query = Record<string, string | number | boolean | undefined | null>;

const toSearch = (query?: Query) => {
  if (!query) return "";
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(query)) if (v !== undefined && v !== null && v !== "") params.set(k, String(v));
  const s = params.toString();
  return s ? `?${s}` : "";
};

async function request<T>(method: string, path: string, opts: { body?: unknown; query?: Query } = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`/api${path}${toSearch(opts.query)}`, {
      method,
      headers: opts.body === undefined ? undefined : { "Content-Type": "application/json" },
      body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
    });
  } catch {
    throw new ApiError("NETWORK_ERROR", "Can't reach the PIM server. Is it running on port 4000?", 0);
  }

  let json: ApiResponse<T> | null = null;
  try {
    json = (await res.json()) as ApiResponse<T>;
  } catch {
    /* non-JSON response, handled below */
  }

  if (json && "data" in json && res.ok) return json.data;
  if (json && "error" in json) {
    const e = json.error;
    throw new ApiError(e.code, e.message, res.status, e.fieldErrors ?? {}, e.details);
  }
    // No JSON body = the request never reached our API (Vite's proxy answers 500/502/504
  // when the server on port 4000 isn't running).
  throw new ApiError(
    "NETWORK_ERROR",
    "Can't reach the PIM server on port 4000. Is the backend running?",
    res.status,
  );
}

export const api = {
  products: {
    list: (q: Partial<ProductListQuery>) => request<Paginated<Product>>("GET", "/products", { query: q }),
    get: (id: number) => request<ProductDetail>("GET", `/products/${id}`),
    create: (body: ProductCreateInput) => request<ProductDetail>("POST", "/products", { body }),
    update: (id: number, body: ProductUpdateInput, confirmDeleteVariations = false) =>
      request<ProductDetail>("PATCH", `/products/${id}`, { body, query: { confirmDeleteVariations } }),
    remove: (id: number, scope: ProductDeleteScope) =>
      request<{ id: number; deletedInStore: boolean }>("DELETE", `/products/${id}`, { query: { scope } }),
    generateVariations: (id: number) =>
      request<GenerateVariationsResult>("POST", `/products/${id}/variations/generate`),
  },
  variations: {
    update: (id: number, body: VariationUpdateInput) => request<Variation>("PATCH", `/variations/${id}`, { body }),
  },
  attributeSets: {
    list: () => request<AttributeSet[]>("GET", "/attribute-sets"),
    create: (body: AttributeSetCreateInput) => request<AttributeSet>("POST", "/attribute-sets", { body }),
    update: (id: number, body: AttributeSetUpdateInput) => request<AttributeSet>("PATCH", `/attribute-sets/${id}`, { body }),
    remove: (id: number) => request<{ id: number; detachedProducts: number }>("DELETE", `/attribute-sets/${id}`),
  },
  sync: {
    one: (productId: number) => request<SyncResult>("POST", `/sync/${productId}`),
    bulk: (productIds?: number[]) => request<BulkSyncResult>("POST", "/sync/bulk", { body: productIds ? { productIds } : {} }),
  },
  import: () => request<ImportResult>("POST", "/import"),
  logs: {
    list: (q: Partial<LogListQuery>) => request<Paginated<SyncLog>>("GET", "/logs", { query: q }),
  },
  system: {
    health: () => request<HealthReport>("GET", "/health"),
    stats: () => request<Stats>("GET", "/stats"),
  },
};

/** User-facing message for any thrown value. */
export const errorMessage = (e: unknown): string =>
  e instanceof ApiError ? e.message : e instanceof Error ? e.message : "Something went wrong";
