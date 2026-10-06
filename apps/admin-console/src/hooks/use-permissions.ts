'use client';

import { fromPageResult, toPageParams, useCurrentTenantId } from '@autional/shared';
import { queryKeys } from '@/lib/query-keys';


import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
	getPermissions,
	createPermission,
	updatePermission,
	deletePermission,
} from '@/lib/api.generated';

export interface PermissionItem {
	id: string;
	code: string;
	name: string;
	description: string;
	category: string;
}

/** permissions 列表页结果（A-14：服务端分页驱动，total 来自服务端分页结果）。 */
export interface PermissionListResult {
	items: PermissionItem[];
	total: number;
}

/** 查询入参（camel 书面；分页键经 toPageParams 单点转 wire snake）。 */
export interface PermissionsQuery {
	page?: number;
	pageSize?: number;
}

export function usePermissions(params?: PermissionsQuery) {
	const tenantId = useCurrentTenantId() ?? '';
	return useQuery({
		queryKey: queryKeys.permissions.list(tenantId, params),
		staleTime: 300000,
		queryFn: async ({ signal }) => {
			// TASK-AB1-18 / A-14：请求侧 toPageParams（page/page_size），响应侧 fromPageResult 归一
			// items/total（拦截器已 camel 化 + 解包信封）。
			const res = await getPermissions(
				{ ...toPageParams({ page: params?.page, pageSize: params?.pageSize }) },
				signal,
			);
			const page = fromPageResult<PermissionItem>(res);
			return { items: page.items, total: page.total } as PermissionListResult;
		},
	});
}

export function useCreatePermission() {
	const tenantId = useCurrentTenantId() ?? '';
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (data: any) => createPermission(data),
		onSuccess: () =>
			queryClient.invalidateQueries({ queryKey: queryKeys.permissions.all(tenantId) }),
	});
}

export function useUpdatePermission() {
	const tenantId = useCurrentTenantId() ?? '';
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: ({ id, data }: { id: string; data: any }) => updatePermission(id, data),
		onSuccess: () =>
			queryClient.invalidateQueries({ queryKey: queryKeys.permissions.all(tenantId) }),
	});
}

export function useDeletePermission() {
	const tenantId = useCurrentTenantId() ?? '';
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (permissionId: string) => deletePermission(permissionId),
		onSuccess: () =>
			queryClient.invalidateQueries({ queryKey: queryKeys.permissions.all(tenantId) }),
	});
}
