import type { Variation, VariationUpdateInput } from "@pim/shared";
import { useEffect, useState, type KeyboardEvent } from "react";
import { toast } from "sonner";
import { useUpdateVariation } from "@/hooks/useProducts";
import { ApiError, errorMessage } from "@/lib/api";
import { cn } from "@/lib/cn";
import { inputToPaise, paiseToInput } from "@/lib/format";

type Col = "regularPrice" | "salePrice" | "stockQuantity";
const COLS: Col[] = ["regularPrice", "salePrice", "stockQuantity"];

/** Spreadsheet-like grid. Each cell saves on blur/Enter; arrows move between rows, Enter moves down. */
export const VariationGrid = ({ variations, attributeNames }: { variations: Variation[]; attributeNames: string[] }) => (
  <div className="overflow-x-auto rounded-lg border border-border">
    <table className="w-full min-w-[640px] border-collapse text-sm">
      <thead>
        <tr className="border-b border-border bg-subtle/50">
          {attributeNames.map((n) => (
            <th key={n} className="h-8 px-3 text-left text-2xs font-medium uppercase tracking-wider text-muted">{n}</th>
          ))}
          <th className="px-3 text-left text-2xs font-medium uppercase tracking-wider text-muted">SKU</th>
          <th className="w-28 px-3 text-right text-2xs font-medium uppercase tracking-wider text-muted">Price ₹</th>
          <th className="w-28 px-3 text-right text-2xs font-medium uppercase tracking-wider text-muted">Sale ₹</th>
          <th className="w-24 px-3 text-right text-2xs font-medium uppercase tracking-wider text-muted">Stock</th>
          <th className="w-20 px-3 text-left text-2xs font-medium uppercase tracking-wider text-muted">Store</th>
        </tr>
      </thead>
      <tbody>
        {variations.map((v, row) => (
          <tr key={v.id} className="h-10 border-b border-border/70 last:border-0">
            {attributeNames.map((n) => (
              <td key={n} className="px-3 text-fg">{v.attributes[n] ?? <span className="text-faint">—</span>}</td>
            ))}
            <td className="px-3 font-mono text-xs text-muted">{v.sku}</td>
            {COLS.map((col) => (
              <td key={col} className="p-0">
                <Cell variation={v} col={col} row={row} />
              </td>
            ))}
            <td className="px-3">
              {v.wooVariationId ? (
                <span className="font-mono text-2xs text-muted">#{v.wooVariationId}</span>
              ) : (
                <span className="rounded border border-border px-1.5 py-0.5 text-2xs text-muted">New</span>
              )}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  </div>
);

const display = (v: Variation, col: Col) => (col === "stockQuantity" ? String(v.stockQuantity) : paiseToInput(v[col]));

const Cell = ({ variation, col, row }: { variation: Variation; col: Col; row: number }) => {
  const update = useUpdateVariation();
  const original = display(variation, col);
  const [value, setValue] = useState(original);
  const [error, setError] = useState(false);

  useEffect(() => setValue(original), [original]);

  const commit = () => {
    if (value.trim() === original) return setError(false);
    let parsed: number | null;
    if (col === "stockQuantity") {
      parsed = /^\d+$/.test(value.trim()) ? Number(value.trim()) : Number.NaN;
    } else {
      parsed = inputToPaise(value);
      if (col === "regularPrice" && parsed === null) parsed = Number.NaN;
    }
    if (parsed !== null && Number.isNaN(parsed)) {
      setError(true);
      toast.error(col === "stockQuantity" ? "Stock must be a whole number" : "Enter a price like 499 or 499.50");
      return;
    }
    const body: VariationUpdateInput =
      col === "stockQuantity"
        ? { stockQuantity: parsed as number }
        : col === "regularPrice"
          ? { regularPrice: parsed as number }
          : { salePrice: parsed };
    update.mutate(
      { id: variation.id, body },
      {
        onSuccess: () => setError(false),
        onError: (e) => {
          setError(true);
          const msg = e instanceof ApiError ? Object.values(e.fieldErrors)[0] ?? e.message : errorMessage(e);
          toast.error(`${variation.sku}: ${msg}`);
          setValue(original);
        },
      },
    );
  };

  const move = (e: KeyboardEvent<HTMLInputElement>, dRow: number) => {
    const next = document.querySelector<HTMLInputElement>(`[data-cell="${row + dRow}-${col}"]`);
    if (next) {
      e.preventDefault();
      next.focus();
      next.select();
    }
  };

  return (
    <input
      data-cell={`${row}-${col}`}
      value={value}
      inputMode={col === "stockQuantity" ? "numeric" : "decimal"}
      onChange={(e) => setValue(e.target.value)}
      onFocus={(e) => e.target.select()}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "ArrowDown" || e.key === "Enter") move(e, 1);
        else if (e.key === "ArrowUp") move(e, -1);
        else if (e.key === "Escape") {
          setValue(original);
          (e.target as HTMLInputElement).blur();
        }
      }}
      placeholder={col === "salePrice" ? "—" : ""}
      aria-label={`${variation.sku} ${col}`}
      className={cn(
        "num h-10 w-full bg-transparent px-3 text-right text-sm outline-none transition-colors placeholder:text-faint hover:bg-subtle/60 focus:bg-accent-tint/30 focus:shadow-[inset_0_0_0_1.5px_rgb(var(--accent)/0.5)] focus-visible:ring-0",
        error && "bg-bad-tint text-bad",
        update.isPending && "opacity-60",
      )}
    />
  );
};
