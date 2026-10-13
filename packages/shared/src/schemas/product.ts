import { z } from "zod";
import { optionalUrlSchema, paginationQuerySchema, paiseSchema, skuSchema, stockSchema } from "./common";
import { SYNC_STATUSES, type SyncStatus } from "./sync";

export const PRODUCT_TYPES = ["simple", "variable"] as const;
export type ProductType = (typeof PRODUCT_TYPES)[number];

/** WooCommerce batch endpoints accept 100 items per request; we cap variations at that. */
export const MAX_VARIATIONS = 100;
export const MAX_ATTRIBUTES = 5;
export const MAX_OPTIONS_PER_ATTRIBUTE = 20;

const hasDuplicates = (values: string[]) =>
  new Set(values.map((v) => v.toLowerCase())).size !== values.length;

/* ---------------------------------- Attributes ---------------------------------- */

export const attributeNameSchema = z
  .string()
  .trim()
  .min(1, "Attribute name is required")
  .max(40, "Attribute name is too long");

export const attributeOptionSchema = z
  .string()
  .trim()
  .min(1, "Option cannot be empty")
  .max(60, "Option is too long");

/** An attribute on a product, e.g. { name: "Size", options: ["S", "M", "L"] }. */
export const attributeDefSchema = z.object({
  name: attributeNameSchema,
  options: z
    .array(attributeOptionSchema)
    .min(1, "Add at least one option")
    .max(MAX_OPTIONS_PER_ATTRIBUTE, `At most ${MAX_OPTIONS_PER_ATTRIBUTE} options`)
    .refine((o) => !hasDuplicates(o), "Options must be unique"),
});
export type AttributeDef = z.infer<typeof attributeDefSchema>;

const attributesSchema = z
  .array(attributeDefSchema)
  .max(MAX_ATTRIBUTES, `At most ${MAX_ATTRIBUTES} attributes`)
  .refine((a) => !hasDuplicates(a.map((x) => x.name)), "Attribute names must be unique");

/* ----------------------------------- Products ----------------------------------- */

/** Fields a user can edit. Used for create (with defaults) and update (partial). */
export const productFieldsSchema = z.object({
  sku: skuSchema,
  name: z.string().trim().min(2, "Name is too short").max(200, "Name is too long"),
  description: z.string().max(20_000).default(""),
  shortDescription: z.string().max(2_000).default(""),
  type: z.enum(PRODUCT_TYPES).default("simple"),
  regularPrice: paiseSchema.default(0),
  salePrice: paiseSchema.nullable().default(null),
  stockQuantity: stockSchema.default(0),
  category: z.string().trim().max(100).default(""),
  imageUrl: optionalUrlSchema.default(null),
  attributeSetId: z.number().int().positive().nullable().default(null),
  attributes: attributesSchema.default([]),
});

/**
 * Cross-field rules. Applied to create input and to the merged result of an update,
 * so a PATCH can never leave a product in an invalid state.
 */
export const productRules = (p: z.infer<typeof productFieldsSchema>, ctx: z.RefinementCtx) => {
  if (p.salePrice !== null && p.salePrice >= p.regularPrice && p.type === "simple") {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["salePrice"],
      message: "Sale price must be lower than the regular price",
    });
  }
  if (p.type === "simple" && p.regularPrice === 0) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["regularPrice"],
      message: "Simple products need a regular price",
    });
  }
};

export const productCreateSchema = productFieldsSchema.superRefine(productRules);
export type ProductCreateInput = z.input<typeof productCreateSchema>;
export type ProductFields = z.infer<typeof productFieldsSchema>;

/** PATCH body: every field optional, no defaults applied. */
export const productUpdateSchema = productFieldsSchema.partial().strict();
export type ProductUpdateInput = z.input<typeof productUpdateSchema>;

/** Query flags for PATCH /products/:id. */
export const productUpdateQuerySchema = z.object({
  /** Required when switching variable → simple while variations exist. */
  confirmDeleteVariations: z
    .enum(["true", "false"])
    .default("false")
    .transform((v) => v === "true"),
});

export const productDeleteQuerySchema = z.object({
  /** "pim" removes it here only; "everywhere" also deletes it from WooCommerce. */
  scope: z.enum(["pim", "everywhere"]).default("pim"),
});
export type ProductDeleteScope = z.infer<typeof productDeleteQuerySchema>["scope"];

export const productListQuerySchema = paginationQuerySchema.extend({
  search: z.string().trim().max(100).optional(),
  status: z.enum(SYNC_STATUSES).optional(),
  type: z.enum(PRODUCT_TYPES).optional(),
});
export type ProductListQuery = z.infer<typeof productListQuerySchema>;

/** A product as returned by the API. */
export interface Product {
  id: number;
  sku: string;
  name: string;
  description: string;
  shortDescription: string;
  type: ProductType;
  regularPrice: number;
  salePrice: number | null;
  stockQuantity: number;
  category: string;
  imageUrl: string | null;
  attributeSetId: number | null;
  attributes: AttributeDef[];
  wooId: number | null;
  syncStatus: SyncStatus;
  lastError: string | null;
  lastSyncedAt: string | null;
  createdAt: string;
  updatedAt: string;
  variationCount: number;
}

export interface ProductDetail extends Product {
  variations: Variation[];
  /** False when attributes changed after variations were generated. */
  variationsUpToDate: boolean;
  /** Direct link to the product in the WooCommerce store, when synced. */
  storeUrl: string | null;
}

/* ---------------------------------- Variations ---------------------------------- */

export interface Variation {
  id: number;
  productId: number;
  sku: string;
  /** e.g. { Size: "M", Color: "Black" } */
  attributes: Record<string, string>;
  regularPrice: number;
  salePrice: number | null;
  stockQuantity: number;
  wooVariationId: number | null;
  createdAt: string;
  updatedAt: string;
}

export const variationUpdateSchema = z
  .object({
    sku: skuSchema,
    regularPrice: paiseSchema,
    salePrice: paiseSchema.nullable(),
    stockQuantity: stockSchema,
  })
  .partial()
  .strict()
  .refine((v) => Object.keys(v).length > 0, "Nothing to update");
export type VariationUpdateInput = z.input<typeof variationUpdateSchema>;

export interface GenerateVariationsResult {
  created: number;
  kept: number;
  removed: number;
  variations: Variation[];
}
