'use client';

import { extractList, useCurrentTenantId } from '@autional/shared';
import { queryKeys } from '@/lib/query-keys';


import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { deleteSession, getActiveSessionCount, getSessions } from '@/lib/api.generated';

export interface SessionRecord {
	id: string;
	userId: string;
	username?: string;
	// 根因修复 (2026-08-13): 后端字段为 ip（无 ipAddress）、device_type（无 device）、
	// geoip（无 location）、user_agent（无 browser）。接口字段对齐后端契约。
	ip?: string;
	ipAddress?: string;
	deviceType?: string;
	device?: string;
	browser?: string;
	userAgent?: string;
	geoip?: string;
	location?: string;
	riskScore?: number;
	createdAt?: string;
	lastActiveAt?: string;
}

export function useSessions() {
	const tenantId = useCurrentTenantId() ?? '';
	return useQuery({
		queryKey: queryKeys.sessions.all(tenantId),
		queryFn: async () => {
			const res = await getSessions();
			return extractList<SessionRecord>(res);
		},
	});
}

export function useActiveSessionCount() {
	const tenantId = useCurrentTenantId() ?? '';
	return useQuery({
		queryKey: queryKeys.sessions.activeCount(tenantId),
		queryFn: async ({ signal }) => {
			const res = await getActiveSessionCount(signal);
			return res?.count ?? 0;
		},
	});
}

export function useDeleteSession() {
	const tenantId = useCurrentTenantId() ?? '';
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (id: string) => deleteSession(id, {}),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: queryKeys.sessions.all(tenantId) });
			queryClient.invalidateQueries({ queryKey: queryKeys.sessions.activeCount(tenantId) });
		},
	});
}
