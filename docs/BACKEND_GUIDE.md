# Backend guide

The UI, the shared contracts and about half the server are done. This is what's left, in the order that gets the UI working fastest. Each step names the file, what it must export, and the rules. Paste a step into Copilot as-is.

**Golden rules (tell Copilot these every time):**
- Don't rename anything or change `packages/shared`. Types come from `@pim/shared`.
- `routes → service → repo`. Routes only parse input with `parseBody/parseQuery/parseParams` (from `middleware/validate.ts`) and call a service. Wrap handlers in `handle()` and respond with `send(res, data, status?)` (from `lib/http.ts`).
- Throw `AppError` (from `lib/errors.ts`) for every expected failure.
- Only `modules/sync/*` and `modules/import/*` import `lib/woo`.
- Money is integer paise; convert to `"499.00"` only in `sync/mapper.ts` using `paiseToDecimal` from `@pim/shared`.

## Already done (read these, don't rewrite them)
| File | What it gives you |
|---|---|
| `config/env.ts` | `env` (validated), `ROOT_DIR` |
| `db/client.ts`, `db/migrate.ts` | `db`, `transaction(fn)`, `now()`, `runMigrations()` |
| `lib/errors.ts`, `lib/http.ts`, `lib/logger.ts` | `AppError`, `notFound`, `skuTaken`, `handle`, `send`, `logger` |
| `lib/woo/*` | `woo` (the store client), `mockStore` (null in real mode), `checkWooConnection()`, `WooError`, `isWooError`, `WOO_CODES`, all Woo types. Real and mock clients are complete. |
| `middleware/*` | `parseBody/Query/Params`, `toFieldErrors`, `errorHandler`, `notFoundHandler` |
| `modules/products/repo.ts`, `service.ts` | `productRepo`, `skuOwner`, `productService` (list, getDetail, create, update, remove) |
| `modules/variations/repo.ts`, `generator.ts` | `variationRepo`, `toPublicVariation`, `comboKey`, `combinations`, `countCombinations`, `variationSku`, `uniqueSku`, `variationsMatchAttributes` |
| `modules/attributeSets/*` | complete (repo, service, routes → `attributeSetRoutes`) |
| `modules/logs/*` | complete (`logRepo`, `logRoutes`) |

---

## Step 1 — Boot the server (≈10 min, unblocks the whole UI)

**`modules/sync/locks.ts`**
```
export const productLockKey = (id: number) => `product:${id}`;
export const IMPORT_LOCK = "import";
export const isLocked(key): boolean
export const tryLock(key): boolean            // false if already held
export const unlock(key): void
```
In-memory `Set<string>`.

**`modules/sync/service.ts`** — for now only:
```
export const syncService = {
  storeUrl: (wooId: number) => woo.productUrl(wooId),
  // Step 3 fills in: syncProduct, syncBulk, deleteRemote
  deleteRemote: async (_p: Product) => { throw new AppError("NOT_IMPLEMENTED", 501, "Store delete lands later"); },
};
```
(`NOT_IMPLEMENTED` is already in the shared error codes.)

**`modules/products/routes.ts`** → `export const productRoutes = Router()`
- `GET /` → `productService.list(parseQuery(productListQuerySchema, req))`
- `POST /` → `productService.create(parseBody(productCreateSchema, req))`, status 201
- `GET /:id` → `productService.getDetail(id)`
- `PATCH /:id` → `productService.update(id, parseBody(productUpdateSchema, req), parseQuery(productUpdateQuerySchema, req))`
- `DELETE /:id` → `await productService.remove(id, parseQuery(productDeleteQuerySchema, req).scope)`
- `POST /:id/variations/generate` → `variationService.generate(id)` (Step 2)

**`modules/system/routes.ts`** → `export const systemRoutes = Router()`
- `GET /health` → always 200: `{ status: woo.state === "connected" ? "ok" : "degraded", version: "1.0.0", database: "ok", woo: await checkWooConnection() }`
- `GET /stats` → `Stats` from `productRepo.countsByStatus()`, `productRepo.countsByType()`, `variationRepo.count()`, `pending = draft + out_of_sync + failed`, `logRepo.lastSuccessAt()`, `logRepo.countsSince(<24h ago ISO>)`

**`app.ts`** → `export const createApp()`
`express.json({ limit: "1mb" })`, `cors({ origin: env.CORS_ORIGIN })`, mount: `/api` systemRoutes, `/api/products`, `/api/variations`, `/api/attribute-sets`, `/api/sync`, `/api/import`, `/api/logs`; if `mockStore` mount the mock store routes (Step 5); then `notFoundHandler`, `errorHandler` last.

**`index.ts`**
`runMigrations()` → `productRepo.resetInterruptedSyncs()` (log the count if > 0) → `createApp().listen(env.PORT)` → log `PIM server on http://localhost:${env.PORT} (store: ${woo.mode})`.

Check: `npm run dev`, open the UI, create a simple product, see it in the list.

## Step 2 — Variations (≈15 min)

**`modules/variations/service.ts`** → `variationService`
- `generate(productId): GenerateVariationsResult`
  - 404 if missing; 409 `SYNC_IN_PROGRESS` if locked; 422 `NOT_SYNCABLE` if not variable or no attributes.
  - `countCombinations > MAX_VARIATIONS` → 422 `TOO_MANY_VARIATIONS`.
  - In one `transaction`: key existing rows by `comboKey`; keep matches (price/stock/woo ids untouched), `deleteMany` removed combos, insert new ones with `sku = uniqueSku(variationSku(parent.sku, combo), s => !!skuOwner(s))`, `regularPrice = parent.regularPrice`, stock 0. If anything changed → `productRepo.markEdited(id)`.
  - Return `{ created, kept, removed, variations: listByProduct(id).map(toPublicVariation) }`.
- `update(id, input)`: 404; parent locked → 409; merge with current and reject `salePrice >= regularPrice` (400, `fieldErrors.salePrice`); new SKU taken by anyone else → `skuTaken`. Save, then `productRepo.markEdited(parentId)`. Return `toPublicVariation(...)`.

**`modules/variations/routes.ts`** → `variationRoutes`: `PATCH /:id` with `variationUpdateSchema`.

Check: make a variable product with Size × Color, click Generate, edit prices in the grid.

## Step 3 — Sync (≈30 min, the core)

**`modules/sync/mapper.ts`**
- `toWooProduct(p: ProductDetail | Product, categoryId: number | null): WooProductPayload`
  simple → `regular_price: paiseToDecimal(p.regularPrice)`, `sale_price: p.salePrice === null ? "" : paiseToDecimal(...)`, `manage_stock: true`, `stock_quantity`.
  variable → `manage_stock: false`, attributes `{ name, options, position, visible: true, variation: true }`.
  Always `status: "publish"`, `images: p.imageUrl ? [{ src }] : []`, `categories: categoryId ? [{ id }] : []`.
- `toWooVariation(v): WooVariationPayload` → `attributes: Object.entries(v.attributes).map(([name, option]) => ({ name, option }))`.

**`syncService.syncProduct(id): Promise<SyncResult>`**
1. `tryLock(productLockKey(id))` or 409 `SYNC_IN_PROGRESS`. Load product + variations (404).
2. Variable with no variations, or `!variationsMatchAttributes(...)` → 422 `VARIATIONS_OUTDATED` (release lock).
3. `setSyncState(id, { syncStatus: "syncing" })`, start timer, `warnings: string[] = []`.
4. `categoryId = p.category ? await woo.ensureCategory(p.category) : null`.
5. Resolve the store product:
   - has `wooId` → `updateProduct`; on `isWooError(e, "WOO_NOT_FOUND")` → `variationRepo.clearWooIds(id)`, warn "Missing in store, recreated", fall through as if no wooId.
   - no wooId → `findProductBySku(sku)`; found → adopt its id + update; else `createProduct`. If create fails with `meta.wooCode === WOO_CODES.duplicateSku && meta.resourceId` → adopt + update.
   - If any of these fail with `meta.wooCode === WOO_CODES.imageError` → retry once with `images: []`, warn "Image could not be downloaded; synced without it".
6. Variable: `remote = await woo.listVariations(wooId)`; for each local: valid remote id → update; else remote with same SKU → adopt → update; else create. Remote ids not matched → delete. Batch ≤ 100 items per call. Update items whose error code contains `invalid_id` → clear id and create in a second batch. Save returned ids by SKU with `variationRepo.setWooId`. Any other item error → throw `WooError("WOO_REJECTED", "<sku>: <message>")`.
7. Success → `setSyncState(id, { syncStatus: "synced", wooId, lastError: null, lastSyncedAt: now() })`, `logRepo.insert({ action: hadWooId ? "update" : "create", status: "success", message: \`Woo #${wooId}\`, warnings, durationMs })`, return `SyncResult`.
8. Failure → `{ syncStatus: "failed", lastError: message }`, log failed, return result with status "failed".
9. `finally` → `unlock`.
Route `POST /sync/:productId`: if result failed throw `AppError(code, code === "WOO_TIMEOUT" ? 504 : 502, message)` so the UI toasts it.

**`syncService.syncBulk(ids?)`** → ids default `productRepo.idsWithStatus(PENDING_STATUSES)`, else `existingIds(ids)`. Concurrency 2. Locked → `skipped`. Never throws for a single failure. Return `BulkSyncResult`. Route: `POST /sync/bulk` with `bulkSyncBodySchema`. **Mount `/bulk` before `/:productId`.**

**`syncService.deleteRemote(p)`** → `woo.deleteProduct(p.wooId)`; `WOO_NOT_FOUND` counts as success; other errors rethrow as `AppError(code, 502, msg)`; log action "delete".

Check (mock mode): sync a product → green; edit price → amber "Out of sync"; sync again → green. Set image URL to `https://img.invalid/x.jpg` → syncs with a warning.

## Step 4 — Import (≈15 min, optional)
`modules/import/service.ts` → `importService.run(): Promise<ImportResult>` with `IMPORT_LOCK` (409 `IMPORT_IN_PROGRESS`). Page `woo.listProducts(page, 100)`. Skip types other than simple/variable. SKU: uppercase, invalid chars → `-`, fallback `WOO-<id>`. Match local by `findByWooId` then `findBySku`. Local `out_of_sync`/`failed`/locked → `conflicts`. Otherwise insert/update fields (`decimalToPaise`, first category name, first image src, attributes with `variation: true`) and set synced. Variable: `listVariations` and upsert by woo id then SKU (`comboKey` from attributes). One summary log row (`action: "import"`). Route: `POST /import`.

## Step 5 — Mock store helpers (≈5 min, great for the demo)
Only when `mockStore` exists:
- `GET /mock-store` → simple HTML list of `mockStore.snapshot().products` (name, SKU, price, variations). This is your "refresh the store and it's live" moment.
- `GET /mock-store/products/:id` → one product page.
- `POST /api/mock-store/offline` `{ offline: boolean }` → `mockStore.setOffline()`; demo "store down → failed → retry".
- `DELETE /api/mock-store/products/:id` → `mockStore.removeDirectly()`; demo "deleted in store → recreated on next sync".

## Step 6 — Seed (≈10 min)
`db/seed.ts`: delete all rows (logs, variations, products, attribute_sets), `mockStore?.reset()`, then create through the services (so rules apply): sets Clothing (Size: S M L XL, Color: Black White Navy), Footwear (Size UK: 7 8 9 10, Color), Home; ~8 simple products and 2 variable (generate their variations). Images: `https://picsum.photos/seed/<slug>/800/800`. Run with `npm run db:seed`.

## Switching to a real store
In `.env`: `WOO_MODE=real`, `WOO_URL`, `WOO_KEY`, `WOO_SECRET`. The sidebar dot tells you if the keys or URL are wrong.
