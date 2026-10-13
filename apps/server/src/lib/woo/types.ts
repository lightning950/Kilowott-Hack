import type { ErrorCode, WooMode } from "@pim/shared";

/* Subset of the WooCommerce REST API v3 shapes this app reads and writes. */

export interface WooImage {
  id?: number;
  src: string;
}

export interface WooAttribute {
  id?: number;
  name: string;
  position?: number;
  visible?: boolean;
  variation?: boolean;
  options: string[];
}

export interface WooCategoryRef {
  id: number;
  name?: string;
}

export interface WooProduct {
  id: number;
  name: string;
  slug: string;
  permalink: string;
  type: string;
  status: string;
  sku: string;
  description: string;
  short_description: string;
  regular_price: string;
  sale_price: string;
  manage_stock: boolean;
  stock_quantity: number | null;
  categories: WooCategoryRef[];
  images: WooImage[];
  attributes: WooAttribute[];
  variations: number[];
  date_modified: string;
}

export interface WooProductPayload {
  name: string;
  type: "simple" | "variable";
  status: "publish";
  sku: string;
  description: string;
  short_description: string;
  regular_price?: string;
  sale_price?: string;
  manage_stock: boolean;
  stock_quantity?: number;
  categories: { id: number }[];
  images: WooImage[];
  attributes: WooAttribute[];
}

export interface WooVariation {
  id: number;
  sku: string;
  regular_price: string;
  sale_price: string;
  manage_stock: boolean;
  stock_quantity: number | null;
  attributes: { id?: number; name: string; option: string }[];
}

export interface WooVariationPayload {
  sku: string;
  regular_price: string;
  sale_price: string;
  manage_stock: true;
  stock_quantity: number;
  attributes: { name: string; option: string }[];
}

export interface WooVariationBatch {
  create: WooVariationPayload[];
  update: (WooVariationPayload & { id: number })[];
  delete: number[];
}

/** Batch endpoints report per-item failures inline instead of failing the request. */
export type WooBatchItem = (WooVariation & { error?: undefined }) | { id: number; error: { code: string; message: string } };

export interface WooBatchResult {
  create: WooBatchItem[];
  update: WooBatchItem[];
  delete: WooBatchItem[];
}

export interface WooPage<T> {
  items: T[];
  totalPages: number;
}

/** Everything the app needs from a store. Implemented by the real REST client and the mock. */
export interface WooClient {
  readonly mode: WooMode;
  readonly storeUrl: string;
  /** Cheap authenticated request used by the health check. */
  ping(): Promise<void>;
  getProduct(id: number): Promise<WooProduct>;
  findProductBySku(sku: string): Promise<WooProduct | null>;
  createProduct(payload: WooProductPayload): Promise<WooProduct>;
  updateProduct(id: number, payload: WooProductPayload): Promise<WooProduct>;
  deleteProduct(id: number): Promise<void>;
  listProducts(page: number, perPage: number): Promise<WooPage<WooProduct>>;
  listVariations(productId: number): Promise<WooVariation[]>;
  batchVariations(productId: number, batch: WooVariationBatch): Promise<WooBatchResult>;
  /** Returns the id of the category with this name, creating it when missing. */
  ensureCategory(name: string): Promise<number>;
  /** Public URL of a product page in the store. */
  productUrl(wooId: number): string;
}

/** Normalized store error. `code` is an API ErrorCode; `wooCode` is WooCommerce's own code. */
export class WooError extends Error {
  constructor(
    public readonly code: Extract<ErrorCode, `WOO_${string}`>,
    message: string,
    public readonly meta: { httpStatus?: number; wooCode?: string; resourceId?: number } = {},
  ) {
    super(message);
    this.name = "WooError";
  }
}

export const isWooError = (e: unknown, code?: WooError["code"]): e is WooError =>
  e instanceof WooError && (code === undefined || e.code === code);

/** WooCommerce codes we react to specifically. */
export const WOO_CODES = {
  duplicateSku: "product_invalid_sku",
  imageError: "woocommerce_product_image_upload_error",
  invalidProductId: "woocommerce_rest_product_invalid_id",
  invalidVariationId: "woocommerce_rest_product_variation_invalid_id",
  termExists: "term_exists",
} as const;
