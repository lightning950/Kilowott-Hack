import { SKU_PATTERN, decimalToPaise, type ImportResult, type ProductFields } from "@pim/shared";
import { now, transaction } from "../../db/client";
import { AppError } from "../../lib/errors";
import { WooError, isWooError, woo } from "../../lib/woo";
import type { WooProduct, WooVariation } from "../../lib/woo";
import { logRepo } from "../logs/repo";
import { productRepo, skuOwner } from "../products/repo";
import { IMPORT_LOCK, isLocked, productLockKey, tryLock, unlock } from "../sync/locks";
import { fromWooProduct } from "../sync/mapper";
import { comboKey } from "../variations/generator";
import { variationRepo, type VariationRecord } from "../variations/repo";

const normalizeSku = (value: string, id: number) => {
  const sku = value.trim().toUpperCase().replace(/[^A-Z0-9-]/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "").slice(0, 40);
  return SKU_PATTERN.test(sku) ? sku : `WOO-${id}`;
};

const productFields = (product: WooProduct): ProductFields => {
  const fields = fromWooProduct(product);
  const regularPrice = decimalToPaise(product.regular_price) ?? 0;
  const sale = decimalToPaise(product.sale_price);
  return {
    ...fields,
    sku: normalizeSku(product.sku, product.id),
    name: product.name.trim().length >= 2 ? product.name.trim() : `Product ${product.id}`,
    regularPrice,
    salePrice: sale !== null && sale < regularPrice ? sale : null,
  };
};

const importVariations = (productId: number, productSku: string, remote: WooVariation[]) => {
  const existing = variationRepo.listByProduct(productId);
  const byWooId = new Map(existing.filter((variation) => variation.wooVariationId).map((variation) => [variation.wooVariationId!, variation]));
  const bySku = new Map(existing.map((variation) => [variation.sku.toUpperCase(), variation]));
  const byCombo = new Map(existing.map((variation) => [variation.comboKey, variation]));
  const kept = new Set<number>();
  const replace = new Set<number>();

  for (const source of remote) {
    const attributes = Object.fromEntries(source.attributes.map((attribute) => [attribute.name, attribute.option]));
    const key = comboKey(attributes);
    const sku = normalizeSku(source.sku, source.id);
    const regularPrice = decimalToPaise(source.regular_price) ?? 0;
    const sale = decimalToPaise(source.sale_price);
    const current = byWooId.get(source.id) ?? bySku.get(sku.toUpperCase()) ?? byCombo.get(key);
    const data = { sku, regularPrice, salePrice: sale !== null && sale < regularPrice ? sale : null, stockQuantity: source.stock_quantity ?? 0 };
    if (current && current.comboKey === key) {
      variationRepo.update(current.id, data);
      variationRepo.setWooId(current.id, source.id);
      kept.add(current.id);
    } else {
      if (current) replace.add(current.id);
      const owner = skuOwner(sku);
      const resolvedSku = owner && !(owner.kind === "variation" && current?.id === owner.id) ? `${productSku}-${source.id}`.slice(0, 40) : sku;
      variationRepo.insert({ productId, ...data, sku: resolvedSku, attributes, comboKey: key, wooVariationId: source.id });
    }
  }
  const remoteKeys = new Set(remote.map((variation) => comboKey(Object.fromEntries(variation.attributes.map((attribute) => [attribute.name, attribute.option])))));
  variationRepo.deleteMany(existing.filter((variation) => replace.has(variation.id) || !remoteKeys.has(variation.comboKey)).map((variation) => variation.id));
};

export const importService = {
  async run(): Promise<ImportResult> {
    if (!tryLock(IMPORT_LOCK)) throw new AppError("IMPORT_IN_PROGRESS", 409, "An import is already running");
    const started = Date.now();
    const conflicts: ImportResult["conflicts"] = [];
    const skipped: ImportResult["skipped"] = [];
    let created = 0;
    let updated = 0;
    try {
      const products: WooProduct[] = [];
      for (let page = 1, totalPages = 1; page <= totalPages; page++) {
        const result = await woo.listProducts(page, 100);
        products.push(...result.items);
        totalPages = result.totalPages;
      }
      for (const source of products) {
        if (source.type !== "simple" && source.type !== "variable") {
          skipped.push({ wooId: source.id, name: source.name, reason: `Unsupported product type: ${source.type}` });
          continue;
        }
        const fields = productFields(source);
        const local = productRepo.findByWooId(source.id) ?? productRepo.findBySku(fields.sku);
        if (local && (local.syncStatus === "out_of_sync" || local.syncStatus === "failed" || isLocked(productLockKey(local.id)))) {
          conflicts.push({ sku: fields.sku, reason: "Has unsynced local edits" });
          continue;
        }
        const owner = skuOwner(fields.sku);
        if (owner && (!local || owner.kind !== "product" || owner.id !== local.id)) {
          skipped.push({ wooId: source.id, name: source.name, reason: "SKU is already used by a local variation or another product" });
          continue;
        }
        const remoteVariations = source.type === "variable" ? await woo.listVariations(source.id) : [];
        transaction(() => {
          const synced = { syncStatus: "synced" as const, wooId: source.id, lastSyncedAt: now(), lastError: null };
          const saved = local ? productRepo.update(local.id, fields, synced) : productRepo.insert(fields, synced);
          if (local) updated++; else created++;
          if (source.type === "variable") importVariations(saved.id, saved.sku, remoteVariations);
          else variationRepo.deleteByProduct(saved.id);
        });
      }
      const durationMs = Date.now() - started;
      logRepo.insert({ productId: null, productSku: null, action: "import", status: "success", message: `Imported ${created} new, ${updated} updated, ${conflicts.length} conflicts, ${skipped.length} skipped`, durationMs });
      return { created, updated, conflicts, skipped, durationMs };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unexpected import error";
      logRepo.insert({ productId: null, productSku: null, action: "import", status: "failed", message, durationMs: Date.now() - started });
      if (isWooError(error)) throw new AppError(error.code, 502, error.message);
      throw error;
    } finally {
      unlock(IMPORT_LOCK);
    }
  },
};
