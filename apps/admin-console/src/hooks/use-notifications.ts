'use client';

import { extractItem, extractList, fromPageResult, toPageParams } from '@autional/shared';
import { queryKeys } from '@/lib/query-keys';
import type {
	NotificationStatsResponse,
	ReadReportResponse,
	AvailableTemplateResponse,
} from '@autional/shared/generated/types';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
	getNotificationTemplates,
	getAvailableNotificationTemplates,
	getNotificationStats,
	createNotificationTemplate,
	updateNotificationTemplate,
	deleteNotificationTemplate,
	cloneNotificationTemplateToLocale,
	testNotification,
	getNotificationsReadReport,
	broadcastNotification,
	type NotificationTemplateCloneToLocaleRequest,
} from '@/lib/api.generated';
import * as Generated from '@autional/shared/generated/api';

export interface TrendPoint {
	date: string;
	sent: number;
	read: number;
}

// A-152 行模型对齐：service-notification TemplateResponse（dto.go:262-270，wire snake，
// 响应拦截器深 camelCase）—— 旧接口 id/channel/status/contentZh/contentEn 与响应全不交叉，
// rowKey 与三操作 id 恒 undefined（TASK-AB1-25 的行内克隆入口亦依赖 templateId 才可用）。
export interface NotificationTemplateRecord {
	templateId: string;
	name: string;
	type: string; // system | user | alert | reminder | promotion
	subject: string;
	content: string;
	variables?: string[];
	createdAt: string;
}

export function useNotificationStats() {
	return useQuery({
		queryKey: queryKeys.notifications.stats,
		staleTime: 30000,
		queryFn: async () => {
			const res = await getNotificationStats();
			const data = extractItem<NotificationStatsResponse>(res);
			return data ?? { totalSent: 0, totalRead: 0, readRate: 0, byType: {} };
		},
	});
}

/** 查询入参（camel 书面；分页键经 toPageParams 单点转 wire snake）。
 *  wire 锚：adminNotificationsTemplates({include_inactive?, type?, page?, page_size?})。 */
export interface NotificationTemplatesQuery {
	includeInactive?: boolean;
	type?: string;
	page?: number;
	pageSize?: number;
}

// A-156：服务端分页接线（原实现无参调用 → 后端默认 page_size=20 截断，21 条起不可达）。
// 返回 {items,total}（fromPageResult 归一）；queryKey 用 list 子键（前缀仍命中 all → 失效广播成立）。
export function useNotificationTemplates(params?: NotificationTemplatesQuery) {
	return useQuery({
		queryKey: queryKeys.notifications.list(params),
		staleTime: 60000,
		queryFn: async () => {
			const res = await getNotificationTemplates({
				...toPageParams({ page: params?.page, pageSize: params?.pageSize }),
				...(params?.includeInactive !== undefined
					? { include_inactive: params.includeInactive }
					: {}),
				...(params?.type ? { type: params.type } : {}),
			});
			return fromPageResult<NotificationTemplateRecord>(res);
		},
	});
}

// A-164（TASK-AB1-26）：事件映射选择器数据源 = /available admin twin（条目含 code；列表端点 TemplateResponse
// 无 code 字段，旧实现 tpl.code 恒 undefined = 数据源缺失）。响应形状 AvailableTemplateListResponse。
export function useAvailableNotificationTemplates() {
	return useQuery({
		queryKey: queryKeys.notifications.availableTemplates,
		staleTime: 60000,
		queryFn: async () => {
			const res = await getAvailableNotificationTemplates();
			return extractList<AvailableTemplateResponse>(res);
		},
	});
}

export function useCreateNotificationTemplate() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: createNotificationTemplate,
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: queryKeys.notifications.all });
			// A-155：本租户创建改变 /available 的 source/isCustomized 视图，同刷新。
			queryClient.invalidateQueries({ queryKey: queryKeys.notifications.availableTemplates });
		},
	});
}

export function useUpdateNotificationTemplate() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: ({ id, data }: { id: string; data: Record<string, unknown> }) =>
			updateNotificationTemplate(id, data),
		onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.notifications.all }),
	});
}

export function useDeleteNotificationTemplate() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: deleteNotificationTemplate,
		onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.notifications.all }),
	});
}

// A-155（TASK-AB1-25）：克隆到语言（POST /admin/notifications/templates/:id/clone-to-locale）。
export function useCloneNotificationTemplateToLocale() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: ({ id, data }: { id: string; data: NotificationTemplateCloneToLocaleRequest }) =>
			cloneNotificationTemplateToLocale(id, data),
		onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.notifications.all }),
	});
}

export function useTestNotification() {
	return useMutation({
		mutationFn: testNotification,
	});
}

export function useNotificationTrend(days: number = 30) {
	return useQuery({
		queryKey: queryKeys.notifications.trend(days),
		staleTime: 60000,
		queryFn: async () => {
			// U316：改接 admin 面（user 面在 admin 平面被入口平面门禁拒 403）
			const res = await Generated.adminNotificationsTrend({ days });
			const unwrapped = extractList<TrendPoint>(res);
			return unwrapped;
		},
	});
}

export function useBroadcastNotification() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: broadcastNotification,
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: queryKeys.notifications.stats });
		},
	});
}

export function useNotificationsReadReport() {
	return useQuery({
		queryKey: queryKeys.notifications.readReport,
		staleTime: 30000,
		queryFn: async () => {
			const res = await getNotificationsReadReport();
			const data = extractItem<ReadReportResponse>(res);
			return data ?? { readCount: 0, unreadCount: 0, readRate: 0, totalSent: 0 };
		},
	});
}
