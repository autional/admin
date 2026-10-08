'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { fromPageResult, toPageParams } from '@autional/shared';
import { queryKeys } from '@/lib/query-keys';
import {
	getApiKeys,
	createApiKey,
	getApiKey,
	deleteApiKey,
	rotateApiKey,
	updateApiKeyScopes,
	updateApiKeyStatus,
} from '@/lib/api.generated';

export interface ApiKeyRecord {
	id: string;
	name: string;
	scopes: string[];
	status: string;
	environment?: string;
	lastUsedAt?: string;
	lastUsedIp?: string;
	usageCount?: number;
	expiresAt?: string;
	createdAt?: string;
	tenantId?: string;
	userId?: string;
}

/** 查询入参（camel 书面；分页键经 toPageParams 单点转 wire snake）。 */
export interface ApiKeysQuery {
	page?: number;
	pageSize?: number;
	status?: string;
	environment?: string;
	search?: string;
}

/** api-keys 列表页结果（A-52：服务端分页驱动，total 来自服务端分页结果）。 */
export interface ApiKeyListResult {
	items: ApiKeyRecord[];
	total: number;
}

export function useApiKeys(params?: ApiKeysQuery) {
	return useQuery({
		queryKey: queryKeys.apiKeys.all(params),
		staleTime: 300000,
		queryFn: async () => {
			// A-52：请求侧 toPageParams（page/page_size）+ status/environment/search 筛选透传
			// （后端 authApiKeys 参数齐备）；响应侧 fromPageResult 归一 items/total。
			const res = await getApiKeys({
				...toPageParams({ page: params?.page, pageSize: params?.pageSize }),
				...(params?.status ? { status: params.status } : {}),
				...(params?.environment ? { environment: params.environment } : {}),
				...(params?.search ? { search: params.search } : {}),
			});
			const page = fromPageResult<ApiKeyRecord>(res);
			return { items: page.items, total: page.total } as ApiKeyListResult;
		},
	});
}

export function useApiKeyDetail(id: string) {
	return useQuery({
		queryKey: queryKeys.apiKeys.detail(id),
		queryFn: () => getApiKey(id),
		enabled: !!id,
	});
}

export function useCreateApiKey() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (data: Record<string, unknown>) => createApiKey(data),
		onSuccess: () => queryClient.invalidateQueries({ queryKey: ['api-keys'] }),
	});
}

export function useDeleteApiKey() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (id: string) => deleteApiKey(id),
		onSuccess: () => queryClient.invalidateQueries({ queryKey: ['api-keys'] }),
	});
}

export function useRotateApiKey() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (id: string) => rotateApiKey(id),
		onSuccess: () => queryClient.invalidateQueries({ queryKey: ['api-keys'] }),
	});
}

export function useUpdateApiKeyScopes() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: ({ id, scopes }: { id: string; scopes: string[] }) =>
			updateApiKeyScopes(id, scopes),
		onSuccess: () => queryClient.invalidateQueries({ queryKey: ['api-keys'] }),
	});
}

export function useUpdateApiKeyStatus() {
	const queryClient = useQueryClient();
	return useMutation({
		// A-53：请求体契约修正 —— 后端 UpdateApiKeyStatusRequest 为 `{status}` 对象
		//（binding required,oneof=active inactive）；旧实现发裸字符串必 400。
		mutationFn: ({ id, status }: { id: string; status: 'active' | 'inactive' }) =>
			updateApiKeyStatus(id, { status }),
		onSuccess: () => queryClient.invalidateQueries({ queryKey: ['api-keys'] }),
	});
}
