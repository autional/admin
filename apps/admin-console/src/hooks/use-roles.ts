'use client';

import { queryKeys } from '@/lib/query-keys';


import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
	extractList,
	extractItem,
	fromPageResult,
	toPageParams,
	useCurrentTenantId,
} from '@autional/shared';
import {
	getRoles,
	getRole,
	createRole,
	updateRole,
	deleteRole,
	getRolePermissions,
	assignRolePermissions,
	removeRolePermissions,
} from '@/lib/api.generated';

export interface RoleRecord {
	id: string;
	code: string;
	name: string;
	description: string;
	// TASK-AB1-27（RC-5 契约收敛）：契约键 camel 直读（拦截器深 camel 化）。
	// wire 锚：service-rbac/internal/handler/dto/dto.go:18（json data_scope）
	dataScope: string;
	permissionCount?: number;
}

/** roles 列表页结果（A-17：服务端分页驱动，total 来自服务端分页结果）。 */
export interface RoleListResult {
	items: RoleRecord[];
	total: number;
}

/** 查询入参（camel 书面；分页键经 toPageParams 单点转 wire snake）。 */
export interface RolesQuery {
	page?: number;
	pageSize?: number;
}

export type RoleDetail = Record<string, unknown>;

export type RolePermission = Record<string, unknown>;

export function useRoles(params?: RolesQuery) {
	const tenantId = useCurrentTenantId() ?? '';
	return useQuery({
		queryKey: queryKeys.roles.list(tenantId, params),
		staleTime: 300000,
		queryFn: async ({ signal }) => {
			// TASK-AB1-18 / A-17：请求侧 toPageParams（page/page_size），响应侧 fromPageResult 归一
			// items/total。后端 permission_count 已由响应拦截器深 camel 化，契约键直读（无 snake 双读）。
			const res = await getRoles(
				{ ...toPageParams({ page: params?.page, pageSize: params?.pageSize }) },
				signal,
			);
			const page = fromPageResult<RoleRecord>(res);
			const items = page.items.map((r) => ({
				...r,
				permissionCount: typeof r.permissionCount === 'number' ? r.permissionCount : 0,
			}));
			return { items, total: page.total } as RoleListResult;
		},
	});
}

export function useRole(id: string) {
	const tenantId = useCurrentTenantId() ?? '';
	return useQuery({
		queryKey: queryKeys.roles.detail(tenantId, id),
		staleTime: 300000,
		queryFn: async ({ signal }) => {
			const res = await getRole(id, signal);
			return extractItem<RoleDetail>(res) ?? res;
		},
		enabled: !!id,
	});
}

export function useCreateRole() {
	const tenantId = useCurrentTenantId() ?? '';
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (data: any) => createRole(data),
		onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.roles.all(tenantId) }),
	});
}

export function useUpdateRole() {
	const tenantId = useCurrentTenantId() ?? '';
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: ({ id, data }: { id: string; data: any }) => updateRole(id, data),
		onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.roles.all(tenantId) }),
	});
}

export function useDeleteRole() {
	const tenantId = useCurrentTenantId() ?? '';
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (roleId: string) => deleteRole(roleId),
		onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.roles.all(tenantId) }),
	});
}

export function useRolePermissions(roleId: string) {
	const tenantId = useCurrentTenantId() ?? '';
	return useQuery({
		queryKey: queryKeys.roles.permissions(tenantId, roleId),
		staleTime: 300000,
		queryFn: async ({ signal }) => {
			const res = await getRolePermissions(roleId, signal);
			return extractList<RolePermission>(res);
		},
		enabled: !!roleId,
	});
}

export function useAssignRolePermissions() {
	const tenantId = useCurrentTenantId() ?? '';
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: ({ roleId, data }: { roleId: string; data: any }) =>
			assignRolePermissions(roleId, data),
		onSuccess: () =>
			queryClient.invalidateQueries({
				queryKey: queryKeys.roles.all(tenantId) as unknown as readonly unknown[],
			}),
	});
}

export function useRemoveRolePermissions() {
	const tenantId = useCurrentTenantId() ?? '';
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: ({ roleId, data }: { roleId: string; data: any }) =>
			removeRolePermissions(roleId, data),
		onSuccess: () =>
			queryClient.invalidateQueries({
				queryKey: queryKeys.roles.all(tenantId) as unknown as readonly unknown[],
			}),
	});
}
