// W1f（A-288/A-290/A-291/A-292④）回归锁 —— 计量与订阅页（/billing）：
//   A-288：记录表两键潜伏 —— id 列读 'id' vs wire record_id（修 A-279 崩溃后仍恒空）；
//          status 词表仅 completed/pending vs 实际 'paid' ⇒ 灰 Tag 英文原值。
//   A-290：网关表本地分页 2 页×10 vs wire total:25 ⇒ 第 21-25 条静默不可达（需 page/page_size 上行）。
//   A-291：方案表 code/status 列恒空（wire PlanDetail 无 id/code/status）+ 行删除传 record.id=undefined。
//   A-292④：首屏 8 路 GET 全量（Tab 未激活也发）⇒ 按激活页签惰性取数（首屏仅 1 路）。
// 断言口径 = 最终 wire 请求参数（adapter 捕获，请求拦截器之后）+ 渲染词表 + 分页控件页数。
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent, cleanup, configure } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { apiClient } from '@autional/shared';
import BillingPage from '../page';

const { confirmMock } = vi.hoisted(() => ({ confirmMock: vi.fn() }));

vi.mock('@/lib/antd-app', () => ({
	message: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
	modal: { confirm: confirmMock },
}));

vi.mock('@autional/shared', async (importOriginal) => ({
	...(await importOriginal<typeof import('@autional/shared')>()),
	useCurrentTenantId: () => TENANT,
}));

configure({ asyncUtilTimeout: 15000 });

const TENANT = 'tnt_w1f_bill01';
const TS = '2026-10-06T00:00:00Z';

const SUB_URL = `/billing/api/v1/admin/billing/subscription/${TENANT}`;
const RECORDS_URL = `/billing/api/v1/admin/billing/records/${TENANT}`;
const PLANS_URL = '/billing/api/v1/admin/billing/plans';
const GATEWAYS_URL = '/billing/api/v1/admin/billing/payment-gateways';

interface CapturedCall {
	method: string;
	url: string;
	params?: Record<string, unknown>;
}

const captured: CapturedCall[] = [];
let originalAdapter: unknown;

// A-288：wire 主键 record_id + 实测状态 'paid'（旧词表仅 completed/pending ⇒ 裸英文灰 Tag）
const RAW_RECORDS = [
	{
		record_id: 'rec_w1f_0001',
		tenant_id: TENANT,
		type: 'subscription',
		amount: '499',
		status: 'paid',
		description: '订阅付费',
		created_at: TS,
	},
];

// A-291：wire PlanDetail 无 id/code/status；含 status:'active' 用于反证旧死列裸显
const RAW_PLANS = [
	{
		plan_id: 'plan_w1f_01',
		name: '专业版',
		monthly_price: '99',
		status: 'active',
	},
];

// A-290：服务端第 1 页 10 条 + 总 25 条（本地分页旧实现 total 恒 10 ⇒ 只有 1 页）
const RAW_GATEWAYS = Array.from({ length: 10 }, (_, i) => ({
	id: `gw_w1f_${String(i + 1).padStart(2, '0')}`,
	name: `网关 ${i + 1}`,
	channel: 'wechat',
	status: 'active',
	created_at: TS,
}));

function installAdapter() {
	originalAdapter = apiClient.defaults.adapter;
	apiClient.defaults.adapter = (async (config: any) => {
		const method = String(config.method || 'get').toLowerCase();
		const url = String(config.url || '');
		captured.push({ method, url, params: config.params });

		let data: Record<string, unknown>;
		if (method === 'get' && url === SUB_URL) {
			data = {
				code: 0,
				message: 'success',
				data: { plan: 'pro', status: 'active', start_date: TS, current_period_end: TS },
				timestamp: TS,
			};
		} else if (method === 'get' && url === RECORDS_URL) {
			data = {
				code: 0,
				message: 'success',
				items: RAW_RECORDS,
				total: RAW_RECORDS.length,
				timestamp: TS,
			};
		} else if (method === 'get' && url === PLANS_URL) {
			data = {
				code: 0,
				message: 'success',
				items: RAW_PLANS,
				total: RAW_PLANS.length,
				timestamp: TS,
			};
		} else if (method === 'get' && url === GATEWAYS_URL) {
			data = {
				code: 0,
				message: 'success',
				items: RAW_GATEWAYS,
				total: 25,
				pagination: {
					total: 25,
					page: Number(config.params?.page ?? 1),
					page_size: 10,
					total_pages: 3,
					has_next: true,
				},
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
			<BillingPage />
		</QueryClientProvider>,
	);
}

function clickTab(name: string) {
	fireEvent.click(screen.getByRole('tab', { name }));
}

describe('计量与订阅（A-288/A-290/A-291/A-292④）', () => {
	beforeEach(() => {
		captured.length = 0;
		confirmMock.mockReset();
		installAdapter();
	});

	afterEach(() => {
		cleanup();
		apiClient.defaults.adapter = originalAdapter as any;
	});

	it(
		'AC-B5-W1f-02/06：首屏仅激活页签 1 路 GET + 记录表 record_id/paid/订阅 词表 + string 金额 ¥',
		{ timeout: 20000 },
		async () => {
			renderPage();

			// A-292④：首屏仅订阅 1 路（旧实现 8 路全量；记录/方案/网关页签未激活零请求）
			await waitFor(() => {
				expect(captured.filter((c) => c.method === 'get').length).toBeGreaterThanOrEqual(1);
			});
			const gets = () => captured.filter((c) => c.method === 'get');
			expect(gets().some((c) => c.url === RECORDS_URL)).toBe(false);
			expect(gets().some((c) => c.url === PLANS_URL)).toBe(false);
			expect(gets().some((c) => c.url === GATEWAYS_URL)).toBe(false);

			clickTab('记录');
			await waitFor(() => {
				expect(gets().some((c) => c.url === RECORDS_URL)).toBe(true);
			});

			// A-288①：ID 列上 wire record_id（旧 dataIndex 'id' → 恒空）
			expect(await screen.findByText('rec_w1f_0001')).toBeTruthy();
			// A-288②：状态词表 paid → 已支付（旧灰 Tag 裸显英文 paid）
			expect(await screen.findByText('已支付')).toBeTruthy();
			expect(screen.queryByText('paid')).toBeNull();
			// 类型词表 subscription → 订阅（页签同名 + 表格 Tag 共 ≥2 处）
			expect((await screen.findAllByText('订阅')).length).toBeGreaterThanOrEqual(2);
			expect(screen.queryByText('subscription')).toBeNull();
			// A-279 同族：string 金额不崩 + A-292② ¥ 口径
			expect(await screen.findByText('¥499.00')).toBeTruthy();
		},
	);

	it(
		'AC-B5-W1f-05：方案表 plan_id 主键列上列 + status 死列撤除 + 行删除走 planId（旧传 undefined）',
		{ timeout: 20000 },
		async () => {
			renderPage();
			await waitFor(() => {
				expect(captured.filter((c) => c.method === 'get').length).toBeGreaterThanOrEqual(1);
			});

			clickTab('方案');
			await waitFor(() => {
				expect(captured.some((c) => c.method === 'get' && c.url === PLANS_URL)).toBe(true);
			});

			// wire plan_id 上列（旧 code 列读不存在的 'code' → 恒 '-'）
			expect(await screen.findByText('plan_w1f_01')).toBeTruthy();
			// status 死列撤除：mock 含 status:'active'，旧实现裸显英文 active
			expect(screen.queryByText('active')).toBeNull();

			// 行删除 → confirm 回调内 DELETE 携带 plan_id（旧 record.id=undefined ⇒ URL/undefined）
			fireEvent.click(screen.getByText('删除'));
			expect(confirmMock).toHaveBeenCalledTimes(1);
			const cfg = confirmMock.mock.calls[0][0] as { onOk?: () => Promise<void> };
			await cfg.onOk?.();

			await waitFor(() => {
				expect(
					captured.some(
						(c) => c.method === 'delete' && c.url === `${PLANS_URL}/plan_w1f_01`,
					),
				).toBe(true);
			});
		},
	);

	it(
		'AC-B5-W1f-04：网关 page/page_size 上行 + 服务端 total=25 驱动 3 页受控分页',
		{ timeout: 20000 },
		async () => {
			renderPage();
			await waitFor(() => {
				expect(captured.filter((c) => c.method === 'get').length).toBeGreaterThanOrEqual(1);
			});

			clickTab('支付网关');
			expect(await screen.findByText('网关 1')).toBeTruthy();

			// 首拉：wire 参数 page=1 & page_size=10（旧实现零上行 → 必红）
			await waitFor(() => {
				const calls = captured.filter((c) => c.method === 'get' && c.url === GATEWAYS_URL);
				expect(calls.length).toBeGreaterThanOrEqual(1);
				expect(calls[0].params).toMatchObject({ page: 1, page_size: 10 });
			});

			// 服务端 total=25 被消费：旧本地分页 total=items.length=10 → 只有 1 页
			await waitFor(() => {
				expect(document.querySelector('.ant-pagination-item[title="3"]')).toBeTruthy();
			});

			// 翻页 → 第二次请求带 page=2（受控分页上行）
			const page2 = document.querySelector('.ant-pagination-item[title="2"]') as HTMLElement;
			expect(page2).toBeTruthy();
			fireEvent.click(page2);

			await waitFor(() => {
				const calls = captured.filter((c) => c.method === 'get' && c.url === GATEWAYS_URL);
				expect(calls.length).toBeGreaterThanOrEqual(2);
				expect(calls[calls.length - 1].params).toMatchObject({ page: 2, page_size: 10 });
			});
		},
	);
});
