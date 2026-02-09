import { useQuery, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import {
  getWorkCardsForManagers,
  getWorkCardsForCompany,
  getWorkCardsForProject,
} from '@/services/operationsWorkCardService';

const WORK_CARDS_KEY = 'operationsWorkCards';

/** Cached 30s so list appears instantly when reopening; placeholder keeps previous data while refetching. */
const STALE_TIME_MS = 30 * 1000;

export function useWorkCardsForManager(managerIds: string[]) {
  return useQuery({
    queryKey: [WORK_CARDS_KEY, 'manager', managerIds],
    queryFn: () => getWorkCardsForManagers(managerIds),
    enabled: managerIds.length > 0,
    staleTime: STALE_TIME_MS,
    refetchInterval: 5000,
    placeholderData: keepPreviousData,
  });
}

export function useWorkCardsForCompany(companyId: string | null, options?: { refetchInterval?: number }) {
  return useQuery({
    queryKey: [WORK_CARDS_KEY, 'company', companyId],
    queryFn: () => getWorkCardsForCompany(companyId!),
    enabled: !!companyId,
    staleTime: STALE_TIME_MS,
    refetchInterval: options?.refetchInterval,
    placeholderData: keepPreviousData,
  });
}

export function useWorkCardsForProject(projectId: string | null) {
  return useQuery({
    queryKey: [WORK_CARDS_KEY, 'project', projectId],
    queryFn: () => getWorkCardsForProject(projectId!),
    enabled: !!projectId,
  });
}

export function useInvalidateWorkCards() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: [WORK_CARDS_KEY] });
}
