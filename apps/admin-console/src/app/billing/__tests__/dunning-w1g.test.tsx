// W1g（A-417/A-418）AC-B5-W1g-12/13：催收设置页回归锁 ——
//   A-417②：空记录（status:'' = 未配置）不预填 0/0 —— 旧实现 setFieldsValue(空回包) 全零
//           貌似已配置，且 0/0 保存必 400（服务端 Range 1..90 / 1..180）。
//   A-417①：边界双轴 grace 1..90 / autoCancel 1..180（旧 min=0 / max=365，越界输入必 400）
//   A-418④：403（入口平面门禁/租户不匹配）与网络错分流（旧统一「加载设置失败」）
// 断言口径 = 表单控件 DOM 状态（aria-valuemin/max）+ 错误注入分歧文案。
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, configure } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { apiClient } from '@autional/shared';
import BillingDunningPage from '../dunning/page';

vi.mock('@/lib/antd-app', () => ({ message: { success: vi.fn(), error: vi.fn(), warning: vi.fn() } }));

configure({ asyncUtilTimeout: 15000 });

const DUNNING_URL = '/billing/api/v1/admin/billing/dunning-settings';
const TENANT = 'tnt_w1g_dun01';
const TS = '2026-10-06T00:00:00Z';

let respond403 = false;
let originalAdapter: unknown;

function installAdapter() {
	respond403 = false;
	originalAdapter = apiClient.defaults.adapter;
	apiClient.defaults.adapter = (async (config: any) => {
		const url = String(config.url || '');
		if (url.includes(DUNNING_URL)) {
			if (respond403) {
				return Promise.reject(
					Object.assign(new Error('forbidden'), {
						response: { status: 403, data: { code: 403, message: 'forbidden' } },
						config,
					}),
				);
			}
			// 空记录：status 为空 = 未配置（A-417② 语义来源；旧实现照单预填 0/0）
			return {
				data: {
					code: 0,
					message: 'success',
					data: {
						tenant_id: TENANT,
						grace_period_days: 0,
						auto_cancel_days: 0,
						status: '',
					},
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
			<BillingDunningPage />
		</QueryClientProvider>,
	);
}

function typeTenant() {
	fireEvent.change(screen.getByPlaceholderText('输入租户ID'), { target: { value: TENANT } });
}

describe('催收设置（A-417/A-418）', () => {
	beforeEach(() => {
		installAdapter();
	});

	afterEach(() => {
		cleanup();
		apiClient.defaults.adapter = originalAdapter as any;
	});

	it(
		'AC-B5-W1g-12：空记录不预填（Alert 未配置 + 输入留空非 0）+ 边界双轴 1..90 / 1..180',
		{ timeout: 20000 },
		async () => {
			renderPage();
			expect(screen.getByText('请输入租户ID以加载催收设置')).toBeTruthy();

			typeTenant();

			expect(await screen.findByText('当前租户尚未配置催收设置')).toBeTruthy();

			const grace = document.querySelector('#gracePeriodDays') as HTMLInputElement;
			const autoCancel = document.querySelector('#autoCancelDays') as HTMLInputElement;
			expect(grace).toBeTruthy();
			expect(autoCancel).toBeTruthy();
			// 旧实现 setFieldsValue(空回包) → '0' 必红；新实现 resetFields → 留空
			expect(grace.value).toBe('');
			expect(autoCancel.value).toBe('');

			// A-417①：服务端 Range 1..90 / 1..180（旧 min=0 / max=365 → 越界输入必 400）
			expect(grace.getAttribute('aria-valuemin')).toBe('1');
			expect(grace.getAttribute('aria-valuemax')).toBe('90');
			expect(autoCancel.getAttribute('aria-valuemin')).toBe('1');
			expect(autoCancel.getAttribute('aria-valuemax')).toBe('180');
		},
	);

	it(
		'AC-B5-W1g-13：403 → 「无权限访问该租户的催收设置」（旧统一「加载设置失败」→ 必红）',
		{ timeout: 20000 },
		async () => {
			respond403 = true;
			renderPage();

			typeTenant();

			expect(await screen.findByText('无权限访问该租户的催收设置')).toBeTruthy();
			expect(screen.queryByText('加载设置失败')).toBeNull();
		},
	);
});
