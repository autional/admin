'use client';

import { extractList, useCurrentTenantId } from '@autional/shared';
import { queryKeys } from '@/lib/query-keys';


import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
	getUserRoles,
	getUserPermissions,
	assignUserRoles,
	removeUserRoles,
	assignUserPermissions,
	revokeUserPermissions,
} from '@/lib/api.generated';
import type {
	AssignPermissionsRequest,
	AssignRolesRequest,
	RemoveRolesRequest,
} from '@autional/shared/generated/types';

export interface UserRole {
	id: string;
	code: string;
	name: string;
	description?: string;
}

export interface UserPermission {
	id: string;
	code: string;
	name: string;
	description?: string;
	category?: string;
}

export function useUserRoles(userId: string, enabled = true) {
	const tenantId = useCurrentTenantId() ?? '';
	return useQuery({
		queryKey: queryKeys.users.userRoles(tenantId, userId) as unknown as readonly unknown[],
		staleTime: 300_000,
		queryFn: async () => {
			const res = await getUserRoles(userId);
			return extractList<UserRole>(res);
		},
		enabled: !!userId && enabled,
	});
}

export function useUserPermissions(userId: string, enabled = true) {
	const tenantId = useCurrentTenantId() ?? '';
	return useQuery({
		queryKey: queryKeys.users.userPermissions(tenantId, userId) as unknown as readonly unknown[],
		staleTime: 300_000,
		queryFn: async () => {
			const res = await getUserPermissions(userId);
			return extractList<UserPermission>(res);
		},
		enabled: !!userId && enabled,
	});
}

export function useAssignUserRoles() {
	const tenantId = useCurrentTenantId() ?? '';
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: ({ userId, data }: { userId: string; data: AssignRolesRequest }) =>
			assignUserRoles(userId, data),
		onSuccess: (_data, { userId }) => {
			queryClient.invalidateQueries({
				queryKey: queryKeys.users.userRoles(tenantId, userId) as unknown as readonly unknown[],
			});
			queryClient.invalidateQueries({
				queryKey: queryKeys.users.userPermissions(
					tenantId,
					userId,
				) as unknown as readonly unknown[],
			});
		},
	});
}

export function useRemoveUserRoles() {
	const tenantId = useCurrentTenantId() ?? '';
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: ({ userId, data }: { userId: string; data: RemoveRolesRequest }) =>
			removeUserRoles(userId, data),
		onSuccess: (_data, { userId }) => {
			queryClient.invalidateQueries({
				queryKey: queryKeys.users.userRoles(tenantId, userId) as unknown as readonly unknown[],
			});
			queryClient.invalidateQueries({
				queryKey: queryKeys.users.userPermissions(
					tenantId,
					userId,
				) as unknown as readonly unknown[],
			});
		},
	});
}

export function useAssignUserPermissions() {
	const tenantId = useCurrentTenantId() ?? '';
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: ({ userId, data }: { userId: string; data: AssignPermissionsRequest }) =>
			assignUserPermissions(userId, data),
		onSuccess: (_data, { userId }) => {
			queryClient.invalidateQueries({
				queryKey: queryKeys.users.userPermissions(
					tenantId,
					userId,
				) as unknown as readonly unknown[],
			});
		},
	});
}

export function useRevokeUserPermissions() {
	const tenantId = useCurrentTenantId() ?? '';
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: ({ userId, data }: { userId: string; data: AssignPermissionsRequest }) =>
			revokeUserPermissions(userId, data),
		onSuccess: (_data, { userId }) => {
			queryClient.invalidateQueries({
				queryKey: queryKeys.users.userPermissions(
					tenantId,
					userId,
				) as unknown as readonly unknown[],
			});
		},
	});
}
