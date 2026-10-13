import { Router } from "express";
import { z } from "zod";
import { mockStore } from "../../lib/woo";
import { handle, send } from "../../lib/http";
import { parseBody, parseParams } from "../../middleware/validate";

const htmlEscape = (value: string | number | null | undefined) =>
  String(value ?? "").replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character]!);

const price = (regular: string, sale: string) => sale ? `<s>₹${htmlEscape(regular)}</s> <strong>₹${htmlEscape(sale)}</strong>` : `<strong>₹${htmlEscape(regular)}</strong>`;

const productCard = (product: ReturnType<NonNullable<typeof mockStore>["snapshot"]>["products"][number]) => {
  const variations = product.variationItems.length
    ? `<table><thead><tr><th>Options</th><th>SKU</th><th>Price</th><th>Stock</th></tr></thead><tbody>${product.variationItems.map((variation) => `<tr><td>${htmlEscape(variation.attributes.map((attribute) => `${attribute.name}: ${attribute.option}`).join(", "))}</td><td>${htmlEscape(variation.sku)}</td><td>${price(variation.regular_price, variation.sale_price)}</td><td>${htmlEscape(variation.stock_quantity ?? 0)}</td></tr>`).join("")}</tbody></table>`
    : "";
  return `<article><img src="${htmlEscape(product.images[0]?.src)}" alt="${htmlEscape(product.name)}" onerror="this.style.display='none'"><div><h2><a href="/mock-store/products/${product.id}">${htmlEscape(product.name)}</a></h2><p class="sku">${htmlEscape(product.sku)}</p><p>${price(product.regular_price, product.sale_price)}</p><p>Stock: ${htmlEscape(product.stock_quantity ?? 0)}</p>${variations}</div></article>`;
};

const page = (title: string, products: ReturnType<NonNullable<typeof mockStore>["snapshot"]>["products"]) => `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="refresh" content="5"><title>${htmlEscape(title)}</title><style>body{margin:0;background:#FAFAF9;color:#222;font-family:system-ui,sans-serif}main{max-width:1000px;margin:auto;padding:32px}article{background:#fff;border:1px solid #e7e5e4;border-radius:12px;padding:18px;margin:14px 0;display:flex;gap:18px}img{width:130px;height:130px;object-fit:cover;border-radius:8px;background:#f5f5f4}h1,h2,p{margin:0 0 8px}h2 a{color:inherit;text-decoration:none}.sku{font-family:ui-monospace;color:#78716c}table{border-collapse:collapse;width:100%;margin-top:12px}th,td{text-align:left;padding:7px;border-top:1px solid #e7e5e4;font-size:14px}s{color:#78716c;margin-right:5px}</style></head><body><main><h1>${htmlEscape(title)}</h1><p>Live mock store · refreshes every 5 seconds</p>${products.length ? products.map(productCard).join("") : "<p>No products yet.</p>"}</main></body></html>`;

export const mockStorePageRoutes = Router();
export const mockStoreApiRoutes = Router();

mockStorePageRoutes.get("/", (_req, res) => {
  const products = mockStore?.snapshot().products ?? [];
  res.type("html").send(page("Catalyst Mock Store", products));
});

mockStorePageRoutes.get("/products/:id", (req, res) => {
  const product = mockStore?.snapshot().products.find((item) => item.id === Number(req.params.id));
  if (!product) {
    res.status(404).type("html").send(page("Product not found", []));
    return;
  }
  res.type("html").send(page(product.name, [product]));
});

mockStoreApiRoutes.post(
  "/offline",
  handle((req, res) => {
    const { offline } = parseBody(z.object({ offline: z.boolean() }).strict(), req);
    mockStore?.setOffline(offline);
    send(res, { offline });
  }),
);

mockStoreApiRoutes.delete(
  "/products/:id",
  handle((req, res) => {
    const { id } = parseParams(z.object({ id: z.coerce.number().int().positive() }), req);
    send(res, { removed: mockStore?.removeDirectly(id) ?? false });
  }),
);
