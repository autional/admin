'use client';

import { extractList, extractItem, fromPageResult, toPageParams } from '@autional/shared';
import { queryKeys } from '@/lib/query-keys';
import type {
	CommunicationDashboardResponse,
	TemplateResponse,
} from '@autional/shared/generated/types';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
	getCommunicationLogs,
	getCommunicationDashboard,
	getCommunicationTemplates,
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
	// A-179：失败行 SentAt 为空（后端 CommunicationLogResponse.SentAt omitempty），
	// 发送时间列回退读 CreatedAt（恒有值，wire 锚：service-communication dto CreatedAt）。
	createdAt?: string;
}

interface CommunicationProvider {
	[key: string]: unknown;
}

// A-182：仪表盘时间窗接线（days 入 queryKey 与 wire；后端默认窗口保持不传即用）。
export function useCommunicationDashboard(days?: number) {
	return useQuery({
		queryKey: queryKeys.communication.dashboard(days),
		staleTime: 30000,
		queryFn: async () => {
			const res = await getCommunicationDashboard(days ? { days } : undefined);
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

// A-181（[删]）：useChannelStats 已删（死取数——页面仅声明未消费 stats，
// 且仅取 email 单渠道名不副实）。queryKeys.communication.stats 同步删。

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

/** 查询入参（camel 书面；分页键经 toPageParams 单点转 wire snake）。
 *  wire 锚：adminCommunicationTemplates({channel?, is_active?, keyword?, page?, page_size?})。 */
export interface CommunicationTemplatesQuery {
	channel?: string;
	isActive?: boolean;
	keyword?: string;
	page?: number;
	pageSize?: number;
}

// A-186：服务端分页/筛选接线（原实现无参调用 → 后端默认页截断，筛选面缺失）。
export function useCommunicationTemplates(params?: CommunicationTemplatesQuery) {
	return useQuery({
		queryKey: queryKeys.communication.templates(params),
		staleTime: 60000,
		queryFn: async () => {
			const res = await getCommunicationTemplates({
				...toPageParams({ page: params?.page, pageSize: params?.pageSize }),
				...(params?.channel ? { channel: params.channel } : {}),
				...(params?.isActive !== undefined ? { is_active: params.isActive } : {}),
				...(params?.keyword ? { keyword: params.keyword } : {}),
			});
			// 响应侧 fromPageResult 归一 items/total（服务端分页契约）。
			return fromPageResult<TemplateResponse>(res);
		},
	});
}

// A-185（[删]）：useCommunicationTemplateStats 已删（死取数——页面声明 stats 零消费）。
// queryKeys.communication.templateStats 同步删。

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
