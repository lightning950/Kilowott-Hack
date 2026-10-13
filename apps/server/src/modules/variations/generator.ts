import { SKU_PATTERN, type AttributeDef } from "@pim/shared";

export type Combo = Record<string, string>;

/** Order- and case-insensitive identity of a combination: "color=black|size=m". */
export const comboKey = (combo: Combo): string =>
  Object.entries(combo)
    .map(([k, v]) => `${k.trim().toLowerCase()}=${v.trim().toLowerCase()}`)
    .sort()
    .join("|");

/** Cartesian product of attribute options, in the attributes' own order. */
export const combinations = (attributes: AttributeDef[]): Combo[] =>
  attributes.length === 0
    ? []
    : attributes.reduce<Combo[]>(
        (acc, attr) => acc.flatMap((combo) => attr.options.map((opt) => ({ ...combo, [attr.name]: opt }))),
        [{}],
      );

export const countCombinations = (attributes: AttributeDef[]): number =>
  attributes.length === 0 ? 0 : attributes.reduce((n, a) => n * a.options.length, 1);

/** "TSHIRT" + { Size: "XL", Color: "Navy Blue" } → "TSHIRT-XL-NAVYBLUE", always within the SKU rules. */
export const variationSku = (parentSku: string, combo: Combo): string => {
  const parts = Object.values(combo).map((v) => v.toUpperCase().replace(/[^A-Z0-9]/g, "") || "X");
  let sku = [parentSku, ...parts].join("-");
  if (sku.length > 40) sku = sku.slice(0, 40).replace(/-+$/, "");
  return SKU_PATTERN.test(sku) ? sku : `${parentSku.slice(0, 30)}-VAR`;
};

/** Makes `base` unique against `taken` (case-insensitive) by suffixing -2, -3, … within 40 chars. */
export const uniqueSku = (base: string, isTaken: (sku: string) => boolean): string => {
  if (!isTaken(base)) return base;
  for (let n = 2; n < 1000; n++) {
    const suffix = `-${n}`;
    const candidate = `${base.slice(0, 40 - suffix.length).replace(/-+$/, "")}${suffix}`;
    if (!isTaken(candidate)) return candidate;
  }
  throw new Error(`Could not find a free SKU for ${base}`);
};

/**
 * True when the stored variations are exactly the combinations of the current attributes.
 * Becomes false after the user edits attributes and before they regenerate.
 */
export const variationsMatchAttributes = (attributes: AttributeDef[], variations: { attributes: Combo }[]): boolean => {
  const expected = new Set(combinations(attributes).map(comboKey));
  if (expected.size === 0 || expected.size !== variations.length) return false;
  const actual = new Set(variations.map((v) => comboKey(v.attributes)));
  if (actual.size !== variations.length) return false;
  for (const key of actual) if (!expected.has(key)) return false;
  return true;
};
