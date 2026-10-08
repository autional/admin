// W1c（A-128 · A-129 · A-130 · A-131）：安全策略页回归锁 ——
//   A-128：blocked_countries 回读（旧硬编码 [] → 已配置列表不可见）
//   A-129：边界三层同源（min_length ≥6 / max_attempts_per_user [1,100]，旧 [4..] / [0,20]）
//          + duration 格式前端预校验（旧自由文本直送 ParseDuration 必 400 且报错英文）
//   A-130：标签/分组走 t()（tab 标题 + 分组标题，旧硬编码中文）
//   A-131：GET 失败显示错误态（旧 error 未解构 → 空白表单被当现状，据空白保存）
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent, cleanup, configure } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router';
import { apiClient, useAuthStore } from '@autional/shared';
import PolicyPage from '../policy/page';

vi.mock('@/lib/antd-app', () => ({
	message: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

// W1c 全量并发加固：78 文件并跑满载时首用例表单回填可超 waitFor 默认 1s 预算
// （全量门实测：password-policy 首用例 value='' 超时；隔离跑 3/3 绿）。
configure({ asyncUtilTimeout: 15000 });

const TENANT = 'tenant-w1c-pol';
const POLICY_URL = `/tenant/api/v1/admin/tenants/${TENANT}/security-policy`;
const TS = '2026-10-06T00:00:00Z';

/** wire 形状（snake）安全策略（service-tenant dto.go:337-346 SecurityPolicyResponse）。 */
const RAW_POLICY = {
	password_policy: {
		min_length: 10,
		max_length: 128,
		require_uppercase: true,
		require_lowercase: true,
		require_digit: false,
		require_special: false,
	},
	session_policy: {
		timeout_seconds: 1800,
		max_concurrent_sessions: 5,
	},
	ip_whitelist: ['10.0.0.1'],
	blocked_countries: ['KP', 'US'],
	mfa_required: true,
};

let originalAdapter: unknown;
let failGet = false;
const puts: Array<Record<string, unknown>> = [];

function httpError(status: number, config: any) {
	const err: any = new Error(`Request failed with status code ${status}`);
	err.response = { status, data: { code: `${status}00000` }, headers: {}, config };
	err.config = config;
	return err;
}

function ok(payload: unknown, config: any) {
	return { data: payload, status: 200, statusText: 'OK', headers: {}, config };
}

function installCaptureAdapter() {
	puts.length = 0;
	originalAdapter = apiClient.defaults.adapter;
	apiClient.defaults.adapter = (async (config: any) => {
		const url = String(config.url || '');
		const method = String(config.method || 'get').toLowerCase();
		if (url.includes('/security-policy')) {
			if (method === 'get') {
				if (failGet) throw httpError(500, config);
				return ok({ code: 0, message: 'success', data: RAW_POLICY, timestamp: TS }, config);
			}
			let body: Record<string, unknown> = {};
			if (typeof config.data === 'string') body = JSON.parse(config.data);
			else if (config.data && typeof config.data === 'object') body = config.data;
			puts.push(body);
			return ok({ code: 0, message: 'success', data: RAW_POLICY, timestamp: TS }, config);
		}
		return ok({ code: 0, message: 'success', data: {}, timestamp: TS }, config);
	}) as any;
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
			<MemoryRouter>
				<PolicyPage />
			</MemoryRouter>
		</QueryClientProvider>,
	);
}

async function dataGate() {
	await waitFor(() => {
		const el = document.querySelector('#passwordMinLength') as HTMLInputElement | null;
		expect(el).toBeTruthy();
		expect(el!.value).toBe('10');
	});
}

describe('安全策略页（A-128/A-129/A-130/A-131）', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		failGet = false;
		resetAuthStore();
		seedSession(TENANT);
		installCaptureAdapter();
	});

	afterEach(() => {
		cleanup();
		apiClient.defaults.adapter = originalAdapter as any;
		resetAuthStore();
	});

	it(
		'AC-B5-W1c-15/18：blocked_countries 回读上屏 + 边界同源（min_length=6 / max_attempts=[1,100]）',
		{ timeout: 20000 },
		async () => {
			renderPage();
			await dataGate();

			// A-128：受限地域回读（旧硬编码 [] → 「美国」标签不出 → 必红）
			expect(await screen.findByText('美国')).toBeTruthy();

			// A-129：password_min_length min=6（旧 4 → 必红）
			const minLen = document.querySelector('#passwordMinLength') as HTMLInputElement;
			expect(minLen.getAttribute('aria-valuemin')).toBe('6');
			// A-129：max_attempts_per_user [1,100]（旧 [0,20] → 必红）
			const attempts = document.querySelector('#maxAttemptsPerUser') as HTMLInputElement;
			expect(attempts.getAttribute('aria-valuemin')).toBe('1');
			expect(attempts.getAttribute('aria-valuemax')).toBe('100');

			// A-130：标签键化（分组标题/字段标签上屏）
			expect(screen.getByText('密码复杂度')).toBeTruthy();
			expect(screen.getByText('账号与会话')).toBeTruthy();
		},
	);

	it('AC-B5-W1c-15/18：duration 格式前端预校验（非法不发请求；合法上 wire）', { timeout: 20000 }, async () => {
		renderPage();
		await dataGate();

		const lock = document.querySelector('#lockDuration') as HTMLInputElement;
		fireEvent.change(lock, { target: { value: '30' } });
		fireEvent.click(screen.getByRole('button', { name: /保存/ }));

		expect(
			await screen.findByText('格式无效，需为数字+单位（h/m/s）组合，如 30m、1h30m'),
		).toBeTruthy();
		expect(puts.length).toBe(0);

		fireEvent.change(lock, { target: { value: '1h30m' } });
		fireEvent.click(screen.getByRole('button', { name: /保存/ }));
		await waitFor(() => expect(puts.length).toBe(1));
		expect(puts[0]).toMatchObject({ lock_duration: '1h30m' });
	});

	it('AC-B5-W1c-15：GET 失败显示错误态「加载安全策略失败」+ 重试可达（旧静默空白表单 → 必红）', { timeout: 20000 }, async () => {
		failGet = true;
		renderPage();

		expect(await screen.findByText('加载安全策略失败')).toBeTruthy();
		expect(screen.getByRole('button', { name: /重试/ })).toBeTruthy();
	});
});
