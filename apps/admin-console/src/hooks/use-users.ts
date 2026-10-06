'use client';

import {
	extractItem,
	fromPageResult,
	toPageParams,
	useCurrentTenantId,
} from '@autional/shared';
import { queryKeys } from '@/lib/query-keys';


import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
	getUsers,
	getUser,
	createUser,
	updateUser,
	deleteUser,
	updateUserStatus,
	unlockUser,
	resetUserPassword,
	resetUserMFA,
	getActiveSessionCount,
} from '@/lib/api.generated';

export interface UserRecord {
	id: string;
	username: string;
	email: string;
	status: string;
	createdAt: string;
	mustChangePassword?: boolean;
	passwordChangedAt?: string;
	passwordStatus?: 'normal' | 'expiring' | 'expired' | 'must_change';
}

export interface UserDetail {
	id: string;
	username: string;
	email: string;
	status: string;
	createdAt: string;
	lastLoginAt?: string;
	mfaEnabled?: boolean;
}

/** users 列表页结果（H008：total 由服务端分页结果驱动，无独立二次请求）。 */
export interface UserListResult {
	items: UserRecord[];
	total: number;
}

/** 查询入参（camel 书面；分页键经 toPageParams 单点转 wire snake）。 */
export interface UsersQuery {
	search?: string;
	page?: number;
	pageSize?: number;
}

/** 响应已被 api/client.ts 响应拦截器深 camel 化：契约键直读，无 snake 双读兼容。 */
function derivePasswordStatus(u: Record<string, unknown>): 'normal' | 'must_change' {
	if (u.mustChangePassword) return 'must_change';
	if (!u.passwordChangedAt) return 'must_change';
	return 'normal';
}

function toUserRecord(u: Record<string, unknown>): UserRecord {
	return {
		id: String(u.id ?? ''),
		username: (u.username as string) ?? '',
		email: (u.email as string) ?? '',
		status: (u.status as string) ?? '',
		createdAt: (u.createdAt as string) ?? '',
		mustChangePassword: u.mustChangePassword as boolean,
		passwordChangedAt: (u.passwordChangedAt as string) ?? undefined,
		passwordStatus: derivePasswordStatus(u),
	};
}

export function useUsers(params?: UsersQuery) {
	const tenantId = useCurrentTenantId() ?? '';
	return useQuery({
		queryKey: queryKeys.users.list(tenantId, params),
		queryFn: async ({ signal }) => {
			// 请求侧：分页键经 toPageParams 单点产出 wire snake（page/page_size，H008）；
			// 响应侧：items/total 经 fromPageResult 单点归一（拦截器已 camel 化+解包信封）。
			const res = await getUsers(
				{ search: params?.search, ...toPageParams({ page: params?.page, pageSize: params?.pageSize }) },
				signal,
			);
			const page = fromPageResult<Record<string, unknown>>(res);
			return { items: page.items.map(toUserRecord), total: page.total } as UserListResult;
		},
	});
}

export function useActiveSessions() {
	const tenantId = useCurrentTenantId() ?? '';
	return useQuery({
		queryKey: queryKeys.users.activeSessions(tenantId),
		queryFn: async ({ signal }) => {
			const res = await getActiveSessionCount(signal);
			return res?.count ?? 0;
		},
	});
}

export function useUser(id: string) {
	const tenantId = useCurrentTenantId() ?? '';
	return useQuery({
		queryKey: queryKeys.users.detail(tenantId, id),
		queryFn: async ({ signal }) => {
			const res = await getUser(id, signal);
			const item = extractItem<Record<string, unknown>>(res);
			// 后端详情响应为 { data: { user: {...}, identities: [...] } }，
			// 兼容扁平 { data: {...} } 两种形状（真实 API 为嵌套 user 对象）
			const detail = (item?.user ?? item) as UserDetail | null;
			return detail;
		},
		enabled: !!id,
	});
}

export function useCreateUser() {
	const tenantId = useCurrentTenantId() ?? '';
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (data: Record<string, unknown>) => createUser(data),
		onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.users.all(tenantId) }),
	});
}

export function useUpdateUser() {
	const tenantId = useCurrentTenantId() ?? '';
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: ({ id, data }: { id: string; data: Record<string, unknown> }) =>
			updateUser(id, data),
		onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.users.all(tenantId) }),
	});
}

export function useDeleteUser() {
	const tenantId = useCurrentTenantId() ?? '';
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (id: string) => deleteUser(id),
		onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.users.all(tenantId) }),
	});
}
