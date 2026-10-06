'use client';

import { extractList, extractItem } from '@autional/shared';
import { queryKeys } from '@/lib/query-keys';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
	getPendingMembers,
	approveMember,
	rejectMember,
	batchApproveMembers,
} from '@/lib/api.generated';

export interface PendingMember {
	userId: string;
	username: string;
	email: string;
	requestedRole: string;
	reason: string;
	requestedAt: string;
	daysRemaining: number;
}

export function usePendingMembers(tenantId: string) {
	return useQuery({
		queryKey: queryKeys.members.pending(tenantId),
		queryFn: async () => {
			const res = await getPendingMembers(tenantId);
			return extractList<PendingMember>(res);
		},
		enabled: !!tenantId,
	});
}

export function useApproveMember(tenantId: string) {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: ({ memberId, data }: { memberId: string; data: Record<string, unknown> }) =>
			approveMember(tenantId, memberId, data),
		onSuccess: () => queryClient.invalidateQueries({ queryKey: ['members'] }),
	});
}

export function useRejectMember(tenantId: string) {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: ({ memberId, data }: { memberId: string; data: Record<string, unknown> }) =>
			rejectMember(tenantId, memberId, data),
		onSuccess: () => queryClient.invalidateQueries({ queryKey: ['members'] }),
	});
}

export function useBatchApproveMembers(tenantId: string) {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (data: any) => batchApproveMembers(tenantId, data),
		onSuccess: () => queryClient.invalidateQueries({ queryKey: ['members'] }),
	});
}
