import {
  productCreateSchema,
  productRules,
  productFieldsSchema,
  productUpdateSchema,
  type Paginated,
  type Product,
  type ProductCreateInput,
  type ProductDeleteScope,
  type ProductDetail,
  type ProductFields,
  type ProductListQuery,
  type ProductUpdateInput,
} from "@pim/shared";
import { transaction } from "../../db/client";
import { AppError, notFound, skuTaken } from "../../lib/errors";
import { toFieldErrors } from "../../middleware/validate";
import { attributeSetRepo } from "../attributeSets/repo";
import { syncService } from "../sync/service";
import { isLocked, productLockKey } from "../sync/locks";
import { variationsMatchAttributes } from "../variations/generator";
import { toPublicVariation, variationRepo } from "../variations/repo";
import { productRepo, skuOwner } from "./repo";

const FIELD_KEYS = Object.keys(productFieldsSchema.shape) as (keyof ProductFields)[];

const pickFields = (p: Product): ProductFields =>
  Object.fromEntries(FIELD_KEYS.map((k) => [k, p[k]])) as unknown as ProductFields;

const sameValue = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

const assertNotSyncing = (id: number) => {
  if (isLocked(productLockKey(id))) {
    throw new AppError("SYNC_IN_PROGRESS", 409, "This product is syncing right now. Try again in a moment.");
  }
};

const assertAttributeSet = (id: number | null) => {
  if (id !== null && !attributeSetRepo.findById(id)) {
    throw new AppError("VALIDATION_ERROR", 400, "Attribute set does not exist", {
      fieldErrors: { attributeSetId: "Pick an existing attribute set" },
    });
  }
};

/** Simple products never carry attributes; keeps the two types unambiguous. */
const normalize = (f: ProductFields): ProductFields => (f.type === "simple" ? { ...f, attributes: [] } : f);

export const productService = {
  list(query: ProductListQuery): Paginated<Product> {
    return productRepo.list(query);
  },

  get(id: number): Product {
    const product = productRepo.findById(id);
    if (!product) throw notFound("Product", id);
    return product;
  },

  getDetail(id: number): ProductDetail {
    const product = this.get(id);
    const variations = variationRepo.listByProduct(id);
    return {
      ...product,
      variations: variations.map(toPublicVariation),
      variationsUpToDate: product.type === "simple" || variationsMatchAttributes(product.attributes, variations),
      storeUrl: product.wooId ? syncService.storeUrl(product.wooId) : null,
    };
  },

  create(input: ProductCreateInput): ProductDetail {
    let fields = productCreateSchema.parse(input);
    if (skuOwner(fields.sku)) throw skuTaken(fields.sku);
    assertAttributeSet(fields.attributeSetId);

    // Picking a set with no attributes typed yet → start from the set's defaults.
    if (fields.type === "variable" && fields.attributeSetId && fields.attributes.length === 0) {
      const set = attributeSetRepo.findById(fields.attributeSetId)!;
      fields = {
        ...fields,
        attributes: set.attributes
          .filter((a) => a.defaultOptions.length > 0)
          .map((a) => ({ name: a.name, options: a.defaultOptions })),
      };
    }

    const product = productRepo.insert(normalize(fields), { syncStatus: "draft" });
    return this.getDetail(product.id);
  },

  update(id: number, input: ProductUpdateInput, opts: { confirmDeleteVariations: boolean }): ProductDetail {
    const current = this.get(id);
    assertNotSyncing(id);
    const patch = productUpdateSchema.parse(input);

    // Validate the merged result so a PATCH can never produce an invalid product.
    const mergedResult = productFieldsSchema.superRefine(productRules).safeParse({ ...pickFields(current), ...patch });
    if (!mergedResult.success) {
      const fieldErrors = toFieldErrors(mergedResult.error);
      throw new AppError("VALIDATION_ERROR", 400, Object.values(fieldErrors)[0] ?? "Invalid product", { fieldErrors });
    }
    const merged = normalize(mergedResult.data);

    if (merged.sku.toUpperCase() !== current.sku.toUpperCase()) {
      const owner = skuOwner(merged.sku);
      if (owner && !(owner.kind === "product" && owner.id === id)) throw skuTaken(merged.sku);
    }
    if (patch.attributeSetId !== undefined) assertAttributeSet(merged.attributeSetId);

    const switchingToSimple = current.type === "variable" && merged.type === "simple";
    if (switchingToSimple && current.variationCount > 0 && !opts.confirmDeleteVariations) {
      throw new AppError(
        "VARIATIONS_EXIST",
        409,
        `Switching to a simple product deletes its ${current.variationCount} variations. Confirm to continue.`,
        { details: { variationCount: current.variationCount } },
      );
    }

    // Only write what actually changed; a no-op save must not flip the sync status.
    const before = pickFields(current);
    const changes: Partial<ProductFields> = {};
    for (const k of FIELD_KEYS) {
      if (!sameValue(before[k], merged[k])) (changes as Record<string, unknown>)[k] = merged[k];
    }
    if (Object.keys(changes).length === 0) return this.getDetail(id);

    transaction(() => {
      if (switchingToSimple) variationRepo.deleteByProduct(id);
      productRepo.update(id, changes);
      productRepo.markEdited(id);
    });
    return this.getDetail(id);
  },

  async remove(id: number, scope: ProductDeleteScope): Promise<{ id: number; deletedInStore: boolean }> {
    const product = this.get(id);
    assertNotSyncing(id);
    let deletedInStore = false;
    if (scope === "everywhere" && product.wooId) {
      // Throws (and keeps the PIM row) if the store refuses; a missing store product counts as deleted.
      await syncService.deleteRemote(product);
      deletedInStore = true;
    }
    productRepo.delete(id);
    return { id, deletedInStore };
  },
};
