'use client';

import { extractList, useCurrentTenantId } from '@autional/shared';
import { queryKeys } from '@/lib/query-keys';


import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
	getApprovalRequests,
	approveApprovalRequest,
	rejectApprovalRequest,
} from '@/lib/api.generated';

export interface ApprovalRequestRecord {
	id: string;
	userId?: string;
	requesterName?: string;
	roleName?: string;
	action?: string;
	status?: string;
	reason?: string;
	approvedAt?: string;
	createdAt?: string;
}

export function useApprovalRequests(status?: string) {
	const tenantId = useCurrentTenantId() ?? '';
	const params: Record<string, string> = {};
	if (status && status !== 'all') {
		params.status = status;
	}
	return useQuery({
		queryKey: [...queryKeys.approvalRequests.all(tenantId), { status }],
		staleTime: 30000,
		queryFn: async ({ signal }) => {
			const res = await getApprovalRequests(params, signal);
			return extractList<ApprovalRequestRecord>(res);
		},
	});
}

export function useApproveApprovalRequest() {
	const tenantId = useCurrentTenantId() ?? '';
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: ({ id, reason }: { id: string; reason?: string }) =>
			approveApprovalRequest(id, reason),
		onSuccess: () =>
			queryClient.invalidateQueries({ queryKey: queryKeys.approvalRequests.all(tenantId) }),
	});
}

export function useRejectApprovalRequest() {
	const tenantId = useCurrentTenantId() ?? '';
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: ({ id, reason }: { id: string; reason: string }) =>
			rejectApprovalRequest(id, reason),
		onSuccess: () =>
			queryClient.invalidateQueries({ queryKey: queryKeys.approvalRequests.all(tenantId) }),
	});
}
