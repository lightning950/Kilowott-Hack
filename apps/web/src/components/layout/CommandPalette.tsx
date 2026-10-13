import { useEffect, useMemo, useState, type KeyboardEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import { Activity, ArrowRight, Boxes, CornerDownLeft, LayoutGrid, Plus, RefreshCw, Search, Tags } from "lucide-react";
import { useDebounced } from "@/hooks/useDebounced";
import { useProducts } from "@/hooks/useProducts";
import { useBulkSync } from "@/hooks/useSync";
import { cn } from "@/lib/cn";
import { Kbd } from "@/components/ui/Misc";
import { StatusDot } from "@/features/products/StatusBadge";

interface Item {
  id: string;
  group: "Products" | "Actions" | "Go to";
  label: string;
  hint?: ReactNode;
  icon: ReactNode;
  run: () => void;
}

export const CommandPalette = ({ open, onClose }: { open: boolean; onClose: () => void }) => {
  const navigate = useNavigate();
  const bulkSync = useBulkSync();
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const search = useDebounced(query.trim(), 150);
  const products = useProducts({ search: search || undefined, pageSize: 6 });

  useEffect(() => {
    if (open) {
      setQuery("");
      setActive(0);
    }
  }, [open]);

  const items = useMemo<Item[]>(() => {
    const go = (to: string) => () => navigate(to);
    const q = query.trim().toLowerCase();
    const statics: Item[] = [
      { id: "new", group: "Actions", label: "New product", icon: <Plus className="h-4 w-4" />, hint: <Kbd>N</Kbd>, run: go("/products/new") },
      { id: "sync", group: "Actions", label: "Sync all pending products", icon: <RefreshCw className="h-4 w-4" />, run: () => bulkSync.mutate(undefined) },
      { id: "overview", group: "Go to", label: "Overview", icon: <LayoutGrid className="h-4 w-4" />, run: go("/") },
      { id: "products", group: "Go to", label: "Products", icon: <Boxes className="h-4 w-4" />, run: go("/products") },
      { id: "sets", group: "Go to", label: "Attribute sets", icon: <Tags className="h-4 w-4" />, run: go("/attribute-sets") },
      { id: "logs", group: "Go to", label: "Sync log", icon: <Activity className="h-4 w-4" />, run: go("/logs") },
    ].filter((i) => !q || i.label.toLowerCase().includes(q));
    const found: Item[] = (search ? (products.data?.items ?? []) : []).map((p) => ({
      id: `p${p.id}`,
      group: "Products",
      label: p.name,
      hint: <span className="font-mono text-2xs text-muted">{p.sku}</span>,
      icon: <StatusDot status={p.syncStatus} />,
      run: go(`/products/${p.id}`),
    }));
    return [...found, ...statics];
  }, [query, search, products.data, navigate, bulkSync]);

  useEffect(() => setActive(0), [items.length]);

  if (!open) return null;

  const run = (item: Item | undefined) => {
    if (!item) return;
    onClose();
    item.run();
  };

  const onKey = (e: KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => Math.min(a + 1, items.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      run(items[active]);
    } else if (e.key === "Escape") onClose();
  };

  let lastGroup = "";
  return createPortal(
    <div className="fixed inset-0 z-[60] flex items-start justify-center bg-fg/20 px-4 pt-[12vh] animate-fade-in" onMouseDown={onClose}>
      <div
        role="dialog"
        aria-label="Command palette"
        onMouseDown={(e) => e.stopPropagation()}
        className="w-full max-w-xl overflow-hidden rounded-lg border border-border bg-surface shadow-overlay animate-pop-in"
      >
        <div className="flex items-center gap-2.5 border-b border-border px-4">
          <Search className="h-4 w-4 text-muted" />
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKey}
            placeholder="Search products by name or SKU, or type a command"
            className="h-12 flex-1 bg-transparent text-sm outline-none placeholder:text-faint focus-visible:ring-0"
            role="combobox"
            aria-expanded
            aria-controls="palette-list"
            aria-activedescendant={items[active]?.id}
          />
          <Kbd>Esc</Kbd>
        </div>
        <ul id="palette-list" role="listbox" className="max-h-[360px] overflow-y-auto p-1.5">
          {items.length === 0 && <li className="px-3 py-8 text-center text-sm text-muted">No matches for “{query}”</li>}
          {items.map((item, i) => {
            const header = item.group !== lastGroup ? item.group : null;
            lastGroup = item.group;
            return (
              <li key={item.id}>
                {header && <p className="px-2.5 pb-1 pt-2.5 text-2xs font-medium uppercase tracking-wider text-faint">{header}</p>}
                <button
                  id={item.id}
                  role="option"
                  aria-selected={i === active}
                  onMouseMove={() => setActive(i)}
                  onClick={() => run(item)}
                  className={cn(
                    "flex h-9 w-full items-center gap-3 rounded px-2.5 text-left text-sm",
                    i === active ? "bg-subtle text-fg" : "text-fg/80",
                  )}
                >
                  <span className="flex w-4 justify-center text-muted">{item.icon}</span>
                  <span className="flex-1 truncate">{item.label}</span>
                  {item.hint}
                  {i === active && (item.group === "Products" ? <ArrowRight className="h-3.5 w-3.5 text-muted" /> : <CornerDownLeft className="h-3.5 w-3.5 text-muted" />)}
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </div>,
    document.body,
  );
};
