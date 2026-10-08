// W1d（A-179 · A-181 · A-182）：通信配置页回归锁 ——
//   A-181：useChannelStats 死取数删——首屏零 health 请求；「连通性检查」按钮触发单次请求（阳性对照）
//   A-179：失败行发送时间不再恒空（sent_at 缺省回退 created_at）
//   A-182：仪表盘时间窗接线（days 默认 30 上 wire；切 7 天发新请求 days=7 + 卡题同步）
// 断言口径 = 最终 wire 请求/响应（axios adapter 最末环捕获，与线上链路同构）。
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent, cleanup, configure } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { apiClient } from '@autional/shared';
import CommunicationPage from '../page';

vi.mock('@/lib/antd-app', () => ({
	message: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
	modal: { confirm: vi.fn() },
}));

// W1c 全量并发加固：78 文件并跑满载时首用例取数可超 waitFor 默认 1s 预算。
configure({ asyncUtilTimeout: 15000 });

const DASH_URL = '/communication/api/v1/admin/communication/dashboard';
const LOGS_URL = '/communication/api/v1/admin/communication/logs';
const PROVIDERS_URL = '/communication/api/v1/admin/communication/providers';
const TS = '2026-10-06T00:00:00Z';

interface Captured {
	method: string;
	url: string;
	params?: Record<string, unknown>;
}

const captured: Captured[] = [];
let originalAdapter: unknown;

/** wire 形状（snake）日志：行 1 失败行（sent_at 缺省 → 回退 created_at）；行 2 正常行。 */
const RAW_LOGS = [
	{
		id: 'log-1',
		channel: 'sms',
		recipient: '13800000000',
		status: 'failed',
		sent_at: '',
		created_at: '2026-01-02T03:04:05Z',
	},
	{
		id: 'log-2',
		channel: 'email',
		recipient: 'a@b.c',
		status: 'delivered',
		sent_at: '2026-01-02T04:00:00Z',
		created_at: '2026-01-02T03:59:00Z',
	},
];

function ok(payload: unknown, config: any) {
	return { data: payload, status: 200, statusText: 'OK', headers: {}, config };
}

function installCaptureAdapter() {
	captured.length = 0;
	originalAdapter = apiClient.defaults.adapter;
	apiClient.defaults.adapter = (async (config: any) => {
		const url = String(config.url || '');
		const method = String(config.method || 'get').toLowerCase();
		captured.push({ method, url, params: config.params as Record<string, unknown> | undefined });
		if (url === DASH_URL) {
			return ok(
				{
					code: 0,
					message: 'ok',
					data: {
						total_sent: 120,
						delivered: 118,
						failed: 2,
						delivery_rate: 0.98,
						by_channel: { email: 100, sms: 20 },
						by_status: { delivered: 118, failed: 2 },
					},
					timestamp: TS,
				},
				config,
			);
		}
		if (url === LOGS_URL) {
			return ok({ code: 0, message: 'ok', items: RAW_LOGS, total: 2, timestamp: TS }, config);
		}
		if (url === PROVIDERS_URL) {
			return ok({ code: 0, message: 'ok', items: [], total: 0, timestamp: TS }, config);
		}
		if (url.includes('/admin/communication/health/')) {
			return ok({ code: 0, message: 'ok', data: { status: 'healthy', latency: '12ms' }, timestamp: TS }, config);
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
			<CommunicationPage />
		</QueryClientProvider>,
	);
}

const calls = (part: string) => captured.filter((c) => c.url.includes(part));
const dashCalls = () => captured.filter((c) => c.method === 'get' && c.url === DASH_URL);
const healthCalls = () => captured.filter((c) => c.url.includes('/admin/communication/health/'));

async function openEmailTab() {
	fireEvent.click(await screen.findByRole('tab', { name: '邮件' }));
	await waitFor(() => expect(document.querySelector('#email_provider')).toBeTruthy());
}

describe('通信配置页（A-179/A-181/A-182）', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		installCaptureAdapter();
	});

	afterEach(() => {
		cleanup();
		apiClient.defaults.adapter = originalAdapter as any;
	});

	it('AC-B5-W1d-16：首屏零 health 死请求（旧 useChannelStats 挂载即发 → 必红）；检查按钮单发阳性对照', { timeout: 20000 }, async () => {
		renderPage();
		await waitFor(() => expect(dashCalls().length).toBeGreaterThan(0));
		await waitFor(() => expect(calls('/logs').length).toBeGreaterThan(0));

		// A-181：首屏（含 tab 未挂载）零 health 请求
		expect(healthCalls()).toHaveLength(0);

		// 阳性对照：连通性检查按钮 → 单次 health 请求（email 渠道）
		await openEmailTab();
		fireEvent.click(screen.getByRole('button', { name: /连通性检查/ }));
		await waitFor(() => expect(healthCalls().length).toBe(1));
		expect(healthCalls()[0].url).toBe('/communication/api/v1/admin/communication/health/email');
		expect(await screen.findByText('正常')).toBeTruthy();
	});

	it('AC-B5-W1d-15：失败行发送时间回退 created_at（旧实现恒 -/空 → 必红）', { timeout: 20000 }, async () => {
		renderPage();
		await openEmailTab();

		// 行 1（failed，sent_at 空）→ 发送时间列显示 created_at
		expect(await screen.findByText('2026-01-02T03:04:05Z')).toBeTruthy();
		// 行 2（有 sent_at）→ 原值
		expect(screen.getByText('2026-01-02T04:00:00Z')).toBeTruthy();
	});

	it('AC-B5-W1d-17：时间窗默认 30 上 wire；切 7 天 → 新请求 days=7 + 卡题同步', { timeout: 20000 }, async () => {
		renderPage();
		await waitFor(() => expect(dashCalls().length).toBeGreaterThan(0));

		// 默认 30 天入参 + 卡题近30天
		expect(dashCalls()[0].params).toMatchObject({ days: 30 });
		expect(await screen.findByText('总发送数（近30天）')).toBeTruthy();

		// 窗口组件（仪表盘页签唯一 Select）→ 切 7 天
		const selectContent = document.querySelector('.ant-select-content') as HTMLElement;
		expect(selectContent).toBeTruthy();
		fireEvent.mouseDown(selectContent);
		const option = await waitFor(() => {
			const el = document.querySelector('.ant-select-item-option[title="7天"]');
			expect(el).toBeTruthy();
			return el as HTMLElement;
		});
		fireEvent.click(option);

		await waitFor(() => expect(dashCalls().some((c) => c.params?.days === 7)).toBe(true));
		expect(await screen.findByText('总发送数（近7天）')).toBeTruthy();
	});
});
