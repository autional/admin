// TASK-AB1-21（fix-admin-b1-guard-contract / A-294）：storage 列表 + 回收站行操作 fileId 契约回归锁。
//
//   AC-AB1-39：storage 页在 snake 原始响应（file_id 契约键）下渲染列表，无 `id` 回退分支；
//   行操作（下载/删除/还原/彻底删除）传给生成 api 的 id 值 = wire 的 file_id（非 undefined）。
//
// 断言口径 = **最终 wire 请求**：捕获器装在 shared apiClient 的 axios adapter（请求拦截器之后
// 最末环），跑真实链路 page → use-storage hook → generated api → 拦截器（camel→snake / snake→camel）
// → adapter；adapter 回写 wire 形状（snake，FileMetadataResponse 契约）响应，与线上链路同构。

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { apiClient } from '@autional/shared';
import StoragePage from '../page';

const { confirmMock } = vi.hoisted(() => ({ confirmMock: vi.fn() }));

vi.mock('@/lib/antd-app', () => ({
	message: { success: vi.fn(), error: vi.fn() },
	modal: { confirm: confirmMock },
}));

const FILES_URL = '/storage/api/v1/admin/storage/files';
const TRASH_URL = '/storage/api/v1/admin/storage/trash';
const QUOTA_URL = '/storage/api/v1/admin/storage/quota';
const STATS_URL = '/storage/api/v1/admin/storage/stats';

const FILE_ID = 'fil_01J8ZQ4T5X6Y7Z8A9B0C1D2E3F';
const TRASH_FILE_ID = 'fil_01J8ZQ4T5X6Y7Z8A9B0C1D2E3G';

interface CapturedCall {
	method: string;
	url: string;
	params?: Record<string, unknown>;
}

const captured: CapturedCall[] = [];
let originalAdapter: unknown;

/** wire 形状（snake）：FileMetadataResponse 契约（service-storage handler/dto/dto.go:44-60，键 file_id），经响应拦截器转 camel。 */
const RAW_FILES = [
	{
		file_id: FILE_ID,
		tenant_id: 'tnt_demo001',
		owner_id: 'usr_demo001',
		name: '预算表.xlsx',
		bucket: 'tenant-files',
		object_name: '2026/09/fil_abc.xlsx',
		original_name: '预算表.xlsx',
		size: 2048,
		mime_type: 'application/vnd.ms-excel',
		is_public: false,
		storage_class: 'standard',
		etag: '"e1a2b3"',
		created_at: '2026-09-01T00:00:00Z',
		updated_at: '2026-09-02T00:00:00Z',
	},
];

/** 回收站同一契约形状（ListTrash → ToFileMetadataResponseList，无 deleted_at 键——A-298 另案）。 */
const RAW_TRASH = [
	{
		file_id: TRASH_FILE_ID,
		tenant_id: 'tnt_demo001',
		owner_id: 'usr_demo001',
		name: '旧台账.csv',
		bucket: 'tenant-files',
		object_name: '2026/08/fil_def.csv',
		original_name: '旧台账.csv',
		size: 1024,
		mime_type: 'text/csv',
		is_public: false,
		storage_class: 'standard',
		etag: '"e4d5c6"',
		created_at: '2026-08-01T00:00:00Z',
		updated_at: '2026-08-15T00:00:00Z',
	},
];

const RAW_QUOTA = {
	quota_bytes: 1073741824,
	used_bytes: 104857600,
	available_bytes: 968884224,
	usage_percent: 9.8,
};

const RAW_STATS = { total_files: 2, total_size: 3072 };

function listEnvelope(items: unknown[]) {
	return {
		code: 0,
		message: 'success',
		items,
		total: items.length,
		pagination: { total: items.length, page: 1, page_size: 20, total_pages: 1, has_next: false },
		timestamp: '2026-10-04T00:00:00Z',
	};
}

function installCaptureAdapter() {
	originalAdapter = apiClient.defaults.adapter;
	apiClient.defaults.adapter = (async (config: any) => {
		const method = String(config.method || 'get').toLowerCase();
		const url = String(config.url || '');
		captured.push({ method, url, params: config.params as Record<string, unknown> | undefined });

		const envelope = {
			code: 0,
			message: 'success',
			data: {},
			timestamp: '2026-10-04T00:00:00Z',
		};
		let data: unknown;
		if (url.includes('/download')) {
			data = { ...envelope, data: { url: 'https://cdn.example/object' } };
		} else if (url.includes(TRASH_URL) && method === 'get') {
			data = listEnvelope(RAW_TRASH);
		} else if (url.includes(FILES_URL) && method === 'get') {
			data = listEnvelope(RAW_FILES);
		} else if (url.includes(QUOTA_URL)) {
			data = { ...envelope, data: RAW_QUOTA };
		} else if (url.includes(STATS_URL)) {
			data = { ...envelope, data: RAW_STATS };
		} else {
			data = envelope;
		}
		return { data, status: 200, statusText: 'OK', headers: {}, config };
	}) as any;
}

function renderPage(ui: React.ReactElement) {
	const queryClient = new QueryClient({
		defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
	});
	return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
}

describe('storage 行操作 fileId 契约（A-294）', () => {
	beforeEach(() => {
		captured.length = 0;
		confirmMock.mockClear();
		// jsdom 未实现 blob URL API（页面下载回调用到）
		(URL as any).createObjectURL = vi.fn(() => 'blob:mock');
		(URL as any).revokeObjectURL = vi.fn();
		installCaptureAdapter();
	});

	afterEach(() => {
		apiClient.defaults.adapter = originalAdapter as any;
	});

	it('AC-AB1-39：snake 原始响应（file_id）渲染列表（无 id 回退分支）', { timeout: 20000 }, async () => {
		renderPage(<StoragePage />);

		expect(await screen.findByText('预算表.xlsx')).toBeTruthy();
		expect(screen.getByText('2 KB')).toBeTruthy();
		expect(screen.queryByText('undefined')).toBeNull();

		const gets = captured.filter((c) => c.method === 'get' && c.url.includes(FILES_URL));
		expect(gets).toHaveLength(1);
	});

	it('AC-AB1-39：文件行操作以 fileId 调用（下载/删除 URL 含真实 file_id）', { timeout: 20000 }, async () => {
		renderPage(<StoragePage />);
		expect(await screen.findByText('预算表.xlsx')).toBeTruthy();

		// 下载：GET /files/{fileId}/download
		fireEvent.click(screen.getByText('下载'));
		await waitFor(() => expect(captured.some((c) => c.url.includes('/download'))).toBe(true));
		const download = captured.find((c) => c.url.includes('/download'))!;
		expect(download.url).toBe(`/storage/api/v1/admin/storage/files/${FILE_ID}/download`);

		// 删除：DELETE /files/{fileId}（modal.confirm onOk 触发）
		fireEvent.click(screen.getByText('删除'));
		await waitFor(() => expect(confirmMock).toHaveBeenCalledTimes(1));
		await confirmMock.mock.calls[0][0].onOk();
		await waitFor(() =>
			expect(captured.some((c) => c.method === 'delete' && c.url.includes(FILES_URL))).toBe(true),
		);
		const del = captured.find((c) => c.method === 'delete' && c.url.includes(FILES_URL))!;
		expect(del.url).toBe(`/storage/api/v1/admin/storage/files/${FILE_ID}`);
	});

	it('AC-AB1-39：回收站行操作以 fileId 调用（还原 POST、彻底删除 DELETE 含真实 file_id）', { timeout: 20000 }, async () => {
		renderPage(<StoragePage />);
		expect(await screen.findByText('预算表.xlsx')).toBeTruthy();

		fireEvent.click(screen.getByText('回收站'));
		expect(await screen.findByText('旧台账.csv')).toBeTruthy();

		// 还原：POST /trash/{fileId}/restore
		fireEvent.click(screen.getByText('还原'));
		await waitFor(() =>
			expect(captured.some((c) => c.method === 'post' && c.url.includes(TRASH_URL))).toBe(true),
		);
		const restore = captured.find((c) => c.method === 'post' && c.url.includes(TRASH_URL))!;
		expect(restore.url).toBe(`/storage/api/v1/admin/storage/trash/${TRASH_FILE_ID}/restore`);

		// 彻底删除：DELETE /trash/{fileId}（modal.confirm onOk 触发）
		fireEvent.click(screen.getByText('彻底删除'));
		await waitFor(() => expect(confirmMock).toHaveBeenCalledTimes(1));
		await confirmMock.mock.calls[0][0].onOk();
		await waitFor(() =>
			expect(captured.some((c) => c.method === 'delete' && c.url.includes(TRASH_URL))).toBe(true),
		);
		const perm = captured.find((c) => c.method === 'delete' && c.url.includes(TRASH_URL))!;
		expect(perm.url).toBe(`/storage/api/v1/admin/storage/trash/${TRASH_FILE_ID}`);
	});
});
