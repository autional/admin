// W1g（A-413）AC-B5-W1g-11：收入摊销报表页回归锁 ——
//   A-413②③：wire 全 CNY → 币符 ¥（A-292 $ 家族；含 Statistic prefix）
//   A-413④：rowKey 复合 `${period}-${planCode}`（period 单键不唯一 → 同期间多套餐撞键）
//   A-413①（标题锚）：usePageTitle(t('revenue.title')) → document.title = 「收入摊销报表 — Autional」
// 断言口径 = 表格行渲染 + React 重复 key 告警零命中 + document.title。
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, cleanup, configure } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { apiClient } from '@autional/shared';
import BillingRevenuePage from '../revenue/page';

vi.mock('@/lib/antd-app', () => ({ message: { success: vi.fn(), error: vi.fn(), warning: vi.fn() } }));

configure({ asyncUtilTimeout: 15000 });

const REVENUE_URL = '/billing/api/v1/admin/billing/revenue-amortization';
const TS = '2026-10-06T00:00:00Z';

let originalAdapter: unknown;

// 同期间（2026-09）两条不同套餐 → 旧 rowKey='period' 撞键（React 重复 key 告警）
const RAW_REVENUE = [
	{
		period: '2026-09',
		plan_code: 'pro_monthly',
		total_revenue: '100.4',
		recognized_revenue: '50',
		deferred_revenue: '50.4',
		transaction_count: 3,
	},
	{
		period: '2026-09',
		plan_code: 'basic_monthly',
		total_revenue: '23',
		recognized_revenue: '10',
		deferred_revenue: '13',
		transaction_count: 2,
	},
];

function installCaptureAdapter() {
	originalAdapter = apiClient.defaults.adapter;
	apiClient.defaults.adapter = (async (config: any) => {
		const method = String(config.method || 'get').toLowerCase();
		const url = String(config.url || '');
		const data =
			url.includes(REVENUE_URL) && method === 'get'
				? {
						code: 0,
						message: 'success',
						items: RAW_REVENUE,
						total: RAW_REVENUE.length,
						pagination: {
							total: RAW_REVENUE.length,
							page: 1,
							page_size: 20,
							total_pages: 1,
							has_next: false,
						},
						timestamp: TS,
					}
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
			<BillingRevenuePage />
		</QueryClientProvider>,
	);
}

describe('收入摊销报表（A-413）', () => {
	beforeEach(() => {
		installCaptureAdapter();
	});

	afterEach(() => {
		cleanup();
		vi.restoreAllMocks();
		apiClient.defaults.adapter = originalAdapter as any;
	});

	it(
		'AC-B5-W1g-11：¥ 币符 + 同期间两套餐零重复 key 告警 + 标题锚',
		{ timeout: 20000 },
		async () => {
			const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
			renderPage();

			// A-413②③：wire '100.4' / '23' → ¥100.40 / ¥23.00（旧 $ → 必红）
			expect(await screen.findByText('¥100.40')).toBeTruthy();
			expect(await screen.findByText('¥23.00')).toBeTruthy();
			expect(screen.queryByText('$100.40')).toBeNull();
			expect(screen.queryByText('$23.00')).toBeNull();

			// A-413④：同期间两行共存且零重复 key 告警（旧 rowKey='period' → 告警必现）
			expect(screen.getByText('pro_monthly')).toBeTruthy();
			expect(screen.getByText('basic_monthly')).toBeTruthy();
			const duplicateKeyWarnings = errorSpy.mock.calls.filter((args) =>
				args.some((a) => typeof a === 'string' && /same key/i.test(a)),
			);
			expect(duplicateKeyWarnings).toHaveLength(0);

			// A-413①：页面标题锚（nav/breadcrumb 词面统一）
			await waitFor(() => {
				expect(document.title).toBe('收入摊销报表 — Autional');
			});
		},
	);
});
