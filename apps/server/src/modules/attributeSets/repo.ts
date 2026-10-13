import type { AttributeSet } from "@pim/shared";
import { db, now } from "../../db/client";

interface AttributeSetRow {
  id: number;
  name: string;
  attributes: string;
  product_count: number;
  created_at: string;
  updated_at: string;
}

const toAttributeSet = (r: AttributeSetRow): AttributeSet => ({
  id: r.id,
  name: r.name,
  attributes: JSON.parse(r.attributes) as AttributeSet["attributes"],
  productCount: r.product_count,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});

const SELECT = `
  SELECT s.*, (SELECT COUNT(*) FROM products p WHERE p.attribute_set_id = s.id) AS product_count
  FROM attribute_sets s`;

export const attributeSetRepo = {
  list(): AttributeSet[] {
    return (db.prepare(`${SELECT} ORDER BY s.name COLLATE NOCASE`).all() as AttributeSetRow[]).map(toAttributeSet);
  },

  findById(id: number): AttributeSet | undefined {
    const row = db.prepare(`${SELECT} WHERE s.id = ?`).get(id) as AttributeSetRow | undefined;
    return row && toAttributeSet(row);
  },

  findByName(name: string): AttributeSet | undefined {
    const row = db.prepare(`${SELECT} WHERE s.name = ? COLLATE NOCASE`).get(name) as AttributeSetRow | undefined;
    return row && toAttributeSet(row);
  },

  insert(data: { name: string; attributes: AttributeSet["attributes"] }): AttributeSet {
    const ts = now();
    const { lastInsertRowid } = db
      .prepare("INSERT INTO attribute_sets (name, attributes, created_at, updated_at) VALUES (?, ?, ?, ?)")
      .run(data.name, JSON.stringify(data.attributes), ts, ts);
    return this.findById(Number(lastInsertRowid))!;
  },

  update(id: number, data: { name?: string; attributes?: AttributeSet["attributes"] }): AttributeSet {
    const current = this.findById(id)!;
    db.prepare("UPDATE attribute_sets SET name = ?, attributes = ?, updated_at = ? WHERE id = ?").run(
      data.name ?? current.name,
      JSON.stringify(data.attributes ?? current.attributes),
      now(),
      id,
    );
    return this.findById(id)!;
  },

  delete(id: number) {
    db.prepare("DELETE FROM attribute_sets WHERE id = ?").run(id);
  },
};
