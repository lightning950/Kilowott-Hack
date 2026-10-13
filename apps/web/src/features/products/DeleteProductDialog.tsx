import type { Product } from "@pim/shared";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Overlay";
import { useDeleteProduct } from "@/hooks/useProducts";
import { errorMessage } from "@/lib/api";
import { cn } from "@/lib/cn";

type Scope = "pim" | "everywhere";

export const DeleteProductDialog = ({
  product,
  onClose,
  onDeleted,
}: {
  product: Pick<Product, "id" | "name" | "sku" | "wooId"> | null;
  onClose: () => void;
  onDeleted?: () => void;
}) => {
  const del = useDeleteProduct();
  const [scope, setScope] = useState<Scope>("pim");
  const inStore = !!product?.wooId;

  const confirm = () => {
    if (!product) return;
    del.mutate(
      { id: product.id, scope: inStore ? scope : "pim" },
      {
        onSuccess: (r) => {
          toast.success(`${product.sku} deleted`, { description: r.deletedInStore ? "Removed from the PIM and WooCommerce" : "Removed from the PIM" });
          onClose();
          onDeleted?.();
        },
        onError: (e) => toast.error("Could not delete", { description: errorMessage(e) }),
      },
    );
  };

  return (
    <Dialog
      open={!!product}
      onClose={onClose}
      title={`Delete ${product?.name ?? "product"}?`}
      description={inStore ? "This product is live in your store. Choose where to delete it." : "This can't be undone."}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="danger" loading={del.isPending} onClick={confirm}>
            Delete
          </Button>
        </>
      }
    >
      {inStore && (
        <div className="space-y-2" role="radiogroup" aria-label="Delete scope">
          {(
            [
              ["pim", "Delete in PIM only", "The product stays live in WooCommerce."],
              ["everywhere", "Also delete in WooCommerce", "Removes it from the store permanently."],
            ] as const
          ).map(([value, title, desc]) => (
            <label
              key={value}
              className={cn(
                "flex cursor-pointer gap-3 rounded-lg border p-3 transition-colors",
                scope === value ? "border-accent/50 bg-accent-tint/40" : "border-border hover:border-border-strong",
              )}
            >
              <input type="radio" name="scope" checked={scope === value} onChange={() => setScope(value)} className="mt-0.5 accent-[rgb(var(--accent))]" />
              <span>
                <span className="block text-sm font-medium">{title}</span>
                <span className="block text-xs text-muted">{desc}</span>
              </span>
            </label>
          ))}
        </div>
      )}
    </Dialog>
  );
};
