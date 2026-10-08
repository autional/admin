// W1g（A-402/A-403/A-404/A-405①）AC-B5-W1g-04/05/06/07：订阅管理修复回归锁 ——
//   A-402：更换套餐 wire 必填 `new_plan`（PlanChangeRequest dto.go:364-367；旧 `plan_code` 必 400）
//   A-403：延长试用 wire 必填 `extend_days` + 上界 90（ExtendTrialRequest dto.go:1026-1037；旧 `days` + max=365 越界必 400）
//   A-404：状态/套餐两死筛选器移除（服务端 ListSubscriptions 只绑定 PageRequest，筛选恒 NO-OP）
//   A-405①：价格列 wire 全 CNY → ¥（A-292 $ 家族）
//   A-405：详情状态映射单点（旧详情弹窗裸显英文原文；表格/详情共用 renderStatus）
// 断言口径 = 最终 wire 请求（adapter 捕获请求拦截器之后、snakeCase 之后）。
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent, cleanup, configure } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { apiClient } from '@autional/shared';
import BillingSubscriptionsPage from '../subscriptions/page';

vi.mock('@/lib/antd-app', () => ({ message: { success: vi.fn(), error: vi.fn(), warning: vi.fn() } }));

configure({ asyncUtilTimeout: 15000 });

const SUBS_URL = '/billing/api/v1/admin/billing/subscriptions';
const TENANT = 'tnt_w1g_sub01';
const TS = '2026-10-06T00:00:00Z';

interface CapturedCall {
	method: string;
	url: string;
	body?: Record<string, unknown>;
}

const captured: CapturedCall[] = [];
let originalAdapter: unknown;

const RAW_SUBS = [
	{
		id: 'sub_01J8ZQ4T5X6Y7Z8A9B0C1D2E3F',
		tenant_id: TENANT,
		plan_code: 'pro_monthly',
		plan_name: 'Pro',
		status: 'active',
		start_date: '2026-09-01T00:00:00Z',
		current_period_start: '2026-09-01T00:00:00Z',
		current_period_end: '2026-10-01T00:00:00Z',
		trial_end_date: '2026-09-15T00:00:00Z',
		seats: 5,
		price: '49',
		created_at: '2026-09-01T00:00:00Z',
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

const dataEnvelope = (data: unknown) => ({ code: 0, message: 'success', data, timestamp: TS });

function installCaptureAdapter() {
	originalAdapter = apiClient.defaults.adapter;
	apiClient.defaults.adapter = (async (config: any) => {
		let body: Record<string, unknown> | undefined;
		if (typeof config.data === 'string' && config.data.length > 0) {
			body = JSON.parse(config.data);
		} else if (config.data && typeof config.data === 'object') {
			body = config.data as Record<string, unknown>;
		}
		const method = String(config.method || 'get').toLowerCase();
		const url = String(config.url || '');
		captured.push({ method, url, body });

		const data = url.includes(SUBS_URL) && method === 'get' ? listEnvelope(RAW_SUBS) : dataEnvelope({});
		return { data, status: 200, statusText: 'OK', headers: {}, config };
	}) as any;
}

function renderPage() {
	const queryClient = new QueryClient({
		defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
	});
	return render(
		<QueryClientProvider client={queryClient}>
			<BillingSubscriptionsPage />
		</QueryClientProvider>,
	);
}

function clickModalOk() {
	const ok = screen.getByRole('button', { name: /^(OK|确\s*定|确定)$/ });
	fireEvent.click(ok);
}

describe('订阅管理（A-402/A-403/A-404/A-405①）', () => {
	beforeEach(() => {
		captured.length = 0;
		installCaptureAdapter();
	});

	afterEach(() => {
		cleanup();
		apiClient.defaults.adapter = originalAdapter as any;
	});

	it(
		'AC-B5-W1g-06：死筛选器移除（页内无任何 Select 控件）',
		{ timeout: 20000 },
		async () => {
			renderPage();
			expect(await screen.findByText(TENANT)).toBeTruthy();
			// 旧实现：状态/套餐两筛选 Select（套餐恒空 options 死控件 + 状态缺 2 态）→ 必红。
			// 注意：DataTable 分页强制 showSizeChanger（ui DataTable.tsx:46）→ 分页条内合法 1 个 Select；
			// 筛选区的 Select 必须为 0（旧实现分页条外另有 2 个 → 必红）。
			const selectsOutsidePagination = Array.from(document.querySelectorAll('.ant-select')).filter(
				(el) => !el.closest('.ant-pagination'),
			);
			expect(selectsOutsidePagination).toHaveLength(0);
		},
	);

	it(
		'AC-B5-W1g-04：变更套餐 wire 键 new_plan（旧 plan_code 必 400）',
		{ timeout: 20000 },
		async () => {
			renderPage();
			expect(await screen.findByText(TENANT)).toBeTruthy();

			fireEvent.click(screen.getByRole('button', { name: /变更方案/ }));

			const input = await waitFor(() => {
				const el = document.querySelector('#newPlanCode') as HTMLInputElement;
				expect(el).toBeTruthy();
				return el;
			});
			fireEvent.change(input, { target: { value: 'enterprise_monthly' } });
			clickModalOk();

			await waitFor(() => expect(captured.some((c) => c.method === 'post')).toBe(true));
			const post = captured.find((c) => c.method === 'post')!;
			expect(post.url).toContain(`/subscription/${TENANT}/change-plan`);
			expect(post.body).toEqual({ new_plan: 'enterprise_monthly' });
		},
	);

	it(
		'AC-B5-W1g-05：延长试用 wire 键 extend_days + 上界 90（旧 days + max=365 必 400）',
		{ timeout: 20000 },
		async () => {
			renderPage();
			expect(await screen.findByText(TENANT)).toBeTruthy();

			fireEvent.click(screen.getByRole('button', { name: /延长试用/ }));

			const input = await waitFor(() => {
				const el = document.querySelector('#days') as HTMLInputElement;
				expect(el).toBeTruthy();
				return el;
			});
			// A-403 双轴：服务端 Range 1..90（旧 max=365 使 91-365 必 400）
			expect(input.getAttribute('aria-valuemax')).toBe('90');
			expect(input.getAttribute('aria-valuemin')).toBe('1');

			fireEvent.change(input, { target: { value: '45' } });
			clickModalOk();

			await waitFor(() => expect(captured.some((c) => c.method === 'post')).toBe(true));
			const post = captured.find((c) => c.method === 'post')!;
			expect(post.url).toContain(`/subscription/${TENANT}/extend-trial`);
			expect(post.body).toEqual({ extend_days: 45 });
		},
	);

	it('AC-B5-W1g-07：价格列 ¥（wire 全 CNY）', { timeout: 20000 }, async () => {
		renderPage();
		expect(await screen.findByText('¥49.00')).toBeTruthy();
		expect(screen.queryByText('$49.00')).toBeNull();
	});

	it('AC-B5-W1g-07：详情状态映射（旧详情裸显英文原文 active → 必红）', { timeout: 20000 }, async () => {
		renderPage();
		expect(await screen.findByText(TENANT)).toBeTruthy();

		// 行内「详情」按钮 → 详情弹窗（antd Modal 传送门落 body）
		// 注：antd 6.5 走 @rc-component/dialog → 面板类为 `.ant-modal-container`（非 v5 的 `.ant-modal-content`）
		fireEvent.click(screen.getByRole('button', { name: /详情/ }));

		const modal = await waitFor(() => {
			const el = document.querySelector('.ant-modal-container') as HTMLElement | null;
			expect(el).toBeTruthy();
			return el!;
		});
		// A-405：详情状态与表格同源映射（statusLabelMap + SUBSCRIPTION_STATUS_COLORS 单点）
		await waitFor(() => expect(modal.textContent).toContain('活跃'));
		expect(modal.textContent).not.toContain('active');
	});
});
