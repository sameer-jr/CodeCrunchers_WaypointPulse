import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { planningActionInputSchema, planningGenerateInputSchema, type DispatcherContext, type PlanningGenerateInput, type PlanningRunDetail, type PlanningRunList } from '@waypoint/shared';
import { apiRequest } from '../api';

function scope(context: DispatcherContext) { return context.depots.map(depot => depot.id).sort().join(','); }
const runKey = (context: DispatcherContext, id: string, date = context.selectedDate) => ['dispatcher', scope(context), 'plans', date, id] as const;

export function usePlanRuns(context: DispatcherContext, depotId: string, page: number) {
  const params = new URLSearchParams({ date: context.selectedDate, depotId, page: String(page), limit: '20' });
  return useQuery({ queryKey: ['dispatcher', scope(context), 'plans', context.selectedDate, depotId, page], queryFn: () => apiRequest<PlanningRunList>(`/dispatcher/plans?${params}`), enabled: !!depotId, retry: false, refetchInterval: 30000 });
}
export function usePlan(context: DispatcherContext, id: string | undefined) {
  return useQuery({ queryKey: runKey(context, id || ''), queryFn: () => apiRequest<PlanningRunDetail>(`/dispatcher/plans/${encodeURIComponent(id!)}`), enabled: !!id, retry: false, refetchInterval: 30000 });
}
export function usePlanActions(context: DispatcherContext, select: (plan: PlanningRunDetail) => void) {
  const client = useQueryClient();
  const refresh = async (plan: PlanningRunDetail) => {
    client.setQueryData(runKey(context, plan.id, plan.serviceDate), plan);
    select(plan);
    await Promise.all([client.invalidateQueries({ queryKey: ['dispatcher'] }), client.invalidateQueries({ queryKey: ['store'] })]);
  };
  const refreshAfterError = () => client.invalidateQueries({ queryKey: ['dispatcher'] });
  const generate = useMutation({ mutationFn: (input: PlanningGenerateInput) => apiRequest<PlanningRunDetail>('/dispatcher/plans', { method: 'POST', body: JSON.stringify(planningGenerateInputSchema.parse(input)) }), onSuccess: refresh, onError: refreshAfterError, retry: false });
  const validate = useMutation({ mutationFn: ({ id, version }: { id: string; version: number }) => apiRequest<PlanningRunDetail>(`/dispatcher/plans/${encodeURIComponent(id)}/validate`, { method: 'POST', body: JSON.stringify(planningActionInputSchema.parse({ expectedVersion: version })) }), onSuccess: refresh, onError: refreshAfterError, retry: false });
  const release = useMutation({ mutationFn: ({ id, version }: { id: string; version: number }) => apiRequest<PlanningRunDetail>(`/dispatcher/plans/${encodeURIComponent(id)}/release`, { method: 'POST', body: JSON.stringify(planningActionInputSchema.parse({ expectedVersion: version })) }), onSuccess: refresh, onError: refreshAfterError, retry: false });
  return { generate, validate, release, busy: generate.isPending || validate.isPending || release.isPending };
}
