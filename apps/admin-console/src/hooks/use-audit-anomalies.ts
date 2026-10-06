'use client';

import { extractListResult, extractItem, useCurrentTenantId } from '@autional/shared';
import { queryKeys } from '@/lib/query-keys';


import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
	getAnomalies,
	getAnomalyById,
	updateAnomalyStatus,
	assignAnomaly,
	addAnomalyComment,
	getAnomalyTimeline,
	getRelatedAnomalies,
	detectAnomalies,
	linkAnomalyToCase,
} from '@/lib/api.generated';

import type * as Types from '@autional/shared/generated/types';

export type AnomalyRecord = Types.AnomalyResponse;

export type AnomalyListResult = {
	items: AnomalyRecord[];
	pagination?: { total?: number };
};

export function useAnomalies(params?: Record<string, unknown>) {
	const tenantId = useCurrentTenantId() ?? '';
	return useQuery({
		queryKey: queryKeys.auditAnomalies.all(tenantId, params),
		queryFn: async ({ signal }) => {
			const res = await getAnomalies(params, signal);
			return extractListResult<AnomalyRecord>(res) as AnomalyListResult;
		},
	});
}

export function useAnomalyDetail(id: string) {
	const tenantId = useCurrentTenantId() ?? '';
	return useQuery({
		queryKey: queryKeys.auditAnomalies.detail(tenantId, id),
		queryFn: async ({ signal }) => {
			const res = await getAnomalyById(id, signal);
			return extractItem<AnomalyRecord>(res);
		},
		enabled: !!id,
	});
}

export function useUpdateAnomalyStatus() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: ({ id, data }: { id: string; data: Types.UpdateAnomalyStatusRequest }) =>
			updateAnomalyStatus(id, data),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ['audit-anomalies'] });
		},
	});
}

export function useAssignAnomaly() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: ({ id, data }: { id: string; data: Types.AssignAnomalyRequest }) =>
			assignAnomaly(id, data),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ['audit-anomalies'] });
		},
	});
}

export function useAddAnomalyComment() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: ({ id, content }: { id: string; content: string }) =>
			addAnomalyComment(id, { content }),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ['audit-anomalies'] });
		},
	});
}

export function useAnomalyTimeline(id: string | undefined) {
	const tenantId = useCurrentTenantId() ?? '';
	return useQuery({
		queryKey: queryKeys.auditAnomalies.timeline(tenantId, id!),
		queryFn: ({ signal }) => getAnomalyTimeline(id!, signal),
		enabled: !!id,
	});
}

export function useRelatedAnomalies(id: string | undefined) {
	const tenantId = useCurrentTenantId() ?? '';
	return useQuery({
		queryKey: queryKeys.auditAnomalies.related(tenantId, id!),
		queryFn: ({ signal }) => getRelatedAnomalies(id!, signal),
		enabled: !!id,
	});
}

export function useDetectAnomalies() {
	const queryClient = useQueryClient();
	return useMutation({
		// TASK-AB1-27（RC-5 契约收敛）：入参 camel 书面写（拦截器 snake 化上 wire）
		mutationFn: (data: { timeRange?: string }) => detectAnomalies(data),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ['audit-anomalies'] });
		},
	});
}

export function useLinkAnomalyToCase() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: ({ id, caseId }: { id: string; caseId: string }) =>
			linkAnomalyToCase(id, { caseId }),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ['audit-anomalies'] });
		},
	});
}
