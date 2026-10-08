// W1e-30（fix-admin-b5-polish / A-269 核实 + A-270 + A-271 + A-272）：未成年保护页收口回归锁。
//
//   A-269（核实）：consents 表三列键错配（wire camel 直读）——HEAD 已达标，锁定防回退；
//   A-270：users 分页 showTotal 旧传 { count } 而模板 {{total}} ⇒ DOM 字面量 → 改 { total }
//           （W1x 交集：仅改占位符行，className/p-6 零触碰——见 w1e-record 差异化证据）；
//   A-271：统计卡首屏恒 0（users 懒加载）→ 挂载即载 + 三态（未载 '-' / 已载真值）+ Tab 点击不二次触发；
//   A-272（分支②补展示，决议落档）：wire 两阈值字段（minors_age_threshold/digital_consent_age）
//           原零 UI → 只读回显「未成年人年龄阈值 / 数字同意年龄」。
//
// 断言口径 = 渲染输出 + 请求实参；负控：挂载前统计卡不显示真值 / 首屏请求数（旧形态 0 次）判别。

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent, cleanup, configure } from '@testing-library/react';
import { apiClient, useAuthStore } from '@autional/shared';

// 全量门并行负载下，antd 动画/首渲染可超测试库默认 1000ms 异步超时 → 放宽（防假红）
configure({ asyncUtilTimeout: 5000 });
import MinorsProtectionPage from '../page';

vi.mock('@/lib/antd-app', () => ({
	message: { success: vi.fn(), error: vi.fn() },
	modal: { confirm: vi.fn() },
}));

const TENANT = 'tenant-w1e-minors';
const CONFIG_URL = `/tenant/api/v1/admin/tenants/${TENANT}/minors-protection`;
const USERS_URL = '/identity/api/v1/admin/users';
const CONSENTS_URL = '/identity/api/v1/admin/consents';
const TS = '2026-10-04T00:00:00Z';

/** wire 形状（snake）配置夹具：含 A-272 两阈值字段（HEAD 之前零 UI 的两键）。 */
const RAW_CONFIG = {
	tenant_id: TENANT,
	daily_usage_limit_min: 60,
	night_mode_start: '22:00',
	night_mode_end: '06:00',
	night_mode_enabled: true,
	monthly_spend_limit: 10000,
	live_stream_blocked_under16: true,
	content_filter_enabled: true,
	child_default_max_privacy: true,
	minor_data_retention_days: 365,
	minors_age_threshold: 18,
	digital_consent_age: 13,
};

function rawUser() {
	return {
		id: 'user-p1-1',
		tenant_id: TENANT,
		email: 'p1@example.com',
		phone: '13800000000',
		username: 'minor-p1',
		status: 'active',
		is_minor: true,
		age_group: '14-16',
		birth_date: '2012-01-01',
		pending_parental_consent: true,
		created_at: '2026-10-01T00:00:00Z',
	};
}

function rawConsent() {
	return {
		id: 'consent-1',
		user_id: 'minor-of-p1',
		parent_email: 'parent-p1@example.com',
		parent_phone: '13800000000',
		status: 'verified',
		verified: true,
		method: 'email',
		recorded_at: '2026-10-01T10:00:00Z',
	};
}

interface Captured {
	url: string;
	method: string;
	params?: unknown;
}

let captured: Captured[] = [];
let originalAdapter: unknown;

function ok(payload: unknown, config: any) {
	return { data: payload, status: 200, statusText: 'OK', headers: {}, config };
}

function installCaptureAdapter() {
	captured = [];
	originalAdapter = apiClient.defaults.adapter;
	apiClient.defaults.adapter = (async (config: any) => {
		const url = String(config.url || '');
		const method = String(config.method || 'get').toLowerCase();
		captured.push({ url, method, params: config.params });
		if (url === CONFIG_URL) {
			return ok({ code: 0, message: 'success', data: RAW_CONFIG, timestamp: TS }, config);
		}
		if (url === USERS_URL) {
			return ok({ code: 0, message: 'success', items: [rawUser()], total: 42, timestamp: TS }, config);
		}
		if (url === CONSENTS_URL) {
			return ok({ code: 0, message: 'success', items: [rawConsent()], total: 1, timestamp: TS }, config);
		}
		return ok({ code: 0, message: 'success', items: [], total: 0, timestamp: TS }, config);
	}) as any;
}

function usersCalls() {
	return captured.filter((c) => c.url === USERS_URL && c.method === 'get');
}

function seedSession(): void {
	useAuthStore.setState({
		user: { id: 'u-1', username: 'tester' } as never,
		accessToken: null,
		refreshToken: null,
		tenants: [{ id: TENANT, name: 'Tenant W1e', role: 'admin' }],
		currentTenantId: TENANT,
		permissions: ['compliance:read'],
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

async function waitConfigLoaded() {
	await screen.findByText('防沉迷与宵禁', undefined, { timeout: 20000 });
}

describe('未成年保护页 A-269/A-270/A-271/A-272（W1e）', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		resetAuthStore();
		seedSession();
		installCaptureAdapter();
	});

	afterEach(() => {
		cleanup();
		apiClient.defaults.adapter = originalAdapter as any;
		resetAuthStore();
	});

	it('A-271：users 挂载即载（零 Tab 点击即 1 次请求）+ 统计卡首屏真值 42 + Tab 点击不二次触发', async () => {
		render(<MinorsProtectionPage />);
		await waitConfigLoaded();

		// 旧形态：懒加载 → 统计卡恒 0、此断言 0 次必红
		await waitFor(() => expect(usersCalls()).toHaveLength(1));
		expect(usersCalls()[0].params).toEqual({ is_minor: true, page: 1, page_size: 20 });

		// 统计卡真值（旧形态恒 0；'-' 未载态退场）
		expect(await screen.findByText('42')).toBeInTheDocument();
		expect(screen.queryByText('未成年用户数')).toBeInTheDocument();

		// 首次 Tab 点击：ref 守卫，不二次触发（pagination 测试 1 次调用不变量）
		fireEvent.click(screen.getByRole('tab', { name: /未成年用户/ }));
		expect(await screen.findByText('p1@example.com')).toBeInTheDocument();
		expect(usersCalls()).toHaveLength(1);
	});

	it('A-270：users 分页 showTotal 传 { total } → 「共 42 条」（旧形态字面量「共 {{total}} 条」零命中）', async () => {
		render(<MinorsProtectionPage />);
		await waitConfigLoaded();

		fireEvent.click(screen.getByRole('tab', { name: /未成年用户/ }));
		await waitFor(() => expect(usersCalls()).toHaveLength(1));

		expect(await screen.findByText('共 42 条')).toBeInTheDocument();
		expect(screen.queryByText('共 {{total}} 条')).toBeNull();
	});

	it('A-272（分支②补展示）：两阈值字段只读回显（wire snake → camel 直读；旧形态零 UI）', async () => {
		render(<MinorsProtectionPage />);
		await waitConfigLoaded();

		// 旧形态：两键零渲染 → 该文本必缺（必红）
		expect(
			await screen.findByText(/未成年人年龄阈值：18 · 数字同意年龄：13/),
		).toBeInTheDocument();
	});

	it('A-269（核实）：consents 表三列键 camel 直读（userId/parentEmail/recordedAt 值上屏）', async () => {
		render(<MinorsProtectionPage />);
		await waitConfigLoaded();

		fireEvent.click(screen.getByRole('tab', { name: /家长同意管理/ }));
		await waitFor(() => expect(captured.some((c) => c.url === CONSENTS_URL)).toBe(true));

		// 三列键错配即空单元格：值上屏 = 键对齐（锁定向回流）
		expect(await screen.findByText('minor-of-p1')).toBeInTheDocument();
		expect(screen.getByText('parent-p1@example.com')).toBeInTheDocument();
		expect(screen.getByText('email')).toBeInTheDocument();
	});
});
