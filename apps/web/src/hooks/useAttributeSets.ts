import type { AttributeSetCreateInput, AttributeSetUpdateInput } from "@pim/shared";
import { useMutation, useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { queryKeys } from "@/lib/queryKeys";
import { useInvalidateCatalog } from "./useInvalidate";

export const useAttributeSets = () =>
  useQuery({ queryKey: queryKeys.attributeSets.all, queryFn: api.attributeSets.list });

export const useSaveAttributeSet = () => {
  const invalidate = useInvalidateCatalog();
  return useMutation({
    mutationFn: (v: { id?: number; body: AttributeSetCreateInput | AttributeSetUpdateInput }) =>
      v.id ? api.attributeSets.update(v.id, v.body) : api.attributeSets.create(v.body as AttributeSetCreateInput),
    onSuccess: invalidate,
  });
};

export const useDeleteAttributeSet = () => {
  const invalidate = useInvalidateCatalog();
  return useMutation({ mutationFn: (id: number) => api.attributeSets.remove(id), onSuccess: invalidate });
};
