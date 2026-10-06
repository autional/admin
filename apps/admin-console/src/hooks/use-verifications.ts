'use client';

import { extractList, extractItem } from '@autional/shared';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { listVerifications, getVerificationStats, overrideVerification } from '@/lib/api.generated';

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
