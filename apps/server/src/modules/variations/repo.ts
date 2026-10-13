import type { Variation } from "@pim/shared";
import { db, now } from "../../db/client";

interface VariationRow {
  id: number;
  product_id: number;
  sku: string;
  attributes: string;
  combo_key: string;
  regular_price: number;
  sale_price: number | null;
  stock_quantity: number;
  woo_variation_id: number | null;
  created_at: string;
  updated_at: string;
}

export type VariationRecord = Variation & { comboKey: string };

const toVariation = (r: VariationRow): VariationRecord => ({
  id: r.id,
  productId: r.product_id,
  sku: r.sku,
  attributes: JSON.parse(r.attributes) as Record<string, string>,
  comboKey: r.combo_key,
  regularPrice: r.regular_price,
  salePrice: r.sale_price,
  stockQuantity: r.stock_quantity,
  wooVariationId: r.woo_variation_id,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});

/** Strips internal fields before a variation leaves the API. */
export const toPublicVariation = ({ comboKey: _comboKey, ...v }: VariationRecord): Variation => v;

export interface NewVariation {
  productId: number;
  sku: string;
  attributes: Record<string, string>;
  comboKey: string;
  regularPrice: number;
  salePrice: number | null;
  stockQuantity: number;
  wooVariationId?: number | null;
}

export const variationRepo = {
  listByProduct(productId: number): VariationRecord[] {
    return (db.prepare("SELECT * FROM variations WHERE product_id = ? ORDER BY id").all(productId) as VariationRow[]).map(
      toVariation,
    );
  },

  findById(id: number): VariationRecord | undefined {
    const row = db.prepare("SELECT * FROM variations WHERE id = ?").get(id) as VariationRow | undefined;
    return row && toVariation(row);
  },

  insert(v: NewVariation): VariationRecord {
    const ts = now();
    const { lastInsertRowid } = db
      .prepare(
        `INSERT INTO variations
           (product_id, sku, attributes, combo_key, regular_price, sale_price, stock_quantity, woo_variation_id, created_at, updated_at)
         VALUES (@productId, @sku, @attributes, @comboKey, @regularPrice, @salePrice, @stockQuantity, @wooVariationId, @ts, @ts)`,
      )
      .run({ ...v, attributes: JSON.stringify(v.attributes), wooVariationId: v.wooVariationId ?? null, ts });
    return this.findById(Number(lastInsertRowid))!;
  },

  update(
    id: number,
    patch: Partial<Pick<Variation, "sku" | "regularPrice" | "salePrice" | "stockQuantity">>,
  ): VariationRecord {
    const columns = { sku: "sku", regularPrice: "regular_price", salePrice: "sale_price", stockQuantity: "stock_quantity" };
    const sets: string[] = [];
    const args: Record<string, unknown> = { id, ts: now() };
    for (const [k, col] of Object.entries(columns)) {
      const value = patch[k as keyof typeof patch];
      if (value === undefined) continue;
      sets.push(`${col} = @${k}`);
      args[k] = value;
    }
    if (sets.length) db.prepare(`UPDATE variations SET ${sets.join(", ")}, updated_at = @ts WHERE id = @id`).run(args);
    return this.findById(id)!;
  },

  /** Store bookkeeping only; does not count as an edit. */
  setWooId(id: number, wooVariationId: number | null) {
    db.prepare("UPDATE variations SET woo_variation_id = ? WHERE id = ?").run(wooVariationId, id);
  },

  clearWooIds(productId: number) {
    db.prepare("UPDATE variations SET woo_variation_id = NULL WHERE product_id = ?").run(productId);
  },

  deleteMany(ids: number[]) {
    if (!ids.length) return;
    db.prepare(`DELETE FROM variations WHERE id IN (${ids.map(() => "?").join(",")})`).run(...ids);
  },

  deleteByProduct(productId: number) {
    db.prepare("DELETE FROM variations WHERE product_id = ?").run(productId);
  },

  count(): number {
    return (db.prepare("SELECT COUNT(*) AS n FROM variations").get() as { n: number }).n;
  },
};
