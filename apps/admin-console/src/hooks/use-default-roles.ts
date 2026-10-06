'use client';

import { extractList } from '@autional/shared';
import { queryKeys } from '@/lib/query-keys';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getDefaultRoles, addDefaultRole, removeDefaultRole } from '@/lib/api.generated';

export interface DefaultRoleRecord {
	id: string;
	tenant_id?: string;
	role_id: string;
	priority?: number;
	created_at?: string;
}

export function useDefaultRoles() {
	return useQuery({
		queryKey: queryKeys.defaultRoles.all,
		staleTime: 30000,
		queryFn: async () => {
			const res = await getDefaultRoles();
			return extractList<DefaultRoleRecord>(res);
		},
	});
}

export function useAddDefaultRole() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (data: { roleId: string }) => addDefaultRole(data),
		onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.defaultRoles.all }),
	});
}

export function useRemoveDefaultRole() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (roleId: string) => removeDefaultRole(roleId),
		onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.defaultRoles.all }),
	});
}
