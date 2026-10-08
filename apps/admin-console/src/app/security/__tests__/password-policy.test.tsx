// W1c（A-119 · A-120）：密码策略页回归锁 ——
//   A-119：与「认证配置」页共用同一密码策略写路径 —— 回显键映射对齐（requireUpper/requireLower →
//          requireUppercase/requireLowercase）；主从口径 Alert + 交叉链接（主面 = 认证配置）。
//   A-120：专属保存文案（旧复用 t('mfa.saveFailed') 跨模块误导）+ 字段展示补齐
//          （max_length / grace_period_days / change_cooldown_minutes 旧读后即弃）+ 回退链
//          （未触碰保存不送零值；响应无回读值的字段省略键 → 后端保留现值，A-117 部分）。
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent, cleanup, configure } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router';
import { apiClient, useAuthStore } from '@autional/shared';
import { message } from '@/lib/antd-app';
import PasswordPolicyPage from '../password-policy/page';

vi.mock('@/lib/antd-app', () => ({
	message: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

// W1c 全量并发加固：78 文件并跑满载时首用例表单回填可超 waitFor 默认 1s 预算
// （全量门实测：password-policy 首用例 value='' 超时；隔离跑 3/3 绿）。
configure({ asyncUtilTimeout: 15000 });

const POLICY_URL = '/identity/api/v1/admin/security/password-policy';
const TS = '2026-10-06T00:00:00Z';

/** wire 形状（snake）密码策略（identity dto/policy.go PasswordPolicyResponse json tag）。 */
const RAW_POLICY = {
	min_length: 10,
	max_length: 128,
	require_upper: true,
	require_lower: false,
	require_digit: true,
	require_special: false,
	expiry_days: 90,
	grace_period_days: 7,
	history_count: 5,
	change_cooldown_minutes: 60,
	check_breached_passwords: true,
};

let originalAdapter: unknown;
let failPut = false;
const puts: Array<Record<string, unknown>> = [];

// 空 Error.message：错误键链（data.message → title → detail → err.message → fallback）落到 fallback
// —— 专属文案断言路径（axios 非空 message 会抢占 fallback，按仓内既有模式置空）。
function httpError(status: number, config: any, data?: unknown) {
	const err: any = new Error('');
	err.response = { status, data: data ?? { code: `${status}00000` }, headers: {}, config };
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
		if (url.includes('/security/password-policy')) {
			if (method === 'get') {
				return ok({ code: 0, message: 'success', data: RAW_POLICY, timestamp: TS }, config);
			}
			if (failPut) throw httpError(500, config);
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
				<PasswordPolicyPage />
			</MemoryRouter>
		</QueryClientProvider>,
	);
}

async function dataGate() {
	await waitFor(() => {
		const el = document.querySelector('#maxLength') as HTMLInputElement | null;
		expect(el).toBeTruthy();
		expect(el!.value).toBe('128');
	});
}

describe('密码策略页（A-119/A-120，含 A-117 部分）', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		failPut = false;
		resetAuthStore();
		seedSession('tenant-w1c-pw');
		installCaptureAdapter();
	});

	afterEach(() => {
		cleanup();
		apiClient.defaults.adapter = originalAdapter as any;
		resetAuthStore();
	});

	it(
		'AC-B5-W1c-13/14：回显映射（requireUpper 勾选）+ 字段补齐（maxLength/gracePeriodDays/changeCooldownMinutes）+ 主从 Alert/Link',
		{ timeout: 20000 },
		async () => {
			renderPage();
			await dataGate();

			// A-119 映射：require_upper → requireUppercase（旧未映射 → 未勾 → 必红）
			expect(
				(screen.getByRole('checkbox', { name: '必须包含大写字母' }) as HTMLInputElement).checked,
			).toBe(true);
			// A-120 字段展示补齐（旧读后即弃 → 控件不存在 → 必红）
			expect((document.querySelector('#gracePeriodDays') as HTMLInputElement).value).toBe('7');
			expect((document.querySelector('#changeCooldownMinutes') as HTMLInputElement).value).toBe(
				'60',
			);

			// A-119 主从口径：Alert 提示 + 交叉链接指向认证配置
			expect(await screen.findByText(/以「认证配置」页为主面/)).toBeTruthy();
			const link = screen.getByRole('link', { name: '前往认证配置' }) as HTMLAnchorElement;
			expect(link.getAttribute('href')).toContain('/security/auth-config');
		},
	);

	it(
		'AC-B5-W1c-13/14：保存 payload 全量回读值齐发；无回读字段（max_login_attempts/lock_duration_sec）省略键',
		{ timeout: 20000 },
		async () => {
			renderPage();
			await dataGate();

			fireEvent.click(screen.getByRole('button', { name: /保存/ }));
			await waitFor(() => expect(puts.length).toBeGreaterThan(0));
			const body = puts[0];
			expect(body).toMatchObject({
				min_length: 10,
				max_length: 128,
				require_upper: true,
				expiry_days: 90,
				grace_period_days: 7,
				change_cooldown_minutes: 60,
				check_breached_passwords: true,
			});
			// A-117 部分：响应 DTO 无回读值的字段 undefined → 省略键（后端指针保留现值，防静默清零）
			expect(body).not.toHaveProperty('max_login_attempts');
			expect(body).not.toHaveProperty('lock_duration_sec');
			await waitFor(() => expect(message.success).toHaveBeenCalledWith('密码策略保存成功'));
		},
	);

	it('AC-B5-W1c-14：保存失败显示专属文案「密码策略保存失败」（旧复用 mfa.saveFailed → 必红）', { timeout: 20000 }, async () => {
		failPut = true;
		renderPage();
		await dataGate();

		fireEvent.click(screen.getByRole('button', { name: /保存/ }));
		await waitFor(() =>
			expect(message.error).toHaveBeenCalledWith('密码策略保存失败'),
		);
	});
});
