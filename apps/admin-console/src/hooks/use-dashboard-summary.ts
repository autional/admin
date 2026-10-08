'use client';

import { classifyQueryState, useAuthStore, type QueryState } from '@autional/shared';
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
	/**
	 * 角色数：未就绪（loading/error）为 undefined —— RC-B4-01 修「假 0」：
	 * 消费侧必须按 classifyQueryState 三态渲染（forbidden/error 不显数值），不得 `?? 0` 兜底。
	 */
	rolesCount?: number;
	activeSessionsCount: number;
	apiKeysCount: number;
	/**
	 * 密钥数：未就绪（loading/forbidden/error）为 undefined —— W2-03（U426）修「假 0」：
	 * 消费侧必须按 secretsState 三态渲染（forbidden/error 不显数值），不得 `?? 0` 兜底。
	 */
	secretsCount?: number;
	/** 密钥查询状态（classifyQueryState）；消费侧据此三态渲染（W2-03/U426）。 */
	secretsState: QueryState;
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
	// RC-B4-01：不再 `?? 0` —— error/未就绪时保持 undefined，由消费侧按三态渲染（假 0 根因锁）。
	const { data: rolesData } = useRoles();
	const rolesCount = rolesData?.total;

	const { data: activeSessions } = useActiveSessions();

	const { data: apiKeysData } = useAdminAuthApi_keysStats();
	const apiKeysCount = apiKeysData?.data?.total ?? apiKeysData?.total ?? 0;

	const {
		data: secretsData,
		isLoading: secretsLoading,
		error: secretsError,
	} = useQuery({
		queryKey: ['admin-secrets', { page_size: 1 }],
		staleTime: 60000,
		queryFn: async () => {
			const res = await adminSecrets({ page_size: 1 });
			return res ?? null;
		},
	});
	// W2-03（U426）：403（security_admin 视角恒无权限）曾因 `?? 0` 呈假 0；总数保持 undefined，状态交消费侧三态。
	const secretsCount = secretsData?.data?.total ?? secretsData?.total;
	const secretsState = classifyQueryState({
		isLoading: secretsLoading,
		error: secretsError,
		data: secretsData,
	});

	return {
		tenantName,
		memberCount,
		rolesCount,
		activeSessionsCount: activeSessions ?? 0,
		apiKeysCount,
		secretsCount,
		secretsState,
		isLoading: false,
	};
}
