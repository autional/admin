'use client';

import { extractList } from '@autional/shared';
import { queryKeys } from '@/lib/query-keys';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
	getWebhooks,
	createWebhook,
	updateWebhook,
	deleteWebhook,
	testWebhook,
} from '@/lib/api.generated';
import * as Generated from '@autional/shared/generated/api';

export interface WebhookRecord {
	id: string;
	name: string;
	url: string;
	secret?: string;
	events: string[];
	status: 'active' | 'inactive';
	lastDeliveryStatus?: string;
	lastDeliveryAt?: string;
	retryPolicy?: { maxRetries: number; backoff: string };
}

/**
 * Webhook 投递日志（A-40：对齐后端 WebhookDeliveryLogResponse camel 化后的真实 wire 键
 * —— id/event_type/url/status_code/payload/response/error/duration_ms/attempt/status/request_id/created_at）。
 */
export interface DeliveryLog {
	id: string;
	eventType?: string;
	url?: string;
	statusCode?: number;
	payload?: string;
	response?: string;
	error?: string;
	durationMs?: number;
	attempt?: number;
	status?: string;
	requestId?: string;
	createdAt?: string;
}

export function useWebhooks(tenantId: string) {
	return useQuery({
		queryKey: queryKeys.webhooks.all(tenantId),
		staleTime: 60000,
		queryFn: async () => {
			const res = await getWebhooks(tenantId);
			const raw = Array.isArray(res) ? res : extractList<any>(res);
			const items = Array.isArray(raw) ? raw : [];
			return items.map((item: any) => ({
				...item,
				id: item.id ?? item.webhookId ?? item._id ?? '',
				events:
					typeof item.events === 'string'
						? (() => {
								try {
									return JSON.parse(item.events);
								} catch {
									return [];
								}
							})()
						: item.events || [],
				status: item.isActive ? 'active' : 'inactive',
			}));
		},
		enabled: !!tenantId,
	});
}

export function useCreateWebhook() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: ({ tenantId, data }: { tenantId: string; data: Record<string, unknown> }) =>
			createWebhook(tenantId, data),
		onSuccess: (_, vars) =>
			queryClient.invalidateQueries({ queryKey: queryKeys.webhooks.all(vars.tenantId) }),
	});
}

export function useUpdateWebhook() {
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
		}) => updateWebhook(tenantId, id, data),
		onSuccess: (_, vars) =>
			queryClient.invalidateQueries({ queryKey: queryKeys.webhooks.all(vars.tenantId) }),
	});
}

export function useDeleteWebhook() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: ({ tenantId, id }: { tenantId: string; id: string }) => deleteWebhook(tenantId, id),
		onSuccess: (_, vars) =>
			queryClient.invalidateQueries({ queryKey: queryKeys.webhooks.all(vars.tenantId) }),
	});
}

export function useTestWebhook() {
	return useMutation({
		mutationFn: ({ tenantId, id }: { tenantId: string; id: string }) => testWebhook(tenantId, id),
	});
}

export function useWebhookDeliveryLogs(tenantId: string, hookId: string) {
	return useQuery({
		queryKey: [...queryKeys.webhooks.all(tenantId), 'deliveries', hookId],
		queryFn: async () => {
			const res = await Generated.adminTenantsWebhooksDeliveriesByTenantsByWebhooks(
				tenantId,
				hookId,
				{},
			);
			return extractList<DeliveryLog>(res);
		},
		enabled: !!tenantId && !!hookId,
	});
}
