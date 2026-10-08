'use client';

import { extractListResult, extractItem } from '@autional/shared';
import { queryKeys } from '@/lib/query-keys';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { QueryClient } from '@tanstack/react-query';
import {
	getFiles,
	uploadFile,
	getStorageQuota,
	getStorageStats,
	getStorageTrash,
	restoreTrashItem,
	deleteTrashItem,
} from '@/lib/api.generated';
import * as Generated from '@autional/shared/generated/api';

// TASK-AB1-21 / A-294：行标识 = wire 契约键 file_id（generated FileMetadataResponse，经拦截器 camel 为 fileId）；
// 删除 `id` 回退分支（旧代码按行对象的 id 键取标识恒 undefined → 行操作 URL 带 "undefined"）。
export interface FileRecord {
	fileId: string;
	name: string;
	type: string;
	size: number;
	createdAt: string;
	path: string;
	isPublic: boolean;
}

export interface TrashRecord {
	fileId: string;
	name: string;
	type: string;
	size: number;
	deletedAt: string;
	isPublic: boolean;
}

export interface StorageQuota {
	/** 总容量（后端 quota_bytes，camelCase 后为 quotaBytes） */
	quotaBytes?: number;
	/** 已用容量（后端 used_bytes） */
	usedBytes?: number;
	/** 剩余可用容量（后端 available_bytes） */
	availableBytes?: number;
	/** 使用占比（后端 usage_percent） */
	usagePercent?: number;
	/** 兼容别名：旧字段 totalBytes */
	totalBytes?: number;
}

export interface StorageStats {
	totalFiles?: number;
	totalSize?: number;
}

export function useFiles(params?: {
	parentId?: string;
	page?: number;
	pageSize?: number;
	keyword?: string;
}) {
	return useQuery({
		queryKey: queryKeys.storage.files(params),
		queryFn: async () => {
			// A-301：消费服务端 total（旧实现 extractList 只取 items、零分页参上行
			// ⇒ 服务端默认 page_size=20 vs 本地 10/页，第 21 条起静默不可达）。
			const res = await getFiles(params);
			return extractListResult<FileRecord>(res);
		},
	});
}

export function useStorageQuota() {
	return useQuery({
		queryKey: queryKeys.storage.quota,
		queryFn: async () => {
			const res = await getStorageQuota();
			return extractItem<StorageQuota>(res) ?? ({} as StorageQuota);
		},
	});
}

export function useStorageStats() {
	return useQuery({
		queryKey: queryKeys.storage.stats,
		queryFn: async () => {
			const res = await getStorageStats();
			return extractItem<StorageStats>(res) ?? ({} as StorageStats);
		},
	});
}

export function useStorageTrash(params?: { page?: number; pageSize?: number }) {
	return useQuery({
		queryKey: queryKeys.storage.trash.list(params),
		queryFn: async () => {
			// A-301：回收站同族接线（page/page_size 上行 + 服务端 total）。
			const res = await getStorageTrash(params);
			return extractListResult<TrashRecord>(res);
		},
	});
}

/**
 * W4-02（F2-02）：存储写动作的统一失效集合。
 * 任一写（上传/还原/删除/新建文件夹）都会同时影响 files（列表）、quota（配额）、
 * stats（统计）、trash（回收站）四个读面——读面四键一并失效，避免写后读面陈旧。
 * files 使用前缀键 `['files']`：queryKeys.storage.files(params) 为 ['files', {params}]，
 * 前缀失效覆盖所有参数变体。
 */
function invalidateStorageData(queryClient: QueryClient) {
	queryClient.invalidateQueries({ queryKey: ['files'] });
	queryClient.invalidateQueries({ queryKey: queryKeys.storage.quota });
	queryClient.invalidateQueries({ queryKey: queryKeys.storage.stats });
	// A-301：trash 分页入键后以 all 前缀失效（覆盖全部 page/page_size 变体）。
	queryClient.invalidateQueries({ queryKey: queryKeys.storage.trash.all });
}

export function useRestoreTrashItem() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: restoreTrashItem,
		onSuccess: () => invalidateStorageData(queryClient),
	});
}

export function useDeleteTrashItem() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: deleteTrashItem,
		onSuccess: () => invalidateStorageData(queryClient),
	});
}

export function useCreateFolder() {
	const queryClient = useQueryClient();
	return useMutation({
		// U316：改接 admin 面（user 面在 admin 平面被入口平面门禁拒 403）
		mutationFn: (data: Record<string, unknown>) => Generated.adminStorageFoldersPost(data),
		onSuccess: () => invalidateStorageData(queryClient),
	});
}

export function useDeleteFile() {
	const queryClient = useQueryClient();
	return useMutation({
		// TASK-AB1-21 / A-294：参数即 FileRecord.fileId（wire file_id）
		mutationFn: (fileId: string) => Generated.adminStorageFilesByFilesDelete(fileId),
		onSuccess: () => invalidateStorageData(queryClient),
	});
}

/**
 * W4-02（F2-02）：上传走 hook（带统一失效）——上传 201 后 files/quota/stats/trash 四键
 * 全部失效，列表与容量面自动重新拉取（旧实现为页面内联调用 uploadFile，上传后无 GET）。
 * 入参形状与服务端契约一致：FormData（file + 可选 parent_id）。
 */
export function useUploadFile() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (formData: FormData) => uploadFile(formData),
		onSuccess: () => invalidateStorageData(queryClient),
	});
}
