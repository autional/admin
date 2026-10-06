'use client';

import { extractList, extractItem } from '@autional/shared';
import { queryKeys } from '@/lib/query-keys';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
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
			const res = await getFiles(params);
			return extractList<FileRecord>(res);
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

export function useStorageTrash() {
	return useQuery({
		queryKey: queryKeys.storage.trash,
		queryFn: async () => {
			const res = await getStorageTrash();
			return extractList<TrashRecord>(res);
		},
	});
}

export function useRestoreTrashItem() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: restoreTrashItem,
		onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.storage.trash }),
	});
}

export function useDeleteTrashItem() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: deleteTrashItem,
		onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.storage.trash }),
	});
}

export function useCreateFolder() {
	const queryClient = useQueryClient();
	return useMutation({
		// U316：改接 admin 面（user 面在 admin 平面被入口平面门禁拒 403）
		mutationFn: (data: Record<string, unknown>) => Generated.adminStorageFoldersPost(data),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ['files'] });
		},
	});
}

export function useDeleteFile() {
	const queryClient = useQueryClient();
	return useMutation({
		// TASK-AB1-21 / A-294：参数即 FileRecord.fileId（wire file_id）
		mutationFn: (fileId: string) => Generated.adminStorageFilesByFilesDelete(fileId),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ['files'] });
			queryClient.invalidateQueries({ queryKey: queryKeys.storage.trash });
		},
	});
}
