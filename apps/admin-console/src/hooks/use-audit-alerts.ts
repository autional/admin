'use client';

import { extractListResult, extractItem, useCurrentTenantId } from '@autional/shared';
import { queryKeys } from '@/lib/query-keys';


import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getAlerts, getAlertById, assignAlert, updateAlertStatus } from '@/lib/api.generated';

import type * as Types from '@autional/shared/generated/types';

export type AlertRecord = Types.AlertResponse;

export type AlertListResult = {
	items: AlertRecord[];
	pagination?: { total?: number };
};

export function useAlerts(params?: Record<string, unknown>) {
	const tenantId = useCurrentTenantId() ?? '';
	return useQuery({
		queryKey: queryKeys.auditAlerts.all(tenantId, params),
		queryFn: async ({ signal }) => {
			const res = await getAlerts(params, signal);
			return extractListResult<AlertRecord>(res) as AlertListResult;
		},
	});
}

export function useAlertDetail(id: string) {
	const tenantId = useCurrentTenantId() ?? '';
	return useQuery({
		queryKey: queryKeys.auditAlerts.detail(tenantId, id),
		queryFn: async ({ signal }) => {
			const res = await getAlertById(id, signal);
			return extractItem<AlertRecord>(res);
		},
		enabled: !!id,
	});
}

export function useAssignAlert() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: ({ id, data }: { id: string; data: Types.AssignAlertRequest }) =>
			assignAlert(id, data),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ['audit-alerts'] });
		},
	});
}

export function useUpdateAlertStatus() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: ({ id, data }: { id: string; data: Types.UpdateAlertStatusRequest }) =>
			updateAlertStatus(id, data),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ['audit-alerts'] });
		},
	});
}
