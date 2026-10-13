import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { api, errorMessage } from "@/lib/api";
import { pluralize } from "@/lib/format";
import { useInvalidateCatalog } from "./useInvalidate";

/** Sync one product. Toasts the outcome; the product's own status comes from the server. */
export const useSyncProduct = () => {
  const invalidate = useInvalidateCatalog();
  return useMutation({
    mutationFn: (v: { id: number; sku: string }) => api.sync.one(v.id),
    onSuccess: (r) => {
      toast.success(`${r.sku} synced`, {
        description: r.warnings.length ? r.warnings.join(" · ") : `${r.action === "create" ? "Created" : "Updated"} in WooCommerce`,
      });
    },
    onError: (e, v) => toast.error(`${v.sku} failed to sync`, { description: errorMessage(e) }),
    onSettled: invalidate,
  });
};

/** Sync specific products, or everything pending when no ids are given. */
export const useBulkSync = () => {
  const invalidate = useInvalidateCatalog();
  return useMutation({
    mutationFn: (productIds?: number[]) => api.sync.bulk(productIds),
    onSuccess: (r) => {
      if (r.total === 0) return toast("Nothing to sync", { description: "Every product is already up to date." });
      const parts = [`${r.succeeded} synced`];
      if (r.failed) parts.push(`${r.failed} failed`);
      if (r.skipped) parts.push(`${r.skipped} already syncing`);
      (r.failed ? toast.warning : toast.success)(`Synced ${pluralize(r.total, "product")}`, { description: parts.join(" · ") });
    },
    onError: (e) => toast.error("Bulk sync failed", { description: errorMessage(e) }),
    onSettled: invalidate,
  });
};

export const useImport = () => {
  const invalidate = useInvalidateCatalog();
  return useMutation({
    mutationFn: () => api.import(),
    onSuccess: (r) => {
      const parts = [`${r.created} new`, `${r.updated} updated`];
      if (r.conflicts.length) parts.push(`${r.conflicts.length} kept (unsynced local edits)`);
      if (r.skipped.length) parts.push(`${r.skipped.length} skipped`);
      toast.success("Import finished", { description: parts.join(" · ") });
    },
    onError: (e) => toast.error("Import failed", { description: errorMessage(e) }),
    onSettled: invalidate,
  });
};
