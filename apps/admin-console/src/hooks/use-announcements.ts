'use client';

import { extractListResult, toPageParams } from '@autional/shared';
import { queryKeys } from '@/lib/query-keys';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
	getAnnouncements,
	createAnnouncement,
	updateAnnouncement,
	deleteAnnouncement,
	publishAnnouncement,
	unpublishAnnouncement,
} from '@/lib/api.generated';

// RC-5（TASK-AB1-27）：契约键 camel 直读（响应拦截器已 snake→camel），禁止 snake 双读。
// wire 锚：service-notification domain.go:208-210（target_roles/publish_at/expire_at snake json tag）。
export interface AnnouncementRecord {
	id: string;
	tenantId: string;
	title: string;
	content: string;
	status: 'draft' | 'scheduled' | 'published' | 'expired';
	targetRoles?: string[];
	publishAt?: string;
	expireAt?: string;
	views: number;
	dismissals: number;
	createdAt: string;
	updatedAt: string;
}

/** 查询入参（camel 书面；分页键经 toPageParams 单点转 wire snake）。 */
export interface AnnouncementListParams {
	page?: number;
	pageSize?: number;
	status?: string;
	search?: string;
}

export function useAnnouncements(params?: AnnouncementListParams) {
	return useQuery({
		queryKey: [...queryKeys.announcements.all, params],
		staleTime: 300000,
		queryFn: async () => {
			const res = await getAnnouncements({
				status: params?.status,
				search: params?.search,
				...toPageParams({ page: params?.page, pageSize: params?.pageSize }),
			});
			return extractListResult<AnnouncementRecord>(res);
		},
	});
}

export function useCreateAnnouncement() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: createAnnouncement,
		onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.announcements.all }),
	});
}

export function useUpdateAnnouncement() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: ({ id, data }: { id: string; data: Record<string, unknown> }) =>
			updateAnnouncement(id, data),
		onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.announcements.all }),
	});
}

export function useDeleteAnnouncement() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: deleteAnnouncement,
		onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.announcements.all }),
	});
}

export function usePublishAnnouncement() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: publishAnnouncement,
		onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.announcements.all }),
	});
}

export function useUnpublishAnnouncement() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: unpublishAnnouncement,
		onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.announcements.all }),
	});
}
