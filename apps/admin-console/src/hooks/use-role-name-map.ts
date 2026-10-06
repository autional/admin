'use client';

import { useQuery } from '@tanstack/react-query';
import { extractList, useCurrentTenantId } from '@autional/shared';
import { queryKeys } from '@/lib/query-keys';

import { getRoles } from '@/lib/api.generated';

interface RoleRecord {
	id: string;
	name?: string;
	code?: string;
}

export function useRoleNameMap() {
	const tenantId = useCurrentTenantId() ?? '';
	return useQuery({
		queryKey: queryKeys.roles.all(tenantId),
		staleTime: 60000,
		queryFn: async () => {
			const res = await getRoles();
			const roles = extractList<RoleRecord>(res);
			const map = new Map<string, string>();
			for (const r of roles) {
				map.set(r.id, r.name || r.code || r.id);
			}
			return map;
		},
	});
}
