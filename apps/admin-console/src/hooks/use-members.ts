'use client';

import { extractList } from '@autional/shared';
import { queryKeys } from '@/lib/query-keys';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getMembers, inviteMember, updateMember, removeMember } from '@/lib/api.generated';

export interface MemberRecord {
	userId: string;
	username: string;
	email: string;
	role: 'admin' | 'member';
	status: string;
	joinedAt: string;
}

export function useMembers(tenantId: string) {
	return useQuery({
		queryKey: queryKeys.members.all(tenantId),
		queryFn: async () => {
			const res = await getMembers(tenantId);
			return extractList<MemberRecord>(res);
		},
		enabled: !!tenantId,
	});
}

export function useInviteMember() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: ({ tenantId, data }: { tenantId: string; data: Record<string, unknown> }) =>
			inviteMember(tenantId, data),
		onSuccess: (_, vars) =>
			queryClient.invalidateQueries({ queryKey: queryKeys.members.all(vars.tenantId) }),
	});
}

export function useUpdateMember() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: ({
			tenantId,
			userId,
			data,
		}: {
			tenantId: string;
			userId: string;
			data: Record<string, unknown>;
		}) => updateMember(tenantId, userId, data),
		onSuccess: (_, vars) =>
			queryClient.invalidateQueries({ queryKey: queryKeys.members.all(vars.tenantId) }),
	});
}

export function useRemoveMember() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: ({ tenantId, userId }: { tenantId: string; userId: string }) =>
			removeMember(tenantId, userId),
		onSuccess: (_, vars) =>
			queryClient.invalidateQueries({ queryKey: queryKeys.members.all(vars.tenantId) }),
	});
}
