'use client';

import { extractListResult, extractItem, useCurrentTenantId } from '@autional/shared';
import { queryKeys } from '@/lib/query-keys';


import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
	getAuditLogs,
	getAuditLogDetail,
	getAuditStats,
	verifyAuditChain,
	exportAuditLogs,
} from '@/lib/api.generated';

export interface AuditLogRecord {
	id: string;
	timestamp: number;
	operatorId: string;
	operatorType: string;
	action: string;
	module: string;
	level: string;
	message: string;
	targetId: string;
	targetType: string;
	status: number;
	ip: string;
	duration: number;
	sequence: number;
	requestId: string;
	tenantId: string;
	appId: string;
	userAgent: string;
	metadata?: Record<string, unknown>;
}

export interface AuditStats {
	alerts?: number;
	pending?: number;
}

export type AuditLogDetail = Record<string, unknown>;

export function useAuditLogs(params?: Record<string, unknown>) {
	const tenantId = useCurrentTenantId() ?? '';
	return useQuery({
		queryKey: queryKeys.auditLogs.all(tenantId, params),
		queryFn: async ({ signal }) => {
			const res = await getAuditLogs(params, signal);
			return extractListResult<AuditLogRecord>(res);
		},
	});
}

export function useAuditStats() {
	const tenantId = useCurrentTenantId() ?? '';
	return useQuery({
		queryKey: queryKeys.auditLogs.stats(tenantId),
		queryFn: async ({ signal }) => {
			const res = await getAuditStats(signal);
			return extractItem<AuditStats>(res) ?? ({} as AuditStats);
		},
	});
}

export function useAuditLogDetail(id: string) {
	const tenantId = useCurrentTenantId() ?? '';
	return useQuery({
		queryKey: queryKeys.auditLogs.detail(tenantId, id),
		queryFn: async ({ signal }) => {
			const res = await getAuditLogDetail(id, signal);
			return extractItem<AuditLogDetail>(res);
		},
		enabled: !!id,
	});
}

export function useVerifyAuditChain() {
	return useMutation({
		mutationFn: (data: Record<string, unknown>) => verifyAuditChain(data),
	});
}

export function useExportAuditLogs() {
	return useMutation({
		mutationFn: (data: Record<string, unknown>) => exportAuditLogs(data),
	});
}
