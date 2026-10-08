// W1d（A-150）：品牌定制页回归锁（三断言）——
//   ① 非法色值拦截/归一：历史非法值 'var(--color-primary-700)' → 兜底 #1890ff；AggregationColor 实例 → hex
//   ② 刷新改局部 refetch（旧 window.location.reload() 整页重载；jsdom 下旧实现不产生新 GET → 计数判红）
//   ③ usePageTitle（document.title = 「品牌定制 — Autional」）
// 断言口径 = 最终 wire 请求（adapter 最末环捕获）+ 归一函数单测。
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent, cleanup, configure } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { apiClient, useAuthStore } from '@autional/shared';
import BrandingPage, { colorToHex, toLegalColor } from '../page';

vi.mock('@/lib/antd-app', () => ({
	message: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

// W1c 全量并发加固：78 文件并跑满载时首用例取数可超 waitFor 默认 1s 预算。
configure({ asyncUtilTimeout: 15000 });

const TENANT = 'tenant-w1d-brand';
const BRANDING_URL = `/tenant/api/v1/admin/tenants/${TENANT}/branding`;
const TS = '2026-10-06T00:00:00Z';

/** wire 形状（snake）：primary 为历史非法值（CSS var）→ 页面须兜底 #1890ff（旧实现原样落 ColorPicker = 黑闪）。 */
const RAW_BRANDING = {
	tenant_id: TENANT,
	primary_color: 'var(--color-primary-700)',
	background_color: '#ffffff',
	border_radius: 8,
	login_title: '欢迎登录',
	login_subtitle: '请使用企业账号登录',
};

interface Captured {
	method: string;
	url: string;
	body?: Record<string, unknown>;
}

const captured: Captured[] = [];
let getCount = 0;
let originalAdapter: unknown;

function ok(payload: unknown, config: any) {
	return { data: payload, status: 200, statusText: 'OK', headers: {}, config };
}

function installCaptureAdapter() {
	getCount = 0;
	captured.length = 0;
	originalAdapter = apiClient.defaults.adapter;
	apiClient.defaults.adapter = (async (config: any) => {
		const url = String(config.url || '');
		const method = String(config.method || 'get').toLowerCase();
		let body: Record<string, unknown> | undefined;
		if (typeof config.data === 'string' && config.data.length > 0) {
			body = JSON.parse(config.data);
		} else if (config.data && typeof config.data === 'object') {
			body = config.data as Record<string, unknown>;
		}
		captured.push({ method, url, body });
		if (url === BRANDING_URL) {
			if (method === 'get') {
				getCount += 1;
				return ok({ code: 0, message: 'ok', data: RAW_BRANDING, timestamp: TS }, config);
			}
			return ok({ code: 0, message: 'ok', data: RAW_BRANDING, timestamp: TS }, config);
		}
		return ok({ code: 0, message: 'ok', data: {}, timestamp: TS }, config);
	}) as any;
	// A-150 反证探针（同 A-125 手法）：旧实现 window.location.reload() 在 jsdom
	// （Location 属性 unforgeable、不可挂桩）中不产生新 GET —— getCount 计数即可判红。
}

function seedSession(tenantId: string): void {
	useAuthStore.setState({
		user: { id: 'u-1', username: 'tester' } as never,
		accessToken: null,
		refreshToken: null,
		tenants: [{ id: tenantId, name: 'T', role: 'admin' }],
		currentTenantId: tenantId,
		permissions: [],
		isAuthenticated: true,
	});
}

function resetAuthStore(): void {
	useAuthStore.setState({
		user: null,
		accessToken: null,
		refreshToken: null,
		tenants: [],
		currentTenantId: null,
		permissions: [],
		isAuthenticated: false,
	});
	window.localStorage.clear();
}

function renderPage() {
	const queryClient = new QueryClient({
		defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
	});
	return render(
		<QueryClientProvider client={queryClient}>
			<BrandingPage />
		</QueryClientProvider>,
	);
}

const putCalls = () => captured.filter((c) => c.method === 'put' && c.url === BRANDING_URL);

describe('品牌定制页（A-150）', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		resetAuthStore();
		seedSession(TENANT);
		installCaptureAdapter();
	});

	afterEach(() => {
		cleanup();
		apiClient.defaults.adapter = originalAdapter as any;
		resetAuthStore();
	});

	it('AC-B5-W1d-01①：色值归一单测（非法 CSS var 兜底 / AggregationColor 实例 → hex / 合法透传）', () => {
		// colorToHex：string 透传；AggregationColor 类实例取 toHexString；其余空串
		expect(colorToHex('#1890ff')).toBe('#1890ff');
		expect(colorToHex({ toHexString: () => '#ABCDEF' })).toBe('#ABCDEF');
		expect(colorToHex(undefined)).toBe('');
		expect(colorToHex(123)).toBe('');
		// toLegalColor：非法（CSS var/空/乱串）→ fallback；合法（3/6 位 hex）→ 透传
		expect(toLegalColor('var(--color-primary-700)', '#1890ff')).toBe('#1890ff');
		expect(toLegalColor('', '#ffffff')).toBe('#ffffff');
		expect(toLegalColor('red', '#ffffff')).toBe('#ffffff');
		expect(toLegalColor('#abc', '#1890ff')).toBe('#abc');
		expect(toLegalColor({ toHexString: () => '#ABCDEF' }, '#1890ff')).toBe('#ABCDEF');
	});

	it('AC-B5-W1d-01①③：页级非法值兜底 + 提交体归一（旧实现原样透传 var() → 必红）+ title 同源', { timeout: 20000 }, async () => {
		renderPage();
		await waitFor(() => expect(getCount).toBe(1));

		// ① 页级：ColorPicker 触发区文本 = 兜底合法色（旧行为解析失败 → #000000 黑闪）
		// antd v6：showText 渲染 `.ant-color-picker-trigger-text` div（大写 hex）；首个 = primaryColor。
		await waitFor(() => {
			const text = document.querySelector('.ant-color-picker-trigger-text');
			expect(text).toBeTruthy();
			expect(text!.textContent?.toUpperCase()).toContain('#1890FF');
		});

		// ③ usePageTitle（与面包屑同源；原 tab 恒默认站名）
		await waitFor(() => expect(document.title).toBe('品牌定制 — Autional'));

		// ① 提交体归一：保存 → PUT body.primary_color 必须为合法 hex（非 var(...)）
		fireEvent.click(screen.getByRole('button', { name: /保存配置/ }));
		await waitFor(() => expect(putCalls().length).toBe(1));
		expect(putCalls()[0].body!.primary_color).toBe('#1890ff');
		expect(putCalls()[0].body!.background_color).toBe('#ffffff');
	});

	it('AC-B5-W1d-01②：刷新走局部 refetch（第二次 GET；旧整页 reload 不产生请求 → 必红）', { timeout: 20000 }, async () => {
		renderPage();
		await waitFor(() => expect(getCount).toBe(1));

		fireEvent.click(screen.getByRole('button', { name: /刷新/ }));

		await waitFor(() => expect(getCount).toBe(2));
	});
});
