// W1g（A-426③）AC-B5-W1g-16：用量预警页服务端分页回归锁 ——
//   旧实现本地分页（服务端默认 page_size=20，本地 10/页 → >20 条不可达）。
//   新实现：page/page_size 上行（wire）+ 服务端信封 total 驱动受控分页。
// 断言口径 = 最终 wire 请求参数（adapter 捕获请求拦截器之后）+ 分页控件页数。
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent, cleanup, configure } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { apiClient } from '@autional/shared';
import BillingAlertsPage from '../alerts/page';

vi.mock('@/lib/antd-app', () => ({ message: { success: vi.fn(), error: vi.fn(), warning: vi.fn() } }));

configure({ asyncUtilTimeout: 15000 });

const ALERTS_URL = '/billing/api/v1/admin/billing/alerts';
const TS = '2026-10-06T00:00:00Z';

interface CapturedCall {
	method: string;
	url: string;
	params?: Record<string, unknown>;
}

const captured: CapturedCall[] = [];
let originalAdapter: unknown;

// 服务端第 1 页 10 条 + 总 25 条（本地分页旧实现只能看到第 1 页，且 total 恒 = items.length）
const RAW_ALERTS = Array.from({ length: 10 }, (_, i) => ({
	id: `alert_w1g_${String(i + 1).padStart(2, '0')}`,
	name: `用量告警 ${i + 1}`,
	resource_type: 'api_calls',
	threshold_percent: 80,
	status: 'active',
	notification_channels: 'email',
	created_at: TS,
}));

function installCaptureAdapter() {
	originalAdapter = apiClient.defaults.adapter;
	apiClient.defaults.adapter = (async (config: any) => {
		const method = String(config.method || 'get').toLowerCase();
		const url = String(config.url || '');
		captured.push({ method, url, params: config.params });

		const data =
			url.includes(ALERTS_URL) && method === 'get'
				? {
						code: 0,
						message: 'success',
						items: RAW_ALERTS,
						total: 25,
						pagination: {
							total: 25,
							page: 1,
							page_size: 10,
							total_pages: 3,
							has_next: true,
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
			<BillingAlertsPage />
		</QueryClientProvider>,
	);
}

const alertGets = () =>
	captured.filter((c) => c.method === 'get' && c.url === ALERTS_URL);

describe('用量预警分页（A-426③）', () => {
	beforeEach(() => {
		captured.length = 0;
		installCaptureAdapter();
	});

	afterEach(() => {
		cleanup();
		apiClient.defaults.adapter = originalAdapter as any;
	});

	it(
		'AC-B5-W1g-16：page/page_size 上行 + 服务端 total=25 驱动 3 页受控分页',
		{ timeout: 20000 },
		async () => {
			renderPage();
			expect(await screen.findByText('用量告警 1')).toBeTruthy();

			// 首拉：wire 参数 page=1 & page_size=10（旧实现零上行 → 必红）
			await waitFor(() => {
				const calls = alertGets();
				expect(calls.length).toBeGreaterThanOrEqual(1);
				expect(calls[0].params).toMatchObject({ page: 1, page_size: 10 });
			});

			// 服务端 total=25 被消费：旧本地分页 total=items.length=10 → 只有 1 页
			await waitFor(() => {
				expect(document.querySelector('.ant-pagination-item[title="3"]')).toBeTruthy();
			});

			// 翻页 → 第二次请求带 page=2（受控分页上行）
			const page2 = document.querySelector(
				'.ant-pagination-item[title="2"]',
			) as HTMLElement;
			expect(page2).toBeTruthy();
			fireEvent.click(page2);

			await waitFor(() => {
				const calls = alertGets();
				expect(calls.length).toBeGreaterThanOrEqual(2);
				expect(calls[calls.length - 1].params).toMatchObject({ page: 2, page_size: 10 });
			});
		},
	);
});
