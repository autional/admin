'use client';

import { extractList, extractItem } from '@autional/shared';
import { queryKeys } from '@/lib/query-keys';
import type {
	CommunicationDashboardResponse,
	MessageTemplateResponse,
	TemplateResponse,
} from '@autional/shared/generated/types';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
	getCommunicationLogs,
	getCommunicationDashboard,
	getCommunicationHealth,
	getCommunicationTemplates,
	getCommunicationTemplateStats,
	getCommunicationProviders,
	createCommunicationTemplate,
	updateCommunicationTemplate,
	deleteCommunicationTemplate,
	cloneCommunicationTemplateToLocale,
	createCommunicationProvider,
	updateCommunicationProvider,
	deleteCommunicationProvider,
} from '@/lib/api.generated';
import * as Generated from '@autional/shared/generated/api';

interface LogRecord {
	id: string;
	channel: string;
	recipient: string;
	status: string;
	sentAt: string;
}

interface ChannelStats {
	[key: string]: unknown;
}

interface CommunicationProvider {
	[key: string]: unknown;
}

export function useCommunicationDashboard() {
	return useQuery({
		queryKey: queryKeys.communication.dashboard,
		staleTime: 30000,
		queryFn: async () => {
			const res = await getCommunicationDashboard();
			const data = extractItem<CommunicationDashboardResponse>(res);
			return (
				data ?? {
					totalSent: 0,
					delivered: 0,
					failed: 0,
					deliveryRate: 0,
					byChannel: {},
					byStatus: {},
				}
			);
		},
	});
}

export function useMessageLogs() {
	return useQuery({
		queryKey: queryKeys.communication.logs,
		queryFn: async () => {
			const res = await getCommunicationLogs();
			return extractList<LogRecord>(res);
		},
	});
}

export function useChannelStats() {
	return useQuery({
		queryKey: queryKeys.communication.stats,
		queryFn: async () => {
			try {
				const res = await getCommunicationHealth('email');
				return extractItem<ChannelStats>(res) ?? ({} as ChannelStats);
			} catch {
				return {};
			}
		},
	});
}

export function useCommunicationProviders() {
	return useQuery({
		queryKey: queryKeys.communication.providers,
		staleTime: 60000,
		queryFn: async () => {
			try {
				// U316：改接 admin 面（user 面在 admin 平面被入口平面门禁拒 403）
				const res = await Generated.adminCommunicationProviders();
				return extractList<CommunicationProvider>(res);
			} catch {
				return [];
			}
		},
	});
}

export function useSaveCommunicationProvider() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: async ({
			id,
			channel,
			data,
		}: {
			id?: string;
			channel: string;
			data: Record<string, unknown>;
		}) => {
			// A-177：update 契约仅接受 {config, is_active, priority}，merge channel 会 400 "no fields to update"。
			if (id) {
				return updateCommunicationProvider(id, data);
			}
			return createCommunicationProvider({ ...data, channel });
		},
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: queryKeys.communication.providers });
		},
	});
}

export function useCommunicationTemplates(params?: Record<string, unknown>) {
	return useQuery({
		queryKey: queryKeys.communication.templates(params),
		staleTime: 60000,
		queryFn: async () => {
			const res = await getCommunicationTemplates(
				params as Parameters<typeof getCommunicationTemplates>[0],
			);
			return extractList<TemplateResponse>(res);
		},
	});
}

export function useCommunicationTemplateStats() {
	return useQuery({
		queryKey: queryKeys.communication.templateStats,
		staleTime: 60000,
		queryFn: async () => {
			const res = await getCommunicationTemplateStats();
			return extractList<Record<string, unknown>>(res);
		},
	});
}

export function useCreateCommunicationTemplate() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: createCommunicationTemplate,
		onSuccess: () => queryClient.invalidateQueries({ queryKey: ['communication', 'templates'] }),
	});
}

export function useUpdateCommunicationTemplate() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: ({ id, data }: { id: string; data: Record<string, unknown> }) =>
			updateCommunicationTemplate(id, data),
		onSuccess: () => queryClient.invalidateQueries({ queryKey: ['communication', 'templates'] }),
	});
}

export function useDeleteCommunicationTemplate() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: deleteCommunicationTemplate,
		onSuccess: () => queryClient.invalidateQueries({ queryKey: ['communication', 'templates'] }),
	});
}

export function useCloneCommunicationTemplate() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: ({ id, data }: { id: string; data: Record<string, unknown> }) =>
			cloneCommunicationTemplateToLocale(id, data),
		onSuccess: () => queryClient.invalidateQueries({ queryKey: ['communication', 'templates'] }),
	});
}

export function useCommunicationProvidersList() {
	return useQuery({
		queryKey: queryKeys.communication.providers,
		staleTime: 60000,
		queryFn: async () => {
			const res = await getCommunicationProviders();
			return extractList<Record<string, unknown>>(res);
		},
	});
}

export function useCreateCommunicationProvider() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: createCommunicationProvider,
		onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.communication.providers }),
	});
}

export function useUpdateCommunicationProvider() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: ({ id, data }: { id: string; data: Record<string, unknown> }) =>
			updateCommunicationProvider(id, data),
		onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.communication.providers }),
	});
}

export function useDeleteCommunicationProvider() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: deleteCommunicationProvider,
		onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.communication.providers }),
	});
}
