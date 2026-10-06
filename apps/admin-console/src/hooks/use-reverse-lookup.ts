'use client';

import { useQuery } from '@tanstack/react-query';
import { extractList } from '@autional/shared';
import { queryKeys } from '@/lib/query-keys';
import { getRoleUsers, getPermissionUsers, getPermissionRoles } from '@/lib/api.generated';

export function useRoleUsers(roleId: string | undefined) {
	return useQuery({
		queryKey: queryKeys.reverseLookup.roleUsers(roleId || ''),
		queryFn: async () => {
			if (!roleId) return [];
			const res = await getRoleUsers(roleId);
			return extractList<{ user_id: string }>(res);
		},
		enabled: !!roleId,
		staleTime: 30000,
	});
}

export function usePermissionUsers(permissionId: string | undefined) {
	return useQuery({
		queryKey: queryKeys.reverseLookup.permissionUsers(permissionId || ''),
		queryFn: async () => {
			if (!permissionId) return [];
			const res = await getPermissionUsers(permissionId);
			return extractList<{ user_id: string }>(res);
		},
		enabled: !!permissionId,
		staleTime: 30000,
	});
}

export function usePermissionRoles(permissionId: string | undefined) {
	return useQuery({
		queryKey: queryKeys.reverseLookup.permissionRoles(permissionId || ''),
		queryFn: async () => {
			if (!permissionId) return [];
			const res = await getPermissionRoles(permissionId);
			return extractList<{ id: string; name?: string; code?: string }>(res);
		},
		enabled: !!permissionId,
		staleTime: 30000,
	});
}
