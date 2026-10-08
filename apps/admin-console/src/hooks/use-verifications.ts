'use client';

import { extractList, extractItem } from '@autional/shared';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
	listVerifications,
	getVerificationStats,
	overrideVerification,
	exportVerifications,
	manualReviewVerification,
	resolveVerificationReview,
} from '@/lib/api.generated';

export interface VerificationRecord {
	id: string;
	userId: string;
	status: string;
	method?: string;
	provider?: string;
	ageGroup?: string;
	verifiedAt?: string;
	createdAt?: string;
}

export function useVerifications(params?: Record<string, unknown>) {
	return useQuery({
		queryKey: ['verifications', { ...params }],
		staleTime: 30000,
		queryFn: async () => {
			const res = await listVerifications(params as any);
			return extractList<VerificationRecord>(res);
		},
	});
}

export function useVerificationStats() {
	return useQuery({
		queryKey: ['verifications', 'stats'],
		staleTime: 30000,
		queryFn: async () => {
			const res = await getVerificationStats();
			return extractItem<{ total: number; verified: number; pending: number; rejected: number }>(
				res,
			);
		},
	});
}

export function useOverrideVerification() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (data: { id: string; status: string; reason: string }) =>
			overrideVerification(data.id, { status: data.status, reason: data.reason } as any),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ['verifications'] });
		},
	});
}

// A-264（W1e）：导出认证记录 CSV（生成函数直返 CSV 文本；非信封实体 → 响应拦截器透传）
export function useExportVerifications() {
	return useMutation({
		mutationFn: (params?: { status?: string; dateFrom?: string; dateTo?: string }) =>
			exportVerifications(params),
	});
}

// A-264（W1e）：转人工复核（后端 manual-review 动作；需 Step-up 重新认证）
export function useManualReviewVerification() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: ({ id, reason }: { id: string; reason: string }) =>
			manualReviewVerification(id, { reason }),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ['verifications'] });
		},
	});
}

// A-264（W1e）：提交复核结论（后端 resolve-review：approved/rejected；需 Step-up 重新认证）
export function useResolveVerificationReview() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: ({
			id,
			reason,
			resolution,
		}: {
			id: string;
			reason: string;
			resolution: 'approved' | 'rejected';
		}) => resolveVerificationReview(id, { reason, resolution }),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ['verifications'] });
		},
	});
}
