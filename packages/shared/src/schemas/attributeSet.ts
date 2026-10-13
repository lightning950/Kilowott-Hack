import { z } from "zod";
import { MAX_ATTRIBUTES, MAX_OPTIONS_PER_ATTRIBUTE, attributeNameSchema, attributeOptionSchema } from "./product";

const hasDuplicates = (values: string[]) =>
  new Set(values.map((v) => v.toLowerCase())).size !== values.length;

/**
 * A reusable template, e.g. "Clothing" = Size + Color.
 * Picking a set on a product pre-fills its attributes with these defaults.
 */
export const attributeSetFieldsSchema = z.object({
  name: z.string().trim().min(2, "Name is too short").max(60, "Name is too long"),
  attributes: z
    .array(
      z.object({
        name: attributeNameSchema,
        defaultOptions: z
          .array(attributeOptionSchema)
          .max(MAX_OPTIONS_PER_ATTRIBUTE)
          .refine((o) => !hasDuplicates(o), "Options must be unique")
          .default([]),
      }),
    )
    .min(1, "Add at least one attribute")
    .max(MAX_ATTRIBUTES, `At most ${MAX_ATTRIBUTES} attributes`)
    .refine((a) => !hasDuplicates(a.map((x) => x.name)), "Attribute names must be unique"),
});

export const attributeSetCreateSchema = attributeSetFieldsSchema.strict();
export const attributeSetUpdateSchema = attributeSetFieldsSchema.partial().strict();

export type AttributeSetCreateInput = z.input<typeof attributeSetCreateSchema>;
export type AttributeSetUpdateInput = z.input<typeof attributeSetUpdateSchema>;

export interface AttributeSet {
  id: number;
  name: string;
  attributes: { name: string; defaultOptions: string[] }[];
  /** How many products use this set. */
  productCount: number;
  createdAt: string;
  updatedAt: string;
}
