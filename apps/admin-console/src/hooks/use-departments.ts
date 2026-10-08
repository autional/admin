'use client';

import { extractList } from '@autional/shared';
import { queryKeys } from '@/lib/query-keys';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
	getDepartments,
	createDepartment,
	updateDepartment,
	deleteDepartment,
} from '@/lib/api.generated';

export interface DepartmentRecord {
	id: string;
	name: string;
	code?: string;
	parentId: string | null;
	memberCount?: number;
	children?: DepartmentRecord[];
}

export function useDepartments(tenantId: string) {
	return useQuery({
		queryKey: queryKeys.departments.all(tenantId),
		staleTime: 300000,
		queryFn: async () => {
			const res = await getDepartments(tenantId);
			const list = extractList<Record<string, unknown>>(res);
			// API 返回 department_id/members_count/parent_id（camelCase 后 departmentId/membersCount/parentId），
			// 映射为页面期望的 id/memberCount/parentId 字段
			return list.map((r) => ({
				id: (r.departmentId ?? r.id) as string,
				name: (r.name as string) || '',
				code: (r.code as string) || undefined,
				parentId: (r.parentId ?? null) as string | null,
				memberCount: (r.membersCount ?? 0) as number,
			})) as DepartmentRecord[];
		},
		enabled: !!tenantId,
	});
}

export function useCreateDepartment() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: ({ tenantId, data }: { tenantId: string; data: Record<string, unknown> }) =>
			createDepartment(tenantId, data),
		onSuccess: (_, vars) =>
			queryClient.invalidateQueries({ queryKey: queryKeys.departments.all(vars.tenantId) }),
	});
}

export function useUpdateDepartment() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: ({
			tenantId,
			id,
			data,
		}: {
			tenantId: string;
			id: string;
			data: Record<string, unknown>;
		}) => updateDepartment(tenantId, id, data),
		onSuccess: (_, vars) =>
			queryClient.invalidateQueries({ queryKey: queryKeys.departments.all(vars.tenantId) }),
	});
}

export function useDeleteDepartment() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: ({ tenantId, id }: { tenantId: string; id: string }) =>
			deleteDepartment(tenantId, id),
		onSuccess: (_, vars) =>
			queryClient.invalidateQueries({ queryKey: queryKeys.departments.all(vars.tenantId) }),
	});
}
