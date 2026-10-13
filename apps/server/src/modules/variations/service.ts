import {
  MAX_VARIATIONS,
  variationUpdateSchema,
  type GenerateVariationsResult,
  type Variation,
  type VariationUpdateInput,
} from "@pim/shared";
import { transaction } from "../../db/client";
import { AppError, notFound, skuTaken } from "../../lib/errors";
import { productRepo, skuOwner } from "../products/repo";
import { isLocked, productLockKey } from "../sync/locks";
import { comboKey, combinations, countCombinations, uniqueSku, variationSku } from "./generator";
import { toPublicVariation, variationRepo } from "./repo";

const assertNotSyncing = (productId: number) => {
  if (isLocked(productLockKey(productId))) {
    throw new AppError("SYNC_IN_PROGRESS", 409, "This product is syncing right now. Try again in a moment.");
  }
};

export const variationService = {
  /**
   * One variation per combination of attribute options.
   * Existing combinations keep their price, stock and store id; removed ones are deleted;
   * new ones get a generated SKU and the product's default price.
   */
  generate(productId: number): GenerateVariationsResult {
    const product = productRepo.findById(productId);
    if (!product) throw notFound("Product", productId);
    assertNotSyncing(productId);

    if (product.type !== "variable") {
      throw new AppError("NOT_SYNCABLE", 422, "Only variable products have variations");
    }
    if (product.attributes.length === 0) {
      throw new AppError("NOT_SYNCABLE", 422, "Add at least one attribute with options first");
    }
    const count = countCombinations(product.attributes);
    if (count > MAX_VARIATIONS) {
      throw new AppError(
        "TOO_MANY_VARIATIONS",
        422,
        `${count} combinations is over the limit of ${MAX_VARIATIONS}. Remove some options.`,
      );
    }

    const wanted = combinations(product.attributes);
    const wantedKeys = new Set(wanted.map(comboKey));
    const existing = variationRepo.listByProduct(productId);
    const existingKeys = new Set(existing.map((v) => v.comboKey));
    const toRemove = existing.filter((v) => !wantedKeys.has(v.comboKey));

    let created = 0;
    transaction(() => {
      variationRepo.deleteMany(toRemove.map((v) => v.id));
      for (const combo of wanted) {
        const key = comboKey(combo);
        if (existingKeys.has(key)) continue;
        const sku = uniqueSku(variationSku(product.sku, combo), (s) => skuOwner(s) !== null);
        variationRepo.insert({
          productId,
          sku,
          attributes: combo,
          comboKey: key,
          regularPrice: product.regularPrice,
          salePrice: null,
          stockQuantity: 0,
        });
        created++;
      }
      if (created > 0 || toRemove.length > 0) productRepo.markEdited(productId);
    });

    return {
      created,
      kept: existing.length - toRemove.length,
      removed: toRemove.length,
      variations: variationRepo.listByProduct(productId).map(toPublicVariation),
    };
  },

  update(id: number, input: VariationUpdateInput): Variation {
    const current = variationRepo.findById(id);
    if (!current) throw notFound("Variation", id);
    assertNotSyncing(current.productId);

    const patch = variationUpdateSchema.parse(input);
    const regular = patch.regularPrice ?? current.regularPrice;
    const sale = patch.salePrice !== undefined ? patch.salePrice : current.salePrice;
    if (sale !== null && sale >= regular) {
      throw new AppError("VALIDATION_ERROR", 400, "Sale price must be lower than the regular price", {
        fieldErrors: { salePrice: "Must be lower than the regular price" },
      });
    }
    if (patch.sku && patch.sku.toUpperCase() !== current.sku.toUpperCase()) {
      const owner = skuOwner(patch.sku);
      if (owner && !(owner.kind === "variation" && owner.id === id)) throw skuTaken(patch.sku);
    }

    // Saving the same value again must not flip the product to "out of sync".
    const changed =
      (patch.sku !== undefined && patch.sku !== current.sku) ||
      (patch.regularPrice !== undefined && patch.regularPrice !== current.regularPrice) ||
      (patch.salePrice !== undefined && patch.salePrice !== current.salePrice) ||
      (patch.stockQuantity !== undefined && patch.stockQuantity !== current.stockQuantity);
    if (!changed) return toPublicVariation(current);

    const updated = transaction(() => {
      const v = variationRepo.update(id, patch);
      productRepo.markEdited(current.productId);
      return v;
    });
    return toPublicVariation(updated);
  },
};