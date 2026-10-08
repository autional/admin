// W1d（A-162 · A-163）：通知统计页回归锁 ——
//   A-162：trend / readReport 错误态分流（旧实现错误被伪装成「暂无趋势数据」/ 全 0 静默零值）
//   A-163：零填充 zeroFillTrend + 阅读率着色阈值单源（零值中性）+ 读报表卡去重
// 断言口径 = 错误注入（adapter 单 URL 500）+ 分支文案可见性 + 归一函数单测。
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, cleanup, configure } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { apiClient } from '@autional/shared';
import NotificationStatsPage, { zeroFillTrend, readRateColor } from '../stats/page';

vi.mock('@/lib/antd-app', () => ({
	message: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

// W1c 全量并发加固：78 文件并跑满载时首用例取数可超 waitFor 默认 1s 预算。
configure({ asyncUtilTimeout: 15000 });

const STATS_URL = '/notification/api/v1/admin/notifications/stats';
const TREND_URL = '/notification/api/v1/admin/notifications/trend';
const REPORT_URL = '/notification/api/v1/admin/notifications/read-report';
const TS = '2026-10-06T00:00:00Z';

let failTrend = false;
let failReport = false;
let originalAdapter: unknown;

function ok(payload: unknown, config: any) {
	return { data: payload, status: 200, statusText: 'OK', headers: {}, config };
}

function fail(config: any) {
	return Promise.reject(
		Object.assign(new Error('boom'), {
			response: { status: 500, data: { code: 500, message: 'boom' } },
			config,
		}),
	);
}

function installCaptureAdapter() {
	failTrend = false;
	failReport = false;
	originalAdapter = apiClient.defaults.adapter;
	apiClient.defaults.adapter = (async (config: any) => {
		const url = String(config.url || '');
		if (url === TREND_URL) {
			if (failTrend) return fail(config);
			return ok(
				{
					code: 0,
					message: 'ok',
					data: {
						items: [
							{ date: '2026-01-01', sent: 10, read: 4 },
							{ date: '2026-01-03', sent: 6, read: 3 },
						],
					},
					timestamp: TS,
				},
				config,
			);
		}
		if (url === STATS_URL) {
			return ok(
				{
					code: 0,
					message: 'ok',
					data: { total_sent: 120, total_read: 40, read_rate: 0.33, by_type: { system: 120 } },
					timestamp: TS,
				},
				config,
			);
		}
		if (url === REPORT_URL) {
			if (failReport) return fail(config);
			return ok(
				{
					code: 0,
					message: 'ok',
					data: { read_count: 40, unread_count: 80, read_rate: 0.33, total_sent: 120 },
					timestamp: TS,
				},
				config,
			);
		}
		return ok({ code: 0, message: 'ok', data: {}, timestamp: TS }, config);
	}) as any;
}

function renderPage() {
	const queryClient = new QueryClient({
		defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
	});
	return render(
		<QueryClientProvider client={queryClient}>
			<NotificationStatsPage />
		</QueryClientProvider>,
	);
}

describe('通知统计页（A-162/A-163）', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		installCaptureAdapter();
	});

	afterEach(() => {
		cleanup();
		apiClient.defaults.adapter = originalAdapter as any;
	});

	it('AC-B5-W1d-06：trend 失败 → 「趋势数据加载失败」且空态文案不出现（旧实现伪装零数据 → 必红）', { timeout: 20000 }, async () => {
		failTrend = true;
		renderPage();

		expect(await screen.findByText('趋势数据加载失败')).toBeTruthy();
		// 错误不是空态：旧实现的「暂无趋势数据」不得出现
		expect(screen.queryByText('暂无趋势数据')).toBeNull();
		// stats 主查询仍成功（错误分流不影响其他卡）
		expect(await screen.findByText('总发送数')).toBeTruthy();
	});

	it('AC-B5-W1d-06：readReport 失败 → 「已读回执加载失败」（旧实现全 0 静默 → 必红）', { timeout: 20000 }, async () => {
		failReport = true;
		renderPage();

		expect(await screen.findByText('已读回执加载失败')).toBeTruthy();
		// 成功分支的「未读数」不得出现（旧实现零值兜底会渲染 0）
		expect(screen.queryByText('未读数')).toBeNull();
	});

	it('AC-B5-W1d-07：全成功路径——读报表卡去重（总发送数/阅读率各 1 处）+ 数据面可见', { timeout: 20000 }, async () => {
		renderPage();

		expect(await screen.findByText('总发送数')).toBeTruthy();
		expect(screen.getAllByText('总发送数')).toHaveLength(1);
		expect(screen.getAllByText('阅读率')).toHaveLength(1);
		// 去重后本卡只留已读/未读
		expect(await screen.findByText('已读数')).toBeTruthy();
		expect(screen.getByText('未读数')).toBeTruthy();
	});

	it('AC-B5-W1d-07：zeroFillTrend 逐日补齐缺口 + 空输入；readRateColor 零值中性', () => {
		// 缺口填充：01-01 与 01-03 之间补 01-02（sent/read=0）
		expect(
			zeroFillTrend([
				{ date: '2026-01-01', sent: 10, read: 4 },
				{ date: '2026-01-03', sent: 6, read: 3 },
			]),
		).toEqual([
			{ date: '2026-01-01', sent: 10, read: 4 },
			{ date: '2026-01-02', sent: 0, read: 0 },
			{ date: '2026-01-03', sent: 6, read: 3 },
		]);
		// 单点/空输入恒等
		expect(zeroFillTrend([{ date: '2026-01-01', sent: 1, read: 1 }])).toHaveLength(1);
		expect(zeroFillTrend([])).toEqual([]);

		// 阈值单源：零值/缺值 → 无色（旧实现 (0>0.4)=false 恒失败色）；>0 才按阈值
		expect(readRateColor(undefined)).toBeUndefined();
		expect(readRateColor(0)).toBeUndefined();
		expect(readRateColor(0.5)).toBe('var(--color-success-light)');
		expect(readRateColor(0.4)).toBe('var(--color-error-light)');
		expect(readRateColor(0.2)).toBe('var(--color-error-light)');
	});
});
