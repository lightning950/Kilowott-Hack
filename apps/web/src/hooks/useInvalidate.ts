import { useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/lib/queryKeys";

/** After any write: products (lists + details), stats and logs can all be stale. */
export const useInvalidateCatalog = () => {
  const qc = useQueryClient();
  return () =>
    Promise.all([
      qc.invalidateQueries({ queryKey: queryKeys.products.all }),
      qc.invalidateQueries({ queryKey: queryKeys.stats }),
      qc.invalidateQueries({ queryKey: queryKeys.logs.all }),
      qc.invalidateQueries({ queryKey: queryKeys.attributeSets.all }),
    ]);
};
