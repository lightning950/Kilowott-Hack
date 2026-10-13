import type { LogListQuery, ProductListQuery } from "@pim/shared";

/** Every TanStack Query key in the app. Invalidate by prefix (e.g. queryKeys.products.all). */
export const queryKeys = {
  products: {
    all: ["products"] as const,
    list: (q: Partial<ProductListQuery>) => ["products", "list", q] as const,
    detail: (id: number) => ["products", "detail", id] as const,
  },
  attributeSets: { all: ["attribute-sets"] as const },
  logs: {
    all: ["logs"] as const,
    list: (q: Partial<LogListQuery>) => ["logs", "list", q] as const,
  },
  stats: ["stats"] as const,
  health: ["health"] as const,
};
