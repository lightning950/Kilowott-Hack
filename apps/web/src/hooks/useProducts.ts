import type { ProductCreateInput, ProductDeleteScope, ProductListQuery, ProductUpdateInput, VariationUpdateInput } from "@pim/shared";
import { keepPreviousData, useMutation, useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { queryKeys } from "@/lib/queryKeys";
import { useInvalidateCatalog } from "./useInvalidate";

export const useProducts = (q: Partial<ProductListQuery>) =>
  useQuery({
    queryKey: queryKeys.products.list(q),
    queryFn: () => api.products.list(q),
    placeholderData: keepPreviousData,
  });

export const useProduct = (id: number | null) =>
  useQuery({
    queryKey: queryKeys.products.detail(id ?? 0),
    queryFn: () => api.products.get(id!),
    enabled: id !== null,
    // Poll while a sync is running so the status settles on its own.
    refetchInterval: (query) => (query.state.data?.syncStatus === "syncing" ? 1000 : false),
  });

export const useCreateProduct = () => {
  const invalidate = useInvalidateCatalog();
  return useMutation({ mutationFn: (body: ProductCreateInput) => api.products.create(body), onSuccess: invalidate });
};

export const useUpdateProduct = (id: number) => {
  const invalidate = useInvalidateCatalog();
  return useMutation({
    mutationFn: (v: { body: ProductUpdateInput; confirmDeleteVariations?: boolean }) =>
      api.products.update(id, v.body, v.confirmDeleteVariations),
    onSuccess: invalidate,
  });
};

export const useDeleteProduct = () => {
  const invalidate = useInvalidateCatalog();
  return useMutation({
    mutationFn: (v: { id: number; scope: ProductDeleteScope }) => api.products.remove(v.id, v.scope),
    onSuccess: invalidate,
  });
};

export const useGenerateVariations = (productId: number) => {
  const invalidate = useInvalidateCatalog();
  return useMutation({ mutationFn: () => api.products.generateVariations(productId), onSuccess: invalidate });
};

export const useUpdateVariation = () => {
  const invalidate = useInvalidateCatalog();
  return useMutation({
    mutationFn: (v: { id: number; body: VariationUpdateInput }) => api.variations.update(v.id, v.body),
    onSuccess: invalidate,
  });
};
