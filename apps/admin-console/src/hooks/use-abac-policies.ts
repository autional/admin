'use client';

import { extractList, useCurrentTenantId } from '@autional/shared';
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

export function useAbacPolicies() {
	const tenantId = useCurrentTenantId() ?? '';
	return useQuery({
		queryKey: queryKeys.abacPolicies.all(tenantId),
		staleTime: 300000,
		queryFn: async ({ signal }) => {
			const res = await getAbacPolicies(undefined, signal);
			return extractList<ABACPolicy>(res);
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
