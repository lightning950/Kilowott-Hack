import type { LogListQuery } from "@pim/shared";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { queryKeys } from "@/lib/queryKeys";

export const useHealth = () =>
  useQuery({ queryKey: queryKeys.health, queryFn: api.system.health, refetchInterval: 30_000, retry: false });

export const useStats = () => useQuery({ queryKey: queryKeys.stats, queryFn: api.system.stats });

export const useLogs = (q: Partial<LogListQuery>) =>
  useQuery({ queryKey: queryKeys.logs.list(q), queryFn: () => api.logs.list(q), placeholderData: keepPreviousData });
