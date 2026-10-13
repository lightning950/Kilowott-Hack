import { PENDING_STATUSES, type BulkSyncResult, type Product, type SyncAction, type SyncResult } from "@pim/shared";
import { now } from "../../db/client";
import { AppError, notFound } from "../../lib/errors";
import { WOO_CODES, WooError, isWooError, woo } from "../../lib/woo";
import type { WooBatchItem, WooVariationBatch, WooVariationPayload } from "../../lib/woo";
import { logRepo } from "../logs/repo";
import { productRepo } from "../products/repo";
import { variationsMatchAttributes } from "../variations/generator";
import { variationRepo, type VariationRecord } from "../variations/repo";
import { isLocked, productLockKey, tryLock, unlock } from "./locks";
import { toWooProduct, toWooVariation } from "./mapper";

type InternalSyncResult = SyncResult & { errorCode?: WooError["code"] };
type PlannedCreate = { local: VariationRecord; payload: WooVariationPayload };
type PlannedUpdate = { local: VariationRecord; payload: WooVariationPayload & { id: number } };

const errorMessage = (error: unknown) =>
  error instanceof Error ? error.message : typeof error === "string" ? error : "Unknown error";

const chunks = <T>(items: T[], size: number): T[][] => {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
};

const assertBatchItems = (items: WooBatchItem[], fallbackSku: string) => {
  for (const item of items) {
    if ("error" in item && item.error) {
      throw new WooError("WOO_REJECTED", `${fallbackSku}: ${item.error.message}`, { wooCode: item.error.code });
    }
  }
};

const syncVariations = async (productId: number, wooId: number) => {
  const local = variationRepo.listByProduct(productId);
  const remote = await woo.listVariations(wooId);
  const remoteById = new Map(remote.map((variation) => [variation.id, variation]));
  const remoteBySku = new Map(remote.map((variation) => [variation.sku.toUpperCase(), variation]));
  const claimed = new Set<number>();
  const create: PlannedCreate[] = [];
  const update: PlannedUpdate[] = [];

  for (const variation of local) {
    const payload = toWooVariation(variation);
    const byId = variation.wooVariationId ? remoteById.get(variation.wooVariationId) : undefined;
    const match = byId ?? remoteBySku.get(variation.sku.toUpperCase());
    if (match) {
      claimed.add(match.id);
      if (variation.wooVariationId !== match.id) variationRepo.setWooId(variation.id, match.id);
      update.push({ local: variation, payload: { ...payload, id: match.id } });
    } else {
      create.push({ local: variation, payload });
    }
  }

  const remove = remote.filter((variation) => !claimed.has(variation.id)).map((variation) => variation.id);
  const operations: { create: PlannedCreate[]; update: PlannedUpdate[]; delete: number[] }[] = [];
  let createIndex = 0;
  let updateIndex = 0;
  let deleteIndex = 0;
  while (createIndex < create.length || updateIndex < update.length || deleteIndex < remove.length) {
    let remaining = 100;
    const createBatch = create.slice(createIndex, createIndex + remaining);
    createIndex += createBatch.length;
    remaining -= createBatch.length;
    const updateBatch = update.slice(updateIndex, updateIndex + remaining);
    updateIndex += updateBatch.length;
    remaining -= updateBatch.length;
    const deleteBatch = remove.slice(deleteIndex, deleteIndex + remaining);
    deleteIndex += deleteBatch.length;
    operations.push({ create: createBatch, update: updateBatch, delete: deleteBatch });
  }

  const retry: PlannedCreate[] = [];
  for (const operation of operations) {
    const batch: WooVariationBatch = {
      create: operation.create.map(({ payload }) => payload),
      update: operation.update.map(({ payload }) => payload),
      delete: operation.delete,
    };
    const result = await woo.batchVariations(wooId, batch);
    const createsBySku = new Map(operation.create.map((item) => [item.payload.sku.toUpperCase(), item.local]));
    for (const item of result.create) {
      if ("error" in item && item.error) {
        throw new WooError("WOO_REJECTED", `Variation: ${item.error.message}`, { wooCode: item.error.code });
      }
      const localVariation = createsBySku.get(item.sku.toUpperCase());
      if (localVariation) variationRepo.setWooId(localVariation.id, item.id);
    }
    for (const item of result.update) {
      if (!("error" in item && item.error)) continue;
      const planned = operation.update.find((candidate) => candidate.payload.id === item.id);
      if (item.error.code.includes("invalid_id") && planned) {
        variationRepo.setWooId(planned.local.id, null);
        retry.push({ local: planned.local, payload: toWooVariation(planned.local) });
      } else {
        throw new WooError("WOO_REJECTED", `${planned?.local.sku ?? "Variation"}: ${item.error.message}`, {
          wooCode: item.error.code,
        });
      }
    }
    assertBatchItems(result.delete, "Variation");
  }

  for (const retryBatch of chunks(retry, 100)) {
    const result = await woo.batchVariations(wooId, { create: retryBatch.map(({ payload }) => payload), update: [], delete: [] });
    const bySku = new Map(retryBatch.map((item) => [item.payload.sku.toUpperCase(), item.local]));
    for (const item of result.create) {
      if ("error" in item && item.error) {
        throw new WooError("WOO_REJECTED", `Variation: ${item.error.message}`, { wooCode: item.error.code });
      }
      const localVariation = bySku.get(item.sku.toUpperCase());
      if (localVariation) variationRepo.setWooId(localVariation.id, item.id);
    }
  }
  return local.length;
};

export const syncService = {
  storeUrl: (wooId: number) => woo.productUrl(wooId),

  async syncProduct(id: number): Promise<InternalSyncResult> {
    const lock = productLockKey(id);
    if (!tryLock(lock)) throw new AppError("SYNC_IN_PROGRESS", 409, "This product is already syncing");
    let product: Product | undefined;
    let action: SyncAction = "create";
    let started = 0;
    const warnings: string[] = [];
    try {
      product = productRepo.findById(id);
      if (!product) throw notFound("Product", id);
      const variations = variationRepo.listByProduct(id);
      if (product.type === "variable") {
        if (!product.attributes.length) throw new AppError("NOT_SYNCABLE", 422, "Add at least one attribute before syncing");
        if (!variations.length) throw new AppError("NOT_SYNCABLE", 422, "Generate variations before syncing");
        if (!variationsMatchAttributes(product.attributes, variations)) {
          throw new AppError("VARIATIONS_OUTDATED", 422, "Attributes changed. Regenerate variations before syncing");
        }
      }

      productRepo.setSyncState(id, { syncStatus: "syncing" });
      started = Date.now();
      try {
        const categoryId = product.category.trim() ? await woo.ensureCategory(product.category) : null;
        const upsert = async (withImages = true): Promise<{ wooId: number; action: "create" | "update" }> => {
          const payload = toWooProduct(product!, categoryId, { withImages });
          if (product!.wooId) {
            try {
              const updated = await woo.updateProduct(product!.wooId, payload);
              return { wooId: updated.id, action: "update" };
            } catch (error) {
              if (!isWooError(error, "WOO_NOT_FOUND")) throw error;
              variationRepo.clearWooIds(id);
              warnings.push("Product was missing in WooCommerce and has been recreated");
            }
          }
          const existing = await woo.findProductBySku(product!.sku);
          if (existing) {
            const updated = await woo.updateProduct(existing.id, payload);
            warnings.push(`Linked to existing store product #${existing.id} with the same SKU`);
            return { wooId: updated.id, action: "update" };
          }
          try {
            const created = await woo.createProduct(payload);
            return { wooId: created.id, action: "create" };
          } catch (error) {
            if (isWooError(error) && error.meta.wooCode === WOO_CODES.duplicateSku && error.meta.resourceId) {
              const updated = await woo.updateProduct(error.meta.resourceId, payload);
              return { wooId: updated.id, action: "update" };
            }
            throw error;
          }
        };

        let upserted: { wooId: number; action: "create" | "update" };
        try {
          upserted = await upsert();
        } catch (error) {
          if (!isWooError(error) || error.meta.wooCode !== WOO_CODES.imageError) throw error;
          warnings.push("Image could not be downloaded by WooCommerce; synced without it");
          upserted = await upsert(false);
        }
        action = upserted.action;
        const other = productRepo.findByWooId(upserted.wooId);
        if (other && other.id !== id) {
          throw new WooError("WOO_REJECTED", `Store product #${upserted.wooId} is already linked to ${other.sku}`);
        }
        const variationCount = product.type === "variable" ? await syncVariations(id, upserted.wooId) : 0;
        const durationMs = Date.now() - started;
        const message = `${action === "create" ? "Created" : "Updated"} as store product #${upserted.wooId}${
          product.type === "variable" ? ` with ${variationCount} variations` : ""
        }`;
        productRepo.setSyncState(id, { syncStatus: "synced", wooId: upserted.wooId, lastError: null, lastSyncedAt: now() });
        logRepo.insert({ productId: id, productSku: product.sku, action, status: "success", message, warnings, durationMs });
        return { productId: id, sku: product.sku, status: "success", action, wooId: upserted.wooId, message, warnings, durationMs };
      } catch (error) {
        const message = errorMessage(error);
        const durationMs = Date.now() - started;
        productRepo.setSyncState(id, { syncStatus: "failed", lastError: message });
        logRepo.insert({ productId: id, productSku: product.sku, action: product.wooId ? "update" : action, status: "failed", message, warnings, durationMs });
        return {
          productId: id, sku: product.sku, status: "failed", action: product.wooId ? "update" : action, wooId: product.wooId,
          message, warnings, durationMs, ...(isWooError(error) ? { errorCode: error.code } : {}),
        };
      }
    } finally {
      unlock(lock);
    }
  },

  async syncBulk(ids?: number[]): Promise<BulkSyncResult> {
    const targets = ids ? productRepo.existingIds(ids) : productRepo.idsWithStatus(PENDING_STATUSES);
    const results: SyncResult[] = [];
    let succeeded = 0;
    let failed = 0;
    let skipped = 0;
    let next = 0;
    const worker = async () => {
      while (next < targets.length) {
        const id = targets[next++]!;
        if (isLocked(productLockKey(id))) { skipped++; continue; }
        try {
          const result = await this.syncProduct(id);
          results.push(result);
          if (result.status === "success") succeeded++; else failed++;
        } catch (error) {
          const product = productRepo.findById(id);
          results.push({ productId: id, sku: product?.sku ?? `#${id}`, status: "failed", action: product?.wooId ? "update" : "create", wooId: product?.wooId ?? null, message: errorMessage(error), warnings: [], durationMs: 0 });
          failed++;
        }
      }
    };
    await Promise.all(Array.from({ length: Math.min(2, targets.length) }, worker));
    return { total: targets.length, succeeded, failed, skipped, results };
  },

  async deleteRemote(product: Product): Promise<void> {
    if (!product.wooId) return;
    const started = Date.now();
    try {
      await woo.deleteProduct(product.wooId);
    } catch (error) {
      if (!isWooError(error, "WOO_NOT_FOUND")) {
        const message = errorMessage(error);
        logRepo.insert({ productId: product.id, productSku: product.sku, action: "delete", status: "failed", message, durationMs: Date.now() - started });
        throw new AppError(isWooError(error) ? error.code : "WOO_REJECTED", 502, `Couldn't delete in WooCommerce: ${message}`);
      }
    }
    logRepo.insert({ productId: product.id, productSku: product.sku, action: "delete", status: "success", message: `Deleted store product #${product.wooId}`, durationMs: Date.now() - started });
  },
};
