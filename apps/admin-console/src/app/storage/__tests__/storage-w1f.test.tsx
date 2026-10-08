// W1f（A-299/A-301）回归锁 —— 存储管理页（/storage）：
//   A-299：文件/回收站表 rowKey 取 wire file_id（旧 rowKey="id"，mock 行无 id 键 ⇒ 行 key 恒 undefined）。
//   A-301：文件/回收站分页截断潜伏修复 —— wire page/page_size 上行 + 服务端 total 驱动页数
//          （旧实现 extractList 只取 items + 零分页参上行，服务端默认 page_size=20 vs 本地 10/页）。
// 断言口径 = 最终 wire 请求参数（adapter 捕获，请求拦截器之后）+ 行 data-row-key + 分页控件页数。
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent, cleanup, configure } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { apiClient } from '@autional/shared';
import StoragePage from '../page';

vi.mock('@/lib/antd-app', () => ({
	message: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
	modal: { confirm: vi.fn() },
}));

configure({ asyncUtilTimeout: 15000 });

const TS = '2026-10-06T00:00:00Z';

const FILES_URL = '/storage/api/v1/admin/storage/files';
const TRASH_URL = '/storage/api/v1/admin/storage/trash';
const QUOTA_URL = '/storage/api/v1/admin/storage/quota';
const STATS_URL = '/storage/api/v1/admin/storage/stats';

interface CapturedCall {
	method: string;
	url: string;
	params?: Record<string, unknown>;
}

const captured: CapturedCall[] = [];
let originalAdapter: unknown;

// A-299：mock 行仅有 wire 键 file_id（无 id 键）——旧 rowKey="id" 时行 key 恒 undefined
const RAW_FILES = Array.from({ length: 10 }, (_, i) => ({
	file_id: `fil_w1f_${String(i + 1).padStart(2, '0')}`,
	name: `文件 ${i + 1}`,
	mime_type: 'text/plain',
	size: 1024,
	created_at: TS,
	updated_at: TS,
	is_public: false,
}));

const RAW_TRASH = [
	{
		file_id: 'trk_w1f_01',
		name: '已删文件 1',
		mime_type: 'text/plain',
		size: 2048,
		created_at: TS,
		updated_at: TS,
		is_public: false,
	},
];

function installAdapter() {
	originalAdapter = apiClient.defaults.adapter;
	apiClient.defaults.adapter = (async (config: any) => {
		const method = String(config.method || 'get').toLowerCase();
		const url = String(config.url || '');
		captured.push({ method, url, params: config.params });

		let data: Record<string, unknown>;
		if (method === 'get' && url === FILES_URL) {
			// A-301：服务端第 1 页 10 条 + 总 25 条（旧本地分页 total=items.length=10 ⇒ 只有 1 页）
			data = { code: 0, message: 'success', items: RAW_FILES, total: 25, timestamp: TS };
		} else if (method === 'get' && url === TRASH_URL) {
			data = { code: 0, message: 'success', items: RAW_TRASH, total: 12, timestamp: TS };
		} else if (method === 'get' && url === QUOTA_URL) {
			data = {
				code: 0,
				message: 'success',
				data: {
					quota_bytes: 1073741824,
					used_bytes: 1024,
					available_bytes: 1073740800,
					usage_percent: 0.1,
				},
				timestamp: TS,
			};
		} else if (method === 'get' && url === STATS_URL) {
			data = {
				code: 0,
				message: 'success',
				data: { total_files: 10, total_size: 10240 },
				timestamp: TS,
			};
		} else {
			data = { code: 0, message: 'success', data: {}, timestamp: TS };
		}
		return { data, status: 200, statusText: 'OK', headers: {}, config };
	}) as any;
}

function renderPage() {
	const queryClient = new QueryClient({
		defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
	});
	return render(
		<QueryClientProvider client={queryClient}>
			<StoragePage />
		</QueryClientProvider>,
	);
}

describe('存储管理（A-299/A-301）', () => {
	beforeEach(() => {
		captured.length = 0;
		installAdapter();
	});

	afterEach(() => {
		cleanup();
		apiClient.defaults.adapter = originalAdapter as any;
	});

	it(
		'AC-B5-W1f-07/08：文件表 rowKey=file_id + page/page_size 上行 + 服务端 total=25 驱动 3 页',
		{ timeout: 20000 },
		async () => {
			renderPage();

			expect(await screen.findByText('文件 1')).toBeTruthy();

			// A-299：行 key = wire file_id（旧 rowKey="id" ⇒ data-row-key="undefined"）
			await waitFor(() => {
				expect(document.querySelector('tr[data-row-key="fil_w1f_01"]')).toBeTruthy();
			});
			expect(document.querySelector('tr[data-row-key="undefined"]')).toBeNull();

			// A-301：首拉 wire 参数 page=1 & page_size=10（旧实现零上行 → 必红）
			await waitFor(() => {
				const calls = captured.filter((c) => c.method === 'get' && c.url === FILES_URL);
				expect(calls.length).toBeGreaterThanOrEqual(1);
				expect(calls[0].params).toMatchObject({ page: 1, page_size: 10 });
			});

			// 服务端 total=25 被消费（旧本地分页 total=10 → 只有 1 页）
			await waitFor(() => {
				expect(document.querySelector('.ant-pagination-item[title="3"]')).toBeTruthy();
			});

			// 翻页 → 第二次请求带 page=2（受控分页上行）
			const page2 = document.querySelector('.ant-pagination-item[title="2"]') as HTMLElement;
			expect(page2).toBeTruthy();
			fireEvent.click(page2);

			await waitFor(() => {
				const calls = captured.filter((c) => c.method === 'get' && c.url === FILES_URL);
				expect(calls.length).toBeGreaterThanOrEqual(2);
				expect(calls[calls.length - 1].params).toMatchObject({ page: 2, page_size: 10 });
			});
		},
	);

	it(
		'AC-B5-W1f-07/08：回收站表 rowKey=file_id + page/page_size 上行 + 服务端 total=12 驱动 2 页',
		{ timeout: 20000 },
		async () => {
			renderPage();
			expect(await screen.findByText('文件 1')).toBeTruthy();

			// 切回收站页签（惰性挂载 → 首次触发 trash GET）
			fireEvent.click(screen.getByRole('tab', { name: '回收站' }));

			expect(await screen.findByText('已删文件 1')).toBeTruthy();

			// A-301：回收站同族 —— page/page_size 上行
			await waitFor(() => {
				const calls = captured.filter((c) => c.method === 'get' && c.url === TRASH_URL);
				expect(calls.length).toBeGreaterThanOrEqual(1);
				expect(calls[0].params).toMatchObject({ page: 1, page_size: 10 });
			});

			// A-299 同族：回收站行 key = file_id（旧 rowKey="id" ⇒ undefined）
			await waitFor(() => {
				expect(document.querySelector('tr[data-row-key="trk_w1f_01"]')).toBeTruthy();
			});

			// total=12 → 2 页
			await waitFor(() => {
				expect(document.querySelector('.ant-pagination-item[title="2"]')).toBeTruthy();
			});
		},
	);
});
