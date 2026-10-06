'use client';

import { extractList, extractItem, useCurrentTenantId } from '@autional/shared';
import { queryKeys } from '@/lib/query-keys';


import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
	getRoleChildren,
	addRoleChild,
	removeRoleChild,
	getRoleParents,
	getRoleEffectivePermissions,
	cloneRole,
	requestApproval,
} from '@/lib/api.generated';

export interface ChildRoleInfo {
	id: string;
	code: string;
	name: string;
	description?: string;
}

export interface ParentRoleInfo {
	id: string;
	code: string;
	name: string;
}

export interface EffectivePermissionInfo {
	id: string;
	code: string;
	name: string;
	category: string;
	description?: string;
	inherited_from?: string;
}

export function useRoleChildren(roleId: string) {
	const tenantId = useCurrentTenantId() ?? '';
	return useQuery({
		queryKey: queryKeys.roles.children(tenantId, roleId),
		staleTime: 60000,
		queryFn: async () => {
			const res = await getRoleChildren(roleId);
			return extractList<ChildRoleInfo>(res);
		},
		enabled: !!roleId,
	});
}

export function useAddRoleChild() {
	const tenantId = useCurrentTenantId() ?? '';
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: ({ roleId, data }: { roleId: string; data: { childId: string } }) =>
			addRoleChild(roleId, data),
		onSuccess: (_data, vars) => {
			queryClient.invalidateQueries({ queryKey: queryKeys.roles.children(tenantId, vars.roleId) });
			queryClient.invalidateQueries({ queryKey: queryKeys.roles.all(tenantId) });
		},
	});
}

export function useRemoveRoleChild() {
	const tenantId = useCurrentTenantId() ?? '';
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: ({ roleId, childId }: { roleId: string; childId: string }) =>
			removeRoleChild(roleId, childId),
		onSuccess: (_data, vars) => {
			queryClient.invalidateQueries({ queryKey: queryKeys.roles.children(tenantId, vars.roleId) });
			queryClient.invalidateQueries({ queryKey: queryKeys.roles.all(tenantId) });
		},
	});
}

export function useRoleParents(roleId: string) {
	const tenantId = useCurrentTenantId() ?? '';
	return useQuery({
		queryKey: queryKeys.roles.parents(tenantId, roleId),
		staleTime: 60000,
		queryFn: async () => {
			const res = await getRoleParents(roleId);
			return extractList<ParentRoleInfo>(res);
		},
		enabled: !!roleId,
	});
}

export function useRoleEffectivePermissions(roleId: string) {
	const tenantId = useCurrentTenantId() ?? '';
	return useQuery({
		queryKey: queryKeys.roles.effectivePermissions(tenantId, roleId),
		staleTime: 60000,
		queryFn: async () => {
			const res = await getRoleEffectivePermissions(roleId);
			return extractList<EffectivePermissionInfo>(res);
		},
		enabled: !!roleId,
	});
}

export function useCloneRole() {
	const tenantId = useCurrentTenantId() ?? '';
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: ({ roleId, data }: { roleId: string; data: { code: string; name: string } }) =>
			cloneRole(roleId, data),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: queryKeys.roles.all(tenantId) });
		},
	});
}

export function useRequestApproval() {
	const tenantId = useCurrentTenantId() ?? '';
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: ({ roleId, data }: { roleId: string; data: any }) => requestApproval(roleId, data),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: queryKeys.approvalRequests.all(tenantId) });
		},
	});
}
