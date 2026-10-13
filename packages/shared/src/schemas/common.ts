import { z } from "zod";

/** Positive integer id, coerced from route params / query strings. */
export const idSchema = z.coerce.number().int().positive();

export const idParamsSchema = z.object({ id: idSchema });

/** SKUs are stored uppercase. WooCommerce requires them to be globally unique. */
export const SKU_PATTERN = /^[A-Z0-9-]{3,40}$/;

export const skuSchema = z
  .string({ required_error: "SKU is required" })
  .trim()
  .toUpperCase()
  .regex(SKU_PATTERN, "SKU must be 3–40 characters: letters, numbers and dashes only");

/** Money is always an integer number of paise (₹1 = 100). Never floats. */
export const paiseSchema = z
  .number({ invalid_type_error: "Must be a number" })
  .int("Must be a whole number of paise")
  .min(0, "Cannot be negative")
  .max(1_000_000_000, "Too large");

export const stockSchema = z
  .number({ invalid_type_error: "Must be a number" })
  .int("Must be a whole number")
  .min(0, "Cannot be negative")
  .max(1_000_000, "Too large");

/** Empty strings from forms become null so "no image" is unambiguous. */
export const optionalUrlSchema = z.preprocess(
  (v) => (typeof v === "string" && v.trim() === "" ? null : v),
  z
    .string()
    .trim()
    .url("Must be a valid URL")
    .refine((v) => /^https?:\/\//i.test(v), "Must start with http:// or https://")
    .nullable(),
);

export const paginationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});

export type PaginationQuery = z.infer<typeof paginationQuerySchema>;

export interface Paginated<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}
