// W1g（A-434/A-435/A-436）AC-B5-W1g-19/20/21：信用余额页回归锁 ——
//   A-434：wire decimal 为字符串（dto.go:1146/:1156 → `"balance":"0"`）；Number 转换后
//          toLocaleString 千分位（旧 number 型恒等空转）。
//   A-435：403（跨租户/入口门禁）与网络错分流（旧统一「加载失败」；余额/交易两路独立短歧）
//   A-436①②：来源枚举补第五值 invoice_payment（domain.go:173 五值）+ 列标题校正「来源」
//            （wire `type` credit/debit 零消费，旧标题「类型」实渲染 source）
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
	render,
	screen,
	waitFor,
	within,
	fireEvent,
	cleanup,
	configure,
} from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { apiClient } from '@autional/shared';
import BillingCreditBalancePage from '../credit-balance/page';

vi.mock('@/lib/antd-app', () => ({ message: { success: vi.fn(), error: vi.fn(), warning: vi.fn() } }));

configure({ asyncUtilTimeout: 15000 });

const BALANCE_URL = '/billing/api/v1/admin/billing/credit-balance';
const TX_URL = '/billing/api/v1/admin/billing/credit-transactions';
const TENANT = 'tnt_w1g_cb01';
const TS = '2026-10-06T00:00:00Z';

let respond403 = false;
let originalAdapter: unknown;

function installAdapter() {
	respond403 = false;
	originalAdapter = apiClient.defaults.adapter;
	apiClient.defaults.adapter = (async (config: any) => {
		const url = String(config.url || '');
		if (url.includes(BALANCE_URL) || url.includes(TX_URL)) {
			if (respond403) {
				return Promise.reject(
					Object.assign(new Error('forbidden'), {
						response: { status: 403, data: { code: 403, message: 'forbidden' } },
						config,
					}),
				);
			}
		}
		if (url.includes(BALANCE_URL)) {
			return {
				data: {
					code: 0,
					message: 'success',
					data: {
						tenant_id: TENANT,
						balance: '1234.5',
						currency: 'CNY',
						updated_at: TS,
					},
					timestamp: TS,
				},
				status: 200,
				statusText: 'OK',
				headers: {},
				config,
			};
		}
		if (url.includes(TX_URL)) {
			// wire 流动（decimal 字符串 + 五来源之一 invoice_payment）
			return {
				data: {
					code: 0,
					message: 'success',
					items: [
						{
							id: 'ctx_w1g_01',
							tenant_id: TENANT,
							amount: '0',
							balance: '1000',
							source: 'invoice_payment',
							source_id: 'inv_w1g_01',
							remark: '',
							created_at: TS,
						},
					],
					total: 1,
					pagination: { total: 1, page: 1, page_size: 10, total_pages: 1, has_next: false },
					timestamp: TS,
				},
				status: 200,
				statusText: 'OK',
				headers: {},
				config,
			};
		}
		return {
			data: { code: 0, message: 'success', data: {}, timestamp: TS },
			status: 200,
			statusText: 'OK',
			headers: {},
			config,
		};
	}) as any;
}

function renderPage() {
	const queryClient = new QueryClient({
		defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
	});
	return render(
		<QueryClientProvider client={queryClient}>
			<BillingCreditBalancePage />
		</QueryClientProvider>,
	);
}

function lookupTenant() {
	fireEvent.change(screen.getByPlaceholderText('输入租户ID'), { target: { value: TENANT } });
	fireEvent.click(screen.getByRole('button', { name: /查询/ }));
}

describe('信用余额（A-434/A-435/A-436）', () => {
	beforeEach(() => {
		installAdapter();
	});

	afterEach(() => {
		cleanup();
		apiClient.defaults.adapter = originalAdapter as any;
	});

	it(
		'AC-B5-W1g-19/21：字符串小数千分位 + invoice_payment 五档 + 表头「来源」',
		{ timeout: 20000 },
		async () => {
			renderPage();
			lookupTenant();

			// A-434：'1234.5'（字符串）→ Number → '1,234.5'（旧 number 型空转 → 原样 1234.5）
			expect(await screen.findByText(/1,234\.5/)).toBeTruthy();

			// A-436①：列标题「来源」（旧「类型」实渲染 source → 必红）
			// 注：antd 表头含隐藏测量行复刻列标题（非 th）→ 定位于 th 断言。
			const headers = Array.from(document.querySelectorAll('th'));
			expect(
				headers.some((th) => th.textContent?.replace(/\s+/g, '').includes('来源')),
			).toBe(true);
			expect(headers.some((th) => th.textContent?.includes('类型'))).toBe(false);

			const row = await waitFor(() => {
				const el = document.querySelector('tr[data-row-key="ctx_w1g_01"]');
				expect(el).toBeTruthy();
				return el as HTMLElement;
			});
			// A-436②：invoice_payment 第五来源可读（旧映射缺键 → 裸显英文）
			expect(within(row).getByText('发票支付')).toBeTruthy();
			// amount '0' 是合法值（非 '-'）；balance '1000' → '1,000'
			expect(within(row).getByText('0')).toBeTruthy();
			expect(within(row).getByText('1,000')).toBeTruthy();
		},
	);

	it(
		'AC-B5-W1g-20：两路 403 → 「无权限访问该租户数据」（旧统一「加载失败」→ 必红）',
		{ timeout: 20000 },
		async () => {
			respond403 = true;
			renderPage();
			lookupTenant();

			const forbidden = await screen.findAllByText(
				'无权限访问该租户数据（租户不匹配或角色不足）',
			);
			// 余额路 + 交易路各自分流（两处 PageError）
			expect(forbidden).toHaveLength(2);
			expect(screen.queryByText('加载余额失败')).toBeNull();
			expect(screen.queryByText('加载交易记录失败')).toBeNull();
		},
	);
});
