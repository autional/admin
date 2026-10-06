'use client';

import { useAuthStore } from '@autional/shared';
import { useAdminAuthApi_keysStats } from '@autional/shared/generated/queries';
import { useActiveSessions } from '@/hooks/use-users';
import { useRoles } from '@/hooks/use-roles';
import { useQuery } from '@tanstack/react-query';
import { adminSecrets } from '@autional/shared/generated/api';
import { getUsers } from '@/lib/api.generated';
import { queryKeys } from '@/lib/query-keys';

export interface TenantSummary {
	tenantName: string;
	memberCount: number;
	rolesCount: number;
	activeSessionsCount: number;
	apiKeysCount: number;
	secretsCount: number;
}

export function useTenantSummary(): TenantSummary & { isLoading: boolean } {
	const tenants = useAuthStore((s) => s.tenants);
	const currentTenantId = useAuthStore((s) => s.currentTenantId);

	const currentTenant = tenants.find((t) => t.id === currentTenantId);
	const tenantName = currentTenant?.name ?? 'My Tenant';

	// ADM-001: useUsers 只返回第一页数组（20 条）无法得知总数，
	// 改直调 getUsers({ limit: 1 }) 拿 API total（apiClient 已 unwrap {code,...} → {items,total,pagination}）。
	// 兼容三种返回形态：{items,total} / {data:{items,total}} / 直接 items 数组（此时取数组长度）。
	const { data: memberTotal } = useQuery({
		queryKey: queryKeys.users.list(currentTenantId ?? '', { limit: 1 }),
		queryFn: async ({ signal }) => {
			const res = await getUsers({ limit: 1 }, signal);
			const anyRes = res as any;
			if (Array.isArray(anyRes)) return anyRes.length;
			const nested = anyRes?.data;
			const total =
				anyRes?.total ??
				anyRes?.pagination?.total ??
				nested?.total ??
				nested?.pagination?.total;
			return typeof total === 'number' ? total : 0;
		},
	});
	const memberCount = typeof memberTotal === 'number' ? memberTotal : 0;

	// TASK-AB1-18：useRoles 改返回 { items, total }（服务端分页结果），总数直接取 total。
	const { data: rolesData } = useRoles();
	const rolesCount = rolesData?.total ?? 0;

	const { data: activeSessions } = useActiveSessions();

	const { data: apiKeysData } = useAdminAuthApi_keysStats();
	const apiKeysCount = apiKeysData?.data?.total ?? apiKeysData?.total ?? 0;

	const { data: secretsData } = useQuery({
		queryKey: ['admin-secrets', { page_size: 1 }],
		staleTime: 60000,
		queryFn: async () => {
			const res = await adminSecrets({ page_size: 1 });
			return res ?? null;
		},
	});
	const secretsCount = secretsData?.data?.total ?? secretsData?.total ?? 0;

	return {
		tenantName,
		memberCount,
		rolesCount,
		activeSessionsCount: activeSessions ?? 0,
		apiKeysCount,
		secretsCount,
		isLoading: false,
	};
}
