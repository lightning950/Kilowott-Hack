import { decimalToPaise, paiseToDecimal, type Product, type ProductFields } from "@pim/shared";
import type { WooProduct, WooProductPayload, WooVariationPayload } from "../../lib/woo";
import type { VariationRecord } from "../variations/repo";

export const toWooProduct = (
  product: Product,
  categoryId: number | null,
  opts: { withImages?: boolean } = {},
): WooProductPayload => ({
  name: product.name,
  type: product.type,
  status: "publish",
  sku: product.sku,
  description: product.description,
  short_description: product.shortDescription,
  ...(product.type === "simple"
    ? {
        regular_price: paiseToDecimal(product.regularPrice),
        sale_price: product.salePrice === null ? "" : paiseToDecimal(product.salePrice),
        manage_stock: true,
        stock_quantity: product.stockQuantity,
        attributes: [],
      }
    : {
        manage_stock: false,
        attributes: product.attributes.map((attribute, position) => ({
          name: attribute.name,
          options: attribute.options,
          position,
          visible: true,
          variation: true,
        })),
      }),
  categories: categoryId ? [{ id: categoryId }] : [],
  images: opts.withImages !== false && product.imageUrl ? [{ src: product.imageUrl }] : [],
});

export const toWooVariation = (variation: VariationRecord): WooVariationPayload => ({
  sku: variation.sku,
  regular_price: paiseToDecimal(variation.regularPrice),
  sale_price: variation.salePrice === null ? "" : paiseToDecimal(variation.salePrice),
  manage_stock: true,
  stock_quantity: variation.stockQuantity,
  attributes: Object.entries(variation.attributes).map(([name, option]) => ({ name, option })),
});

/** Maps store values into editable PIM fields. Import applies SKU normalization separately. */
export const fromWooProduct = (product: WooProduct): ProductFields => {
  const regularPrice = decimalToPaise(product.regular_price) ?? 0;
  const candidateSale = decimalToPaise(product.sale_price);
  return {
    sku: product.sku,
    name: product.name.trim().length >= 2 ? product.name.trim() : `Product ${product.id}`,
    description: product.description,
    shortDescription: product.short_description,
    type: product.type === "variable" ? "variable" : "simple",
    regularPrice,
    salePrice: candidateSale !== null && candidateSale < regularPrice ? candidateSale : null,
    stockQuantity: product.stock_quantity ?? 0,
    category: product.categories[0]?.name ?? "",
    imageUrl: product.images[0]?.src ?? null,
    attributeSetId: null,
    attributes:
      product.type === "variable"
        ? product.attributes.filter((attribute) => attribute.variation).map(({ name, options }) => ({ name, options }))
        : [],
  };
};
