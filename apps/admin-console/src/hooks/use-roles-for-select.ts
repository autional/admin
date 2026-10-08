'use client';

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { extractList, useCurrentTenantId } from '@autional/shared';
import { queryKeys } from '@/lib/query-keys';

import { getRoles } from '@/lib/api.generated';

interface RoleRecord {
	id: string;
	name?: string;
	code?: string;
}

export function useRolesForSelect() {
	const tenantId = useCurrentTenantId() ?? '';
	const { data: roles = [] } = useQuery({
		queryKey: queryKeys.roles.all(tenantId),
		staleTime: 60000,
		queryFn: async () => {
			const res = await getRoles();
			return extractList<RoleRecord>(res);
		},
	});

	return useMemo(
		() =>
			roles.map((r) => ({
				// A-160：值域取角色码（如 admin）——公告 target_roles 存「角色名/码」
				// （wire 锚 service-notification domain.go:208；集成测试 admin/manager），
				// 非角色 ULID；无码时降级回落 id 保可提交。
				value: r.code || r.id,
				label: r.name || r.code || r.id,
			})),
		[roles],
	);
}
