'use client';

import { fromPageResult, toPageParams } from '@autional/shared';
import { queryKeys } from '@/lib/query-keys';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getRoleActivations, revokeActivation } from '@/lib/api.generated';

// RC-5（TASK-AB1-27 补）：契约键 camel 直读（响应拦截器已 snake→camel），禁止 snake 双读。
// wire 锚：service-rbac interfaces.go:134-138 / dto.go:126（user_id/role_id/expire_at/created_at snake json tag）。
// A-141f（TASK-AB2-17 / ADR-B2-03）：状态枚举实读微共享 pim 包三常量
// （service-share/micro-share/pim/role_activation.go:13-15 active/expired/revoked，创建即 Active）；
// approve 为假成功桩，后端路由/handler/DTO 已删（TASK-AB2-16），前端无批准链路。
export interface RoleActivation {
	id: string;
	tenantId: string;
	userId: string;
	roleId: string;
	status: 'active' | 'revoked' | 'expired';
	justification: string;
	activatedAt: string;
	expireAt: string;
	revokedAt: string;
	createdAt: string;
}

/** 查询入参（camel 书面；分页键经 toPageParams 单点转 wire snake）。 */
export interface RoleActivationsQuery {
	status?: string;
	page?: number;
	pageSize?: number;
}

export function useRoleActivations(params?: RoleActivationsQuery) {
	const status = params?.status && params.status !== 'all' ? params.status : undefined;
	return useQuery({
		queryKey: queryKeys.roleActivations.list({
			status,
			page: params?.page,
			pageSize: params?.pageSize,
		}),
		staleTime: 30000,
		queryFn: async () => {
			// A-144：服务端分页契约（toPageParams 单点转 wire page/page_size；旧实现无 page 参 →
			// 后端默认 page_size=20 截断，第 21+ 条永不可达）。响应侧 fromPageResult 归一 items/total。
			const res = await getRoleActivations({
				...toPageParams({ page: params?.page, pageSize: params?.pageSize }),
				...(status ? { status } : {}),
			});
			const paged = fromPageResult<RoleActivation>(res);
			return { items: paged.items, total: paged.total };
		},
	});
}

export function useRevokeActivation() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: ({ id, reason }: { id: string; reason: string }) => revokeActivation(id, reason),
		onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.roleActivations.all }),
	});
}
