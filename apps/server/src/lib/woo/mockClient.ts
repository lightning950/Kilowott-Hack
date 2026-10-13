import fs from "node:fs";
import path from "node:path";
import { WOO_CODES, WooError } from "./types";
import type {
  WooBatchItem,
  WooBatchResult,
  WooClient,
  WooPage,
  WooProduct,
  WooProductPayload,
  WooVariation,
  WooVariationBatch,
} from "./types";

interface MockState {
  nextId: number;
  products: WooProduct[];
  variations: Record<string, WooVariation[]>;
  categories: { id: number; name: string }[];
}

const emptyState = (): MockState => ({ nextId: 100, products: [], variations: {}, categories: [] });

const slugify = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

/**
 * In-memory WooCommerce stand-in, persisted to a JSON file so it survives restarts.
 * Mirrors the real API's behaviour for everything the app depends on: duplicate SKUs
 * (with resource_id), 404s, per-item batch errors, image download failures and
 * deleting variations when a product stops being variable.
 *
 * Demo helpers: an image URL on a `.invalid` host fails like an unreachable image,
 * and `setOffline(true)` makes every call fail like a dead store.
 */
export class MockWooClient implements WooClient {
  readonly mode = "mock" as const;
  readonly storeUrl: string;
  private state: MockState;
  private offline = false;

  constructor(
    private readonly file: string,
    private readonly publicBaseUrl: string,
  ) {
    this.storeUrl = `${publicBaseUrl}/mock-store`;
    this.state = this.load();
  }

  productUrl(wooId: number) {
    return `${this.storeUrl}/products/${wooId}`;
  }

  /* --------------------------------- demo controls --------------------------------- */

  setOffline(offline: boolean) {
    this.offline = offline;
  }

  isOffline() {
    return this.offline;
  }

  /** Read-only view for the mock storefront page. */
  snapshot() {
    return {
      products: this.state.products.map((p) => ({ ...p, variationItems: this.state.variations[p.id] ?? [] })),
    };
  }

  reset() {
    this.state = emptyState();
    this.save();
  }

  /** Simulates someone deleting a product directly in WooCommerce admin. */
  removeDirectly(id: number) {
    const before = this.state.products.length;
    this.state.products = this.state.products.filter((p) => p.id !== id);
    delete this.state.variations[id];
    this.save();
    return this.state.products.length !== before;
  }

  /* ---------------------------------- persistence ---------------------------------- */

  private load(): MockState {
    try {
      return { ...emptyState(), ...(JSON.parse(fs.readFileSync(this.file, "utf8")) as MockState) };
    } catch {
      return emptyState();
    }
  }

  private save() {
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    fs.writeFileSync(this.file, JSON.stringify(this.state, null, 2));
  }

  /** Every call goes through here: realistic latency, optional outage. */
  private async call<T>(fn: () => T): Promise<T> {
    await new Promise((r) => setTimeout(r, 80 + Math.random() * 220));
    if (this.offline) throw new WooError("WOO_UNREACHABLE", `Could not reach the store at ${this.storeUrl} (ECONNREFUSED)`);
    const result = fn();
    return structuredClone(result);
  }

  /* -------------------------------------- helpers -------------------------------------- */

  private nextId() {
    return this.state.nextId++;
  }

  private findProduct(id: number) {
    const p = this.state.products.find((x) => x.id === id);
    if (!p) throw new WooError("WOO_NOT_FOUND", "Invalid ID.", { httpStatus: 404, wooCode: WOO_CODES.invalidProductId });
    return p;
  }

  /** WooCommerce enforces SKU uniqueness across products and variations. */
  private skuOwner(sku: string, ignoreId?: number): number | undefined {
    const s = sku.toUpperCase();
    for (const p of this.state.products) {
      if (p.id !== ignoreId && p.sku.toUpperCase() === s) return p.id;
      for (const v of this.state.variations[p.id] ?? []) if (v.id !== ignoreId && v.sku.toUpperCase() === s) return v.id;
    }
    return undefined;
  }

  private assertSkuFree(sku: string, ignoreId?: number) {
    const owner = sku ? this.skuOwner(sku, ignoreId) : undefined;
    if (owner !== undefined) {
      throw new WooError("WOO_REJECTED", "Invalid or duplicated SKU.", {
        httpStatus: 400,
        wooCode: WOO_CODES.duplicateSku,
        resourceId: owner,
      });
    }
  }

  private assertImages(payload: WooProductPayload) {
    for (const img of payload.images) {
      let host = "";
      try {
        host = new URL(img.src).hostname;
      } catch {
        /* falls through to the error below */
      }
      if (!host || host.endsWith(".invalid")) {
        throw new WooError("WOO_REJECTED", `Error getting remote image ${img.src}. Error: Not Found`, {
          httpStatus: 400,
          wooCode: WOO_CODES.imageError,
        });
      }
    }
  }

  private apply(target: WooProduct, payload: WooProductPayload) {
    const wasVariable = target.type === "variable";
    Object.assign(target, {
      name: payload.name,
      slug: slugify(payload.name),
      type: payload.type,
      sku: payload.sku,
      description: payload.description,
      short_description: payload.short_description,
      regular_price: payload.regular_price ?? "",
      sale_price: payload.sale_price ?? "",
      manage_stock: payload.manage_stock,
      stock_quantity: payload.manage_stock ? (payload.stock_quantity ?? 0) : null,
      categories: payload.categories.map((c) => ({
        id: c.id,
        name: this.state.categories.find((x) => x.id === c.id)?.name ?? "",
      })),
      images: payload.images.map((i, n) => ({ id: target.id * 10 + n, src: i.src })),
      attributes: payload.attributes.map((a, n) => ({ id: 0, position: n, ...a })),
      date_modified: new Date().toISOString(),
    });
    // Same as WooCommerce: a product that stops being variable loses its variations.
    if (wasVariable && payload.type !== "variable") delete this.state.variations[target.id];
    target.variations = (this.state.variations[target.id] ?? []).map((v) => v.id);
  }

  /* --------------------------------------- API --------------------------------------- */

  ping() {
    return this.call(() => undefined);
  }

  getProduct(id: number) {
    return this.call(() => this.findProduct(id));
  }

  findProductBySku(sku: string) {
    return this.call(() => this.state.products.find((p) => p.sku.toUpperCase() === sku.toUpperCase()) ?? null);
  }

  createProduct(payload: WooProductPayload) {
    return this.call(() => {
      this.assertSkuFree(payload.sku);
      this.assertImages(payload);
      const id = this.nextId();
      const product = {
        id,
        permalink: this.productUrl(id),
        status: "publish",
        variations: [],
      } as unknown as WooProduct;
      this.apply(product, payload);
      this.state.products.push(product);
      this.save();
      return product;
    });
  }

  updateProduct(id: number, payload: WooProductPayload) {
    return this.call(() => {
      const product = this.findProduct(id);
      this.assertSkuFree(payload.sku, id);
      this.assertImages(payload);
      this.apply(product, payload);
      this.save();
      return product;
    });
  }

  deleteProduct(id: number) {
    return this.call(() => {
      this.findProduct(id);
      this.removeDirectly(id);
    });
  }

  listProducts(page: number, perPage: number): Promise<WooPage<WooProduct>> {
    return this.call(() => ({
      items: this.state.products.slice((page - 1) * perPage, page * perPage),
      totalPages: Math.max(1, Math.ceil(this.state.products.length / perPage)),
    }));
  }

  listVariations(productId: number) {
    return this.call(() => {
      this.findProduct(productId);
      return this.state.variations[productId] ?? [];
    });
  }

  batchVariations(productId: number, batch: WooVariationBatch): Promise<WooBatchResult> {
    return this.call(() => {
      const product = this.findProduct(productId);
      if (product.type !== "variable") {
        throw new WooError("WOO_REJECTED", "Product is not variable.", { httpStatus: 400 });
      }
      if (batch.create.length + batch.update.length + batch.delete.length > 100) {
        throw new WooError("WOO_REJECTED", "Unable to accept more than 100 items for this request.", { httpStatus: 413 });
      }
      const list = (this.state.variations[productId] ??= []);
      const invalidId = (id: number): WooBatchItem => ({
        id,
        error: { code: WOO_CODES.invalidVariationId, message: "Invalid ID." },
      });
      const toVariation = (id: number, v: WooVariationBatch["create"][number]): WooVariation => ({
        id,
        sku: v.sku,
        regular_price: v.regular_price,
        sale_price: v.sale_price,
        manage_stock: true,
        stock_quantity: v.stock_quantity,
        attributes: v.attributes,
      });

      const result: WooBatchResult = { create: [], update: [], delete: [] };

      for (const id of batch.delete) {
        const i = list.findIndex((v) => v.id === id);
        if (i === -1) result.delete.push(invalidId(id));
        else result.delete.push(list.splice(i, 1)[0]!);
      }
      for (const u of batch.update) {
        const i = list.findIndex((v) => v.id === u.id);
        if (i === -1) {
          result.update.push(invalidId(u.id));
          continue;
        }
        if (this.skuOwner(u.sku, u.id) !== undefined) {
          result.update.push({ id: u.id, error: { code: WOO_CODES.duplicateSku, message: "Invalid or duplicated SKU." } });
          continue;
        }
        list[i] = toVariation(u.id, u);
        result.update.push(list[i]!);
      }
      for (const c of batch.create) {
        if (this.skuOwner(c.sku) !== undefined) {
          result.create.push({ id: 0, error: { code: WOO_CODES.duplicateSku, message: "Invalid or duplicated SKU." } });
          continue;
        }
        const v = toVariation(this.nextId(), c);
        list.push(v);
        result.create.push(v);
      }

      product.variations = list.map((v) => v.id);
      this.save();
      return result;
    });
  }

  ensureCategory(name: string) {
    return this.call(() => {
      const existing = this.state.categories.find((c) => c.name.toLowerCase() === name.trim().toLowerCase());
      if (existing) return existing.id;
      const category = { id: this.nextId(), name: name.trim() };
      this.state.categories.push(category);
      this.save();
      return category.id;
    });
  }
}
