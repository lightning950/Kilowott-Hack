import { PRODUCT_TYPES, SYNC_STATUSES, type Product, type ProductType, type SyncStatus } from "@pim/shared";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ChevronLeft, ChevronRight, Download, Package, Plus, RefreshCw, Search, X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input, Select } from "@/components/ui/Field";
import { EmptyState, ErrorBanner, Kbd } from "@/components/ui/Misc";
import { PageHeader } from "@/components/layout/PageHeader";
import { useDebounced } from "@/hooks/useDebounced";
import { useHotkey } from "@/hooks/useHotkey";
import { useProducts } from "@/hooks/useProducts";
import { useBulkSync, useImport } from "@/hooks/useSync";
import { useStats } from "@/hooks/useSystem";
import { errorMessage } from "@/lib/api";
import { cn } from "@/lib/cn";
import { pluralize } from "@/lib/format";
import { DeleteProductDialog } from "./DeleteProductDialog";
import { ProductTable } from "./ProductTable";
import { STATUS_META } from "./StatusBadge";

const PAGE_SIZE = 25;
const FILTER_STATUSES = SYNC_STATUSES.filter((s) => s !== "syncing");

export const ProductsPage = () => {
  const [params, setParams] = useSearchParams();
  const status = (params.get("status") as SyncStatus | null) ?? undefined;
  const type = (params.get("type") as ProductType | null) ?? undefined;
  const page = Math.max(1, Number(params.get("page")) || 1);
  const [search, setSearch] = useState(params.get("q") ?? "");
  const debounced = useDebounced(search.trim(), 250);
  const searchRef = useRef<HTMLInputElement>(null);

  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [toDelete, setToDelete] = useState<Product | null>(null);

  const update = (patch: Record<string, string | undefined>) => {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(patch)) (v ? next.set(k, v) : next.delete(k));
    if (!("page" in patch)) next.delete("page");
    setParams(next, { replace: true });
  };

  // Keep the URL in step with the debounced search box.
  useEffect(() => {
    if ((params.get("q") ?? "") !== debounced) update({ q: debounced || undefined });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debounced]);

  useHotkey("/", () => searchRef.current?.focus());

  const query = { search: debounced || undefined, status, type, page, pageSize: PAGE_SIZE };
  const products = useProducts(query);
  const stats = useStats();
  const bulkSync = useBulkSync();
  const importer = useImport();

  const items = products.data?.items ?? [];
  const total = products.data?.total ?? 0;
  const totalPages = products.data?.totalPages ?? 1;
  const filtered = !!(debounced || status || type);
  const pending = stats.data?.pending ?? 0;

  // Page past the end (e.g. after deletes) → snap back to the last page.
  useEffect(() => {
    if (products.data && page > products.data.totalPages) update({ page: String(products.data.totalPages) });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [products.data, page]);

  const toggle = (id: number) =>
    setSelected((s) => {
      const n = new Set(s);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  const toggleAll = (ids: number[], checked: boolean) =>
    setSelected((s) => {
      const n = new Set(s);
      ids.forEach((id) => (checked ? n.add(id) : n.delete(id)));
      return n;
    });

  return (
    <>
      <PageHeader
        crumbs={[{ label: "Products" }]}
        actions={
          <>
            <Button icon={<Download className="h-3.5 w-3.5" />} loading={importer.isPending} onClick={() => importer.mutate()}>
              Import from store
            </Button>
            <Button
              icon={<RefreshCw className="h-3.5 w-3.5" />}
              loading={bulkSync.isPending && !selected.size}
              disabled={pending === 0}
              onClick={() => bulkSync.mutate(undefined)}
            >
              Sync pending{pending > 0 && <span className="num rounded bg-subtle px-1 text-2xs text-muted">{pending}</span>}
            </Button>
            <Link to="/products/new">
              <Button variant="primary" icon={<Plus className="h-3.5 w-3.5" />}>
                New product <Kbd className="border-accent-fg/20 bg-accent-fg/10 text-accent-fg/80">N</Kbd>
              </Button>
            </Link>
          </>
        }
      />

      <div className="flex flex-1 flex-col gap-4 p-6">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative w-72">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-faint" />
            <Input
              ref={searchRef}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search name or SKU"
              aria-label="Search products"
              className="pl-8 pr-8"
            />
            {search ? (
              <button onClick={() => setSearch("")} className="absolute right-2 top-1/2 -translate-y-1/2 text-faint hover:text-fg" aria-label="Clear search">
                <X className="h-3.5 w-3.5" />
              </button>
            ) : (
              <Kbd className="absolute right-2 top-1/2 -translate-y-1/2">/</Kbd>
            )}
          </div>

          <div className="flex items-center gap-1 rounded border border-border bg-surface p-0.5" role="group" aria-label="Filter by status">
            <Chip active={!status} onClick={() => update({ status: undefined })}>
              All <Count n={stats.data?.total} />
            </Chip>
            {FILTER_STATUSES.map((s) => (
              <Chip key={s} active={status === s} onClick={() => update({ status: status === s ? undefined : s })}>
                <span className={cn("h-1.5 w-1.5 rounded-full", STATUS_META[s].dot)} />
                {STATUS_META[s].label}
                <Count n={stats.data?.byStatus[s]} />
              </Chip>
            ))}
          </div>

          <Select
            value={type ?? ""}
            onChange={(e) => update({ type: e.target.value || undefined })}
            className="w-36"
            aria-label="Filter by type"
          >
            <option value="">All types</option>
            {PRODUCT_TYPES.map((t) => (
              <option key={t} value={t}>
                {t === "simple" ? "Simple" : "Variable"}
              </option>
            ))}
          </Select>
        </div>

        {products.isError && (
          <ErrorBanner
            title="Couldn't load products"
            message={errorMessage(products.error)}
            action={<Button size="sm" onClick={() => products.refetch()}>Retry</Button>}
          />
        )}

        <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-border bg-surface">
          {selected.size > 0 && (
            <div className="flex h-11 items-center justify-between border-b border-border bg-accent-tint/40 px-4 animate-fade-in">
              <span className="text-sm">
                <span className="font-medium">{selected.size}</span> selected
              </span>
              <div className="flex gap-2">
                <Button size="sm" onClick={() => setSelected(new Set())}>
                  Clear
                </Button>
                <Button
                  size="sm"
                  variant="primary"
                  loading={bulkSync.isPending}
                  icon={<RefreshCw className="h-3.5 w-3.5" />}
                  onClick={() => bulkSync.mutate([...selected], { onSuccess: () => setSelected(new Set()) })}
                >
                  Sync {pluralize(selected.size, "product")}
                </Button>
              </div>
            </div>
          )}

          {!products.isLoading && items.length === 0 && !products.isError ? (
            filtered ? (
              <EmptyState
                icon={<Search className="h-6 w-6" />}
                title="No products match these filters"
                description="Try a different search or clear the filters."
                action={<Button onClick={() => { setSearch(""); setParams({}, { replace: true }); }}>Clear filters</Button>}
              />
            ) : (
              <EmptyState
                icon={<Package className="h-6 w-6" />}
                title="No products yet"
                description="Create your first product, or import the catalog that's already in your WooCommerce store."
                action={
                  <div className="flex gap-2">
                    <Button loading={importer.isPending} onClick={() => importer.mutate()}>Import from store</Button>
                    <Link to="/products/new"><Button variant="primary">New product</Button></Link>
                  </div>
                }
              />
            )
          ) : (
            <ProductTable
              products={items}
              loading={products.isLoading}
              selected={selected}
              onToggle={toggle}
              onToggleAll={toggleAll}
              onDelete={setToDelete}
            />
          )}

          {total > 0 && (
            <footer className="mt-auto flex h-11 items-center justify-between border-t border-border px-4 text-xs text-muted">
              <span className="num">
                {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, total)} of {total}
              </span>
              <div className="flex items-center gap-1">
                <Button size="icon" variant="ghost" className="h-7 w-7" disabled={page <= 1} onClick={() => update({ page: String(page - 1) })} aria-label="Previous page">
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <span className="num px-1">
                  {page} / {totalPages}
                </span>
                <Button size="icon" variant="ghost" className="h-7 w-7" disabled={page >= totalPages} onClick={() => update({ page: String(page + 1) })} aria-label="Next page">
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </footer>
          )}
        </div>
      </div>

      <DeleteProductDialog
        product={toDelete}
        onClose={() => setToDelete(null)}
        onDeleted={() => setSelected((s) => { const n = new Set(s); if (toDelete) n.delete(toDelete.id); return n; })}
      />
    </>
  );
};

const Chip = ({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) => (
  <button
    onClick={onClick}
    aria-pressed={active}
    className={cn(
      "flex h-7 items-center gap-1.5 rounded-[4px] px-2.5 text-xs transition-colors",
      active ? "bg-subtle font-medium text-fg shadow-[inset_0_0_0_1px_rgb(var(--border))]" : "text-muted hover:text-fg",
    )}
  >
    {children}
  </button>
);

const Count = ({ n }: { n: number | undefined }) =>
  n === undefined ? null : <span className="num text-2xs text-faint">{n}</span>;
