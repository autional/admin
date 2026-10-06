'use client';

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { extractList, useCurrentTenantId } from '@autional/shared';
import { queryKeys } from '@/lib/query-keys';

import { getPermissions } from '@/lib/api.generated';

interface PermissionRecord {
	id: string;
	name?: string;
	code?: string;
}

export function usePermissionsForSelect() {
	const tenantId = useCurrentTenantId() ?? '';
	const { data: perms = [] } = useQuery({
		queryKey: queryKeys.permissions.all(tenantId),
		staleTime: 60000,
		queryFn: async () => {
			const res = await getPermissions();
			return extractList<PermissionRecord>(res);
		},
	});

	return useMemo(
		() =>
			perms.map((p) => ({
				value: p.id,
				label: p.name || p.code || p.id,
			})),
		[perms],
	);
}
