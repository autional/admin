'use client';

import { fromPageResult, toPageParams, useCurrentTenantId } from '@autional/shared';
import { queryKeys } from '@/lib/query-keys';


import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
	getAbacPolicies,
	createAbacPolicy,
	updateAbacPolicy,
	deleteAbacPolicy,
} from '@/lib/api.generated';

// TASK-AB2-09（A-132f）：模型 camel 化——响应拦截器已 snake→camel 深转换（client.ts:105
// camelCaseKeys），契约键直读；禁止 snake 直读（旧声明 tenant_id/created_at 为类型谎言）。
// wire 锚：service-identity dto/abac_dto.go:22-33 ABACPolicyResponse（tenant_id/created_at/updated_at）。
export interface ABACPolicy {
	id: string;
	tenantId: string;
	name: string;
	description: string;
	priority: number;
	condition: string;
	effect: 'allow' | 'deny';
	enabled: boolean;
	createdAt: string;
	updatedAt: string;
}

/** 查询入参（camel 书面；分页键经 toPageParams 单点转 wire snake）。 */
export interface AbacPoliciesQuery {
	page?: number;
	pageSize?: number;
}

export function useAbacPolicies(params?: AbacPoliciesQuery) {
	const tenantId = useCurrentTenantId() ?? '';
	return useQuery({
		queryKey: queryKeys.abacPolicies.list(tenantId, params),
		staleTime: 300000,
		queryFn: async ({ signal }) => {
			// A-136：服务端分页契约（toPageParams 单点转 wire page/page_size；旧实现无参调用 →
			// 后端默认 page_size=20 截断，21 条起永不可达）。响应侧 fromPageResult 归一 items/total。
			// spread 成对象字面量：PageParams 接口无索引签名，直传不满足 generated
			// Record<string, unknown> 形参（与 use-role-activations 同法）。
			const res = await getAbacPolicies(
				{ ...toPageParams({ page: params?.page, pageSize: params?.pageSize }) },
				signal,
			);
			const paged = fromPageResult<ABACPolicy>(res);
			return { items: paged.items, total: paged.total };
		},
	});
}

export function useCreateAbacPolicy() {
	const tenantId = useCurrentTenantId() ?? '';
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (data: any) => createAbacPolicy(data),
		onSuccess: () =>
			queryClient.invalidateQueries({ queryKey: queryKeys.abacPolicies.all(tenantId) }),
	});
}

export function useUpdateAbacPolicy() {
	const tenantId = useCurrentTenantId() ?? '';
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: ({ id, data }: { id: string; data: any }) => updateAbacPolicy(id, data),
		onSuccess: () =>
			queryClient.invalidateQueries({ queryKey: queryKeys.abacPolicies.all(tenantId) }),
	});
}

export function useDeleteAbacPolicy() {
	const tenantId = useCurrentTenantId() ?? '';
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (id: string) => deleteAbacPolicy(id),
		onSuccess: () =>
			queryClient.invalidateQueries({ queryKey: queryKeys.abacPolicies.all(tenantId) }),
	});
}
