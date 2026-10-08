// W1g（A-421/A-422）AC-B5-W1g-14/15：税务导出页回归锁 ——
//   A-421：format 筛选三链全死（生成层仅 {period}（shared api.ts:1264-1266）、服务端只读 period
//           （tax.go:98））→ 控件移除；上行参数不得含 format。
//   A-422③：冗余「查询」按钮移除（filters 入 queryKey，变更即自动重查）
//   A-422④：status 原样渲染（旧色映射 completed/processing 为想象值 → 显示「已完成/处理中」）
// 断言口径 = 最终 wire 请求（adapter 捕获请求拦截器之后）。
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, configure } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { apiClient } from '@autional/shared';
import BillingTaxExportPage from '../tax-export/page';

vi.mock('@/lib/antd-app', () => ({ message: { success: vi.fn(), error: vi.fn(), warning: vi.fn() } }));

configure({ asyncUtilTimeout: 15000 });

const TAX_URL = '/billing/api/v1/admin/billing/tax-exports';
const TS = '2026-10-06T00:00:00Z';

interface CapturedCall {
	method: string;
	url: string;
	params?: Record<string, unknown>;
}

const captured: CapturedCall[] = [];
let originalAdapter: unknown;

// wire 形态：status 原值为 completed（域无映射枚举，见 A-422④）
const RAW_EXPORTS = [
	{
		id: 'tax_w1g_01',
		period: '2026-Q3',
		format: 'csv',
		status: 'completed',
		download_url: 'https://files.invalid/tax_w1g_01.csv',
		created_at: TS,
	},
];

const listEnvelope = (items: unknown[]) => ({
	code: 0,
	message: 'success',
	items,
	total: items.length,
	pagination: { total: items.length, page: 1, page_size: 20, total_pages: 1, has_next: false },
	timestamp: TS,
});

function installCaptureAdapter() {
	originalAdapter = apiClient.defaults.adapter;
	apiClient.defaults.adapter = (async (config: any) => {
		const method = String(config.method || 'get').toLowerCase();
		const url = String(config.url || '');
		captured.push({ method, url, params: config.params });

		const data =
			url.includes(TAX_URL) && method === 'get'
				? listEnvelope(RAW_EXPORTS)
				: { code: 0, message: 'success', data: {}, timestamp: TS };
		return { data, status: 200, statusText: 'OK', headers: {}, config };
	}) as any;
}

function renderPage() {
	const queryClient = new QueryClient({
		defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
	});
	return render(
		<QueryClientProvider client={queryClient}>
			<BillingTaxExportPage />
		</QueryClientProvider>,
	);
}

describe('税务导出（A-421/A-422）', () => {
	beforeEach(() => {
		captured.length = 0;
		installCaptureAdapter();
	});

	afterEach(() => {
		cleanup();
		apiClient.defaults.adapter = originalAdapter as any;
	});

	it(
		'AC-B5-W1g-14：format 筛选退场（无筛选 Select / 无查询按钮）+ 上行参数不含 format',
		{ timeout: 20000 },
		async () => {
			renderPage();
			expect(await screen.findByText('completed')).toBeTruthy();

			// 旧实现：format Select + 查询按钮 → 必红。
			// DataTable 分页强制 showSizeChanger（ui DataTable.tsx:46）→ 分页条内合法 1 个 Select。
			const selectsOutsidePagination = Array.from(document.querySelectorAll('.ant-select')).filter(
				(el) => !el.closest('.ant-pagination'),
			);
			expect(selectsOutsidePagination).toHaveLength(0);
			expect(screen.queryByRole('button', { name: /查询/ })).toBeNull();

			const get = captured.find((c) => c.method === 'get' && c.url === TAX_URL);
			expect(get).toBeTruthy();
			expect('format' in (get?.params ?? {})).toBe(false);
		},
	);

	it(
		'AC-B5-W1g-15：status 原样渲染（旧「已完成/处理中」映射 → 必红）',
		{ timeout: 20000 },
		async () => {
			renderPage();
			expect(await screen.findByText('completed')).toBeTruthy();
			expect(screen.queryByText('已完成')).toBeNull();
			expect(screen.queryByText('处理中')).toBeNull();
		},
	);
});
