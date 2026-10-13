import type { Product } from "@pim/shared";
import { useNavigate } from "react-router-dom";
import { ImageOff, Loader2, MoreHorizontal, RefreshCw } from "lucide-react";
import { useState, type MouseEvent } from "react";
import { Button } from "@/components/ui/Button";
import { Checkbox } from "@/components/ui/Field";
import { Skeleton, Tip } from "@/components/ui/Misc";
import { useSyncProduct } from "@/hooks/useSync";
import { cn } from "@/lib/cn";
import { exactTime, formatInr, relativeTime } from "@/lib/format";
import { StatusBadge } from "./StatusBadge";

interface Props {
  products: Product[];
  loading: boolean;
  selected: Set<number>;
  onToggle: (id: number) => void;
  onToggleAll: (ids: number[], checked: boolean) => void;
  onDelete: (p: Product) => void;
}

const th = "h-9 px-3 text-left text-2xs font-medium uppercase tracking-wider text-muted";

export const ProductTable = ({ products, loading, selected, onToggle, onToggleAll, onDelete }: Props) => {
  const navigate = useNavigate();
  const ids = products.map((p) => p.id);
  const allChecked = ids.length > 0 && ids.every((id) => selected.has(id));
  const someChecked = !allChecked && ids.some((id) => selected.has(id));

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[880px] border-collapse text-sm">
        <thead className="sticky top-0 z-10 bg-surface">
          <tr className="border-b border-border">
            <th className="w-10 pl-4">
              <Checkbox
                aria-label="Select all on this page"
                checked={allChecked}
                ref={(el) => el && (el.indeterminate = someChecked)}
                onChange={(e) => onToggleAll(ids, e.target.checked)}
              />
            </th>
            <th className={th}>Product</th>
            <th className={th}>SKU</th>
            <th className={cn(th, "text-right")}>Price</th>
            <th className={cn(th, "text-right")}>Stock</th>
            <th className={th}>Status</th>
            <th className={th}>Last synced</th>
            <th className="w-24" />
          </tr>
        </thead>
        <tbody>
          {loading && products.length === 0
            ? Array.from({ length: 8 }, (_, i) => <SkeletonRow key={i} />)
            : products.map((p) => (
                <Row
                  key={p.id}
                  p={p}
                  checked={selected.has(p.id)}
                  onToggle={() => onToggle(p.id)}
                  onOpen={() => navigate(`/products/${p.id}`)}
                  onDelete={() => onDelete(p)}
                />
              ))}
        </tbody>
      </table>
    </div>
  );
};

const Row = ({ p, checked, onToggle, onOpen, onDelete }: { p: Product; checked: boolean; onToggle: () => void; onOpen: () => void; onDelete: () => void }) => {
  const sync = useSyncProduct();
  const [menu, setMenu] = useState(false);
  const stop = (e: MouseEvent) => e.stopPropagation();
  const syncing = sync.isPending || p.syncStatus === "syncing";

  return (
    <tr
      onClick={onOpen}
      className={cn("group h-11 cursor-pointer border-b border-border/70 transition-colors last:border-0 hover:bg-subtle/60", checked && "bg-accent-tint/30")}
    >
      <td className="pl-4" onClick={stop}>
        <Checkbox aria-label={`Select ${p.name}`} checked={checked} onChange={onToggle} />
      </td>
      <td className="px-3">
        <div className="flex min-w-0 items-center gap-3">
          <Thumb src={p.imageUrl} />
          <div className="min-w-0">
            <p className="truncate font-medium text-fg">{p.name}</p>
            <p className="truncate text-xs text-muted">
              {p.type === "variable" ? `${p.variationCount} variants` : "Simple"}
              {p.category && ` · ${p.category}`}
            </p>
          </div>
        </div>
      </td>
      <td className="px-3 font-mono text-xs text-muted">{p.sku}</td>
      <td className="num px-3 text-right">
        {p.type === "variable" ? (
          <span className="text-muted">Per variant</span>
        ) : p.salePrice !== null ? (
          <span className="flex flex-col items-end leading-tight">
            <span>{formatInr(p.salePrice)}</span>
            <span className="text-2xs text-faint line-through">{formatInr(p.regularPrice)}</span>
          </span>
        ) : (
          formatInr(p.regularPrice)
        )}
      </td>
      <td className={cn("num px-3 text-right", p.type === "simple" && p.stockQuantity === 0 && "text-bad")}>
        {p.type === "variable" ? <span className="text-faint">—</span> : p.stockQuantity}
      </td>
      <td className="px-3">
        {p.syncStatus === "failed" && p.lastError ? (
          <Tip label={p.lastError.length > 70 ? `${p.lastError.slice(0, 70)}…` : p.lastError}>
            <StatusBadge status={p.syncStatus} />
          </Tip>
        ) : (
          <StatusBadge status={syncing ? "syncing" : p.syncStatus} />
        )}
      </td>
      <td className="px-3 text-xs text-muted">
        {p.lastSyncedAt ? <Tip label={exactTime(p.lastSyncedAt)}>{relativeTime(p.lastSyncedAt)}</Tip> : <span className="text-faint">Never</span>}
      </td>
      <td className="pr-3" onClick={stop}>
        <div className="flex items-center justify-end gap-1">
          <Button
            size="sm"
            variant="ghost"
            className="opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
            disabled={syncing || p.syncStatus === "synced"}
            onClick={() => sync.mutate({ id: p.id, sku: p.sku })}
            icon={syncing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
          >
            Sync
          </Button>
          <div className="relative">
            <Button size="icon" variant="ghost" className="h-7 w-7" aria-label="More actions" aria-expanded={menu} onClick={() => setMenu((m) => !m)}>
              <MoreHorizontal className="h-4 w-4" />
            </Button>
            {menu && (
              <>
                <div className="fixed inset-0 z-20" onClick={() => setMenu(false)} />
                <div role="menu" className="absolute right-0 top-8 z-30 w-40 rounded-lg border border-border bg-surface p-1 shadow-overlay animate-pop-in">
                  <MenuItem onClick={() => { setMenu(false); onOpen(); }}>Edit</MenuItem>
                  <MenuItem onClick={() => { setMenu(false); sync.mutate({ id: p.id, sku: p.sku }); }} disabled={syncing}>
                    Sync now
                  </MenuItem>
                  <div className="my-1 h-px bg-border" />
                  <MenuItem danger onClick={() => { setMenu(false); onDelete(); }}>
                    Delete…
                  </MenuItem>
                </div>
              </>
            )}
          </div>
        </div>
      </td>
    </tr>
  );
};

const MenuItem = ({ children, onClick, danger, disabled }: { children: string; onClick: () => void; danger?: boolean; disabled?: boolean }) => (
  <button
    role="menuitem"
    disabled={disabled}
    onClick={onClick}
    className={cn("flex h-8 w-full items-center rounded px-2.5 text-left text-sm hover:bg-subtle disabled:opacity-50", danger ? "text-bad" : "text-fg")}
  >
    {children}
  </button>
);

export const Thumb = ({ src, size = "sm" }: { src: string | null; size?: "sm" | "lg" }) => {
  const [broken, setBroken] = useState(false);
  const cls = size === "sm" ? "h-8 w-8" : "h-16 w-16";
  if (!src || broken)
    return (
      <div className={cn(cls, "flex shrink-0 items-center justify-center rounded border border-border bg-subtle text-faint")}>
        <ImageOff className="h-3.5 w-3.5" />
      </div>
    );
  return <img src={src} alt="" loading="lazy" onError={() => setBroken(true)} className={cn(cls, "shrink-0 rounded border border-border object-cover")} />;
};

const SkeletonRow = () => (
  <tr className="h-11 border-b border-border/70">
    <td className="pl-4"><Skeleton className="h-3.5 w-3.5" /></td>
    <td className="px-3"><div className="flex items-center gap-3"><Skeleton className="h-8 w-8" /><div className="space-y-1.5"><Skeleton className="h-3 w-40" /><Skeleton className="h-2.5 w-24" /></div></div></td>
    <td className="px-3"><Skeleton className="h-3 w-20" /></td>
    <td className="px-3"><Skeleton className="ml-auto h-3 w-14" /></td>
    <td className="px-3"><Skeleton className="ml-auto h-3 w-8" /></td>
    <td className="px-3"><Skeleton className="h-5 w-16 rounded-full" /></td>
    <td className="px-3"><Skeleton className="h-3 w-14" /></td>
    <td />
  </tr>
);
