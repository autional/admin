// W1f-30（A-341/A-344）回归锁 —— 支付管理列表 + 支付详情（/pay/payments、/pay/payments/:id）：
//   A-341：列表零服务端分页参（服务端默认 20/页 vs 本地 10/页伪全量 ⇒ >20 条静默丢失）
//          ⇒ page/page_size 上行 + 服务端 total 驱动页数。
//   A-344②：404 详情/收据双查询在全局 retry:1（main.tsx:27）下各 ×2（实测 4×404）⇒ 仅 404 关重试（各恰 1 发）。
//   A-344①：404 不再整页替换（未找到态保留返回键 + 标题骨架；旧 error 早退遮蔽 notFound 分支）。
//   A-344③：H1/tab 标题与菜单·面包屑统一「支付管理」（旧「支付记录」）。
//   A-344④：usePageTitle 接线（旧 tab 恒「Autional 管理控制台」）。
//   A-344⑥：RefundRecord 死导入删（源码 grep 零命中）。
//   A-344⑦：targetType 词表本地化（旧裸英文 wallet_recharge）。
//   A-354 退款状态词表断言于第 5 组追加。
// 断言口径 = 最终 wire 请求参数/次数（adapter 捕获，请求拦截器之后）+ 渲染词表 + 源码静态检查。
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent, cleanup, configure } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Routes, Route } from 'react-router';
import { apiClient } from '@autional/shared';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import PayPaymentsPage from '../payments/page';
import PayPaymentDetailPage from '../payments/[id]/page';
import PayRefundsPage from '../refunds/page';

vi.mock('@/lib/antd-app', () => ({
	message: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
	modal: { confirm: vi.fn() },
}));

vi.mock('@autional/shared', async (importOriginal) => ({
	...(await importOriginal<typeof import('@autional/shared')>()),
	useTenantSlug: () => 'tenant-w1f',
}));

configure({ asyncUtilTimeout: 15000 });

const TS = '2026-10-06T00:00:00Z';
const NF_ID = 'pay_w1f_nf01';
const LIST_ID = 'pay_w1f_01';

const PAYMENTS_URL = '/pay/api/v1/admin/payments';
const REFUNDS_URL = '/pay/api/v1/admin/refunds';
const DETAIL_URL = `/pay/api/v1/admin/payments/${NF_ID}`;
const RECEIPT_URL = `/pay/api/v1/admin/payments/${NF_ID}/receipt`;

interface CapturedCall {
	method: string;
	url: string;
	params?: Record<string, unknown>;
}

const captured: CapturedCall[] = [];
let originalAdapter: unknown;
let notFoundMode = false;
// A-354：退款列表数据（wire snake 键，响应拦截器 camel 化）
let refundItems: Record<string, unknown>[] = [];

// 自定义 adapter 不走 axios settle 的 validateStatus —— 非 2xx 必须自行 reject（带 response.status）。
function notFoundError(config: unknown, message: string) {
	return Object.assign(new Error(message), {
		isAxiosError: true,
		config,
		response: {
			status: 404,
			statusText: 'Not Found',
			headers: {},
			config,
			data: { code: 404, message },
		},
	});
}

// A-341：服务端第 1 页 10 条 + 总 25（旧零参上行 ⇒ 服务端 20/页 + 本地 10/页截断伪全量）
const RAW_PAYMENTS = Array.from({ length: 10 }, (_, i) => ({
	payment_id: `pay_w1f_${String(i + 1).padStart(2, '0')}`,
	tenant_id: 'tnt_w1f_pay01',
	app_id: 'app_w1f',
	payer_id: `u_w1f_${i + 1}`,
	channel_code: 'wechat',
	amount: '99.50',
	currency: 'CNY',
	status: 'succeeded',
	// A-344⑦：wire 原值 wallet_recharge（旧列表裸英文）
	target_type: i === 0 ? 'wallet_recharge' : 'order',
	target_id: 'tgt_w1f_1',
	receipt_number: '',
	gateway_reference: 'gw_w1f_1',
	item_description: '订阅费',
	created_at: TS,
	paid_at: TS,
}));

function installAdapter() {
	originalAdapter = apiClient.defaults.adapter;
	apiClient.defaults.adapter = (async (config: any) => {
		const method = String(config.method || 'get').toLowerCase();
		const url = String(config.url || '');
		captured.push({ method, url, params: config.params });

		if (method === 'get' && url === PAYMENTS_URL) {
			return {
				data: {
					code: 0,
					message: 'success',
					items: RAW_PAYMENTS,
					total: 25,
					pagination: {
						total: 25,
						page: Number(config.params?.page ?? 1),
						page_size: 10,
						total_pages: 3,
						has_next: true,
					},
					timestamp: TS,
				},
				status: 200,
				statusText: 'OK',
				headers: {},
				config,
			};
		}
		if (method === 'get' && url === DETAIL_URL) {
			if (notFoundMode) {
				throw notFoundError(config, 'payment not found');
			}
			return {
				data: { code: 0, message: 'success', data: RAW_PAYMENTS[0], timestamp: TS },
				status: 200,
				statusText: 'OK',
				headers: {},
				config,
			};
		}
		if (method === 'get' && url === RECEIPT_URL) {
			if (notFoundMode) {
				throw notFoundError(config, 'receipt not found');
			}
			return {
				data: { code: 0, message: 'success', data: RAW_PAYMENTS[0], timestamp: TS },
				status: 200,
				statusText: 'OK',
				headers: {},
				config,
			};
		}
		if (method === 'get' && url === REFUNDS_URL) {
			return {
				data: {
					code: 0,
					message: 'success',
					items: refundItems,
					total: refundItems.length,
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

function renderListPage() {
	const queryClient = new QueryClient({
		defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
	});
	return render(
		<QueryClientProvider client={queryClient}>
			<MemoryRouter initialEntries={['/pay/payments']}>
				<PayPaymentsPage />
			</MemoryRouter>
		</QueryClientProvider>,
	);
}

function renderRefundsPage() {
	const queryClient = new QueryClient({
		defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
	});
	return render(
		<QueryClientProvider client={queryClient}>
			<MemoryRouter initialEntries={['/pay/refunds']}>
				<PayRefundsPage />
			</MemoryRouter>
		</QueryClientProvider>,
	);
}

function renderDetailPage() {
	const queryClient = new QueryClient({
		// A-344②：模拟 main.tsx:27 全局 retry:1 + 短重试延迟；hook 层 404 谓词须压过它（各恰 1 发）
		defaultOptions: { queries: { retry: 1, retryDelay: 30 }, mutations: { retry: false } },
	});
	return render(
		<QueryClientProvider client={queryClient}>
			<MemoryRouter initialEntries={[`/pay/payments/${NF_ID}`]}>
				<Routes>
					<Route path="/pay/payments/:id" element={<PayPaymentDetailPage />} />
				</Routes>
			</MemoryRouter>
		</QueryClientProvider>,
	);
}

describe('支付管理（A-341/A-344）', () => {
	beforeEach(() => {
		captured.length = 0;
		notFoundMode = false;
		refundItems = [];
		installAdapter();
	});

	afterEach(() => {
		cleanup();
		apiClient.defaults.adapter = originalAdapter as any;
	});

	it(
		'AC-B5-W1f-23/25：A-341 page/page_size 上行 + total=25 驱动 3 页 + A-344③④⑦ H1/标题/词表',
		{ timeout: 20000 },
		async () => {
			renderListPage();
			expect(await screen.findByText(LIST_ID)).toBeTruthy();

			// A-341：首拉 wire page=1 & page_size=10（旧零参上行 ⇒ 必红）
			await waitFor(() => {
				const calls = captured.filter((c) => c.method === 'get' && c.url === PAYMENTS_URL);
				expect(calls.length).toBeGreaterThanOrEqual(1);
				expect(calls[0].params).toMatchObject({ page: 1, page_size: 10 });
			});

			// A-344③：H1 与菜单/面包屑统一「支付管理」（旧「支付记录」）
			expect(screen.getAllByText('支付管理').length).toBeGreaterThanOrEqual(1);
			expect(screen.queryByText('支付记录')).toBeNull();
			// A-344④：tab 标题接线（旧恒「Autional 管理控制台」）
			await waitFor(() => expect(document.title).toContain('支付管理'));

			// A-344⑦：targetType 词表本地化（旧裸英文 wallet_recharge）
			expect(await screen.findByText('钱包充值')).toBeTruthy();
			expect(screen.queryByText('wallet_recharge')).toBeNull();

			// 服务端 total=25 被消费：旧本地分页 total=items.length=10 → 只有 1 页
			await waitFor(() => {
				expect(document.querySelector('.ant-pagination-item[title="3"]')).toBeTruthy();
			});

			// 翻页 → 第二次请求带 page=2（受控分页上行）
			const page2 = document.querySelector('.ant-pagination-item[title="2"]') as HTMLElement;
			expect(page2).toBeTruthy();
			fireEvent.click(page2);
			await waitFor(() => {
				const calls = captured.filter((c) => c.method === 'get' && c.url === PAYMENTS_URL);
				expect(calls.length).toBeGreaterThanOrEqual(2);
				expect(calls[calls.length - 1].params).toMatchObject({ page: 2, page_size: 10 });
			});
		},
	);

	it(
		'AC-B5-W1f-25：A-344②/① 404 单发（全局 retry:1 下详情/收据各恰 1 发）+ 未找到态骨架保留',
		{ timeout: 20000 },
		async () => {
			notFoundMode = true;
			renderDetailPage();

			// A-344①：未找到态 = notFound 文案（旧 error 早退把此分支遮蔽为「加载支付详情失败」）
			expect(await screen.findByText('未找到支付记录')).toBeTruthy();
			expect(screen.queryByText('加载支付详情失败')).toBeNull();
			// 骨架保留：返回键 + 标题（旧整页替换两者齐消失）
			expect(screen.getByText('返回列表')).toBeTruthy();
			expect(screen.getByText('支付详情')).toBeTruthy();

			// A-344②：留足重试延迟窗口（retryDelay=30ms）后仍各恰 1 发（旧全局 retry:1 ⇒ 各 2 发）
			await new Promise((r) => setTimeout(r, 250));
			const detailCalls = captured.filter((c) => c.method === 'get' && c.url === DETAIL_URL);
			const receiptCalls = captured.filter((c) => c.method === 'get' && c.url === RECEIPT_URL);
			expect(detailCalls.length).toBe(1);
			expect(receiptCalls.length).toBe(1);
		},
	);

	it('AC-B5-W1f-25：A-344⑥ RefundRecord 死导入源码 grep 零命中', () => {
		const src = readFileSync(resolve(process.cwd(), 'src/app/pay/payments/[id]/page.tsx'), 'utf-8');
		expect(src).not.toContain('RefundRecord');
	});

	it(
		'AC-B5-W1f-29：A-354 退款状态词表（渲染退款状态非支付状态）',
		{ timeout: 20000 },
		async () => {
			refundItems = [
				{ id: 'rfd_w1f_01', payment_id: 'pay_w1f_01', status: 'pending', amount: '12.00', reason: '', created_at: TS },
				{ id: 'rfd_w1f_02', payment_id: 'pay_w1f_02', status: 'succeeded', amount: '34.00', reason: 'dup', created_at: TS },
				{ id: 'rfd_w1f_03', payment_id: 'pay_w1f_03', status: 'failed', amount: '56.00', reason: 'risk', created_at: TS },
			];
			renderRefundsPage();

			// A-354：pending/succeeded/failed → 处理中/已成功/失败（旧实现裸渲英文原值）
			expect(await screen.findByText('rfd_w1f_01')).toBeTruthy();
			expect(screen.getByText('处理中')).toBeTruthy();
			expect(screen.getByText('已成功')).toBeTruthy();
			expect(screen.getByText('失败')).toBeTruthy();
			expect(screen.queryByText('succeeded')).toBeNull();
			expect(screen.queryByText('pending')).toBeNull();

			// A-355①：tab 标题（退款管理，与菜单/面包屑统一）
			await waitFor(() => expect(document.title).toContain('退款管理'));
		},
	);
});
