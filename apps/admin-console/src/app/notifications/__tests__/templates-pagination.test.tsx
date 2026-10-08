// W1d（A-155 · A-156）：通知模板页回归锁 ——
//   A-156：服务端分页接线（首屏 page/page_size 上 wire；切页发 page=2 请求）+ usePageTitle
//   A-155：平台默认模板可见性面板（/available admin twin：source/isCustomized/locale 呈现）
// 断言口径 = 最终 wire 请求/响应（axios adapter 最末环捕获，与线上链路同构）。
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent, cleanup, configure } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { apiClient } from '@autional/shared';
import NotificationTemplatesPage from '../templates/page';

vi.mock('@/lib/antd-app', () => ({
	message: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
	modal: { confirm: vi.fn() },
}));

// W1c 全量并发加固：78 文件并跑满载时首用例取数可超 waitFor 默认 1s 预算。
configure({ asyncUtilTimeout: 15000 });

const LIST_URL = '/notification/api/v1/admin/notifications/templates';
const AVAILABLE_URL = '/notification/api/v1/admin/notifications/templates/available';
const TS = '2026-10-06T00:00:00Z';

interface Captured {
	method: string;
	url: string;
	params?: Record<string, unknown>;
}

const captured: Captured[] = [];
let originalAdapter: unknown;

/** wire 形状（snake）行：10 条（total=25 → 3 页）。 */
const RAW_TEMPLATES = Array.from({ length: 10 }, (_, i) => ({
	template_id: `tpl-${i + 1}`,
	name: `租户模板${String(i + 1).padStart(2, '0')}`,
	type: 'system',
	subject: '主题',
	content: '正文',
	created_at: '2026-01-01T00:00:00Z',
}));

/** wire 形状（snake）平台默认集（AvailableTemplateListResponse：平铺 items）。 */
const RAW_AVAILABLE = [
	{ code: 'welcome', name: '平台欢迎模板', source: 'platform', locale: 'zh-CN', is_customized: true },
	{ code: 'otp', name: '平台验证码模板', source: 'platform', locale: 'en-US', is_customized: false },
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
		if (url === AVAILABLE_URL) {
			return ok({ code: 0, message: 'ok', items: RAW_AVAILABLE, total: 2, timestamp: TS }, config);
		}
		if (url === LIST_URL) {
			return ok(
				{
					code: 0,
					message: 'ok',
					items: RAW_TEMPLATES,
					total: 25,
					pagination: { total: 25, page: 1, page_size: 10, total_pages: 3, has_next: true },
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
			<NotificationTemplatesPage />
		</QueryClientProvider>,
	);
}

const listCalls = () => captured.filter((c) => c.method === 'get' && c.url === LIST_URL);

describe('通知模板页（A-155/A-156）', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		installCaptureAdapter();
	});

	afterEach(() => {
		cleanup();
		apiClient.defaults.adapter = originalAdapter as any;
	});

	it('AC-B5-W1d-03：分页参上 wire（首屏 page/page_size；切页发 page=2）+ title 同源', { timeout: 20000 }, async () => {
		renderPage();

		expect(await screen.findByText('租户模板01')).toBeTruthy();
		await waitFor(() => expect(listCalls().length).toBeGreaterThan(0));
		// A-156：首屏请求 = page/page_size（旧实现无参 → 后端默认 page_size=20 截断）
		expect(listCalls()[0].params).toMatchObject({ page: 1, page_size: 10 });

		// total=25 → 第 2 页可达；切页发出 page=2 服务端请求
		expect(screen.getByTitle('2')).toBeTruthy();
		fireEvent.click(screen.getByTitle('2'));
		await waitFor(() => expect(listCalls().some((c) => c.params?.page === 2)).toBe(true));

		// A-156 三断言之一：usePageTitle（原 tab 恒默认站名）
		expect(document.title).toBe('通知模板 — Autional');
	});

	it('AC-B5-W1d-02：平台可用模板面板（/available）——面板展开呈现平台集（source/已定制/locale）', { timeout: 20000 }, async () => {
		renderPage();
		expect(await screen.findByText('租户模板01')).toBeTruthy();

		// /available admin twin 已取数（flat items 响应形状）
		expect(captured.some((c) => c.method === 'get' && c.url === AVAILABLE_URL)).toBe(true);

		// 面板默认折叠：展开后可见平台集行与来源/定制标签
		fireEvent.click(screen.getByText('平台可用模板'));
		expect(await screen.findByText('平台欢迎模板')).toBeTruthy();
		expect(screen.getByText('平台验证码模板')).toBeTruthy();
		// source=platform → 「平台」标签 ×2（本样例无租户条目 → 「租户」零命中）
		expect(screen.getAllByText('平台')).toHaveLength(2);
		expect(screen.queryByText('租户')).toBeNull();
		// is_customized=true 的行带「已定制」标签；locale 列呈现
		expect(screen.getAllByText('已定制')).toHaveLength(1);
		expect(screen.getByText('zh-CN')).toBeTruthy();
		expect(screen.getByText('en-US')).toBeTruthy();
	});
});
