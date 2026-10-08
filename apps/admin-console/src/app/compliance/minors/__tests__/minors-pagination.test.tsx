// W4-02（A-273 · AC-B4-W4-02-1/2/3）：未成年页 users/consents 真服务端分页终式锁。
//
// 旧实现（历史 page:143 / page:158）：单页假分页——users 固定 page_size=100 只取一页、
// consents 固定 pageSize=100 且丢 total；DataTable 分页条纯客户端切片，翻页零请求。
// 新契约（AC-B4-W4-02-x）：首载/翻页均上 wire（page/page_size=20，service-core base/dto/page.go），
// total 由响应回填、current 受控。
//
// 反假绿：
//   ① 旧代码首载 params 无 page 且 page_size=100 → 键集断言必红；
//   ② 旧代码点第 2 页零请求（客户端切片）→ 二次请求断言必红；
//   ③ 第 2 页响应不同行（user-p2）→ 旧代码不发请求则收不到该行 → 渲染断言必红。

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent, cleanup } from '@testing-library/react';
import { apiClient, useAuthStore } from '@autional/shared';
import MinorsProtectionPage from '../page';

// antd v6 命令式 API 桩化（仓内既有模式）：错误分支可被真实驱动（本文件不触发错误路径，
// 但页面模块加载时引用 message 单例——不桩化会在导入期炸）。
vi.mock('@/lib/antd-app', () => ({
	message: { success: vi.fn(), error: vi.fn() },
	modal: { confirm: vi.fn() },
}));

const TENANT = 'tenant-w402';
const CONFIG_URL = `/tenant/api/v1/admin/tenants/${TENANT}/minors-protection`;
const USERS_URL = '/identity/api/v1/admin/users';
const CONSENTS_URL = '/identity/api/v1/admin/consents';

/** wire 形状（snake）配置夹具（同 minors-error-states 既有夹具口径）。 */
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
};

function rawUser(page: number) {
	return {
		id: `user-p${page}-1`,
		tenant_id: TENANT,
		email: `p${page}@example.com`,
		phone: '13800000000',
		username: `minor-p${page}`,
		status: 'active',
		is_minor: true,
		age_group: '14-16',
		birth_date: '2012-01-01',
		pending_parental_consent: true,
		created_at: '2026-10-01T00:00:00Z',
	};
}

function rawConsent(page: number) {
	return {
		id: `consent-p${page}`,
		user_id: `minor-of-page-${page}`,
		parent_email: `parent-p${page}@example.com`,
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
	params: any;
	data: any;
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
		const ts = '2026-10-04T00:00:00Z';
		captured.push({ url, method: String(config.method || 'get').toLowerCase(), params: config.params, data: config.data });

		if (url.endsWith('/minors-protection')) {
			return ok({ code: 0, message: 'success', data: RAW_CONFIG, timestamp: ts }, config);
		}
		// 服务端分页按请求 page 回不同行（total=42 → 3 页；第 2 页行与第 1 页不同）
		if (url.endsWith('/admin/users')) {
			const page = Number(config.params?.page ?? 1);
			return ok(
				{ code: 0, message: 'success', items: [rawUser(page)], total: 42, timestamp: ts },
				config,
			);
		}
		if (url === CONSENTS_URL) {
			const page = Number(config.params?.page ?? 1);
			return ok(
				{ code: 0, message: 'success', items: [rawConsent(page)], total: 42, timestamp: ts },
				config,
			);
		}
		return ok({ code: 0, message: 'success', items: [], total: 0, timestamp: ts }, config);
	}) as any;
}

function usersCalls() {
	return captured.filter((c) => c.url === USERS_URL && c.method === 'get');
}

function consentsCalls() {
	return captured.filter((c) => c.url === CONSENTS_URL && c.method === 'get');
}

// 本测试穿真实 wire（拦截器链路）：种 token 会触发请求拦截器「预判式 Token 刷新」假阴性。
function seedSession(): void {
	useAuthStore.setState({
		user: { id: 'u-1', username: 'tester' } as never,
		accessToken: null,
		refreshToken: null,
		tenants: [{ id: TENANT, name: 'Tenant W402', role: 'admin' }],
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

/** 数据态门：配置加载成功 → 防沉迷区渲染。 */
async function waitConfigLoaded() {
	await screen.findByText('防沉迷与宵禁', undefined, { timeout: 20000 });
}

/** 点 antd Pagination 第 N 页（li 类名稳定；title 可能与其它节点撞名，不用 getByTitle）。 */
function clickPage(n: number) {
	const item = document.querySelector(`.ant-pagination-item-${n}`) as HTMLElement;
	expect(item).toBeTruthy();
	fireEvent.click(item);
}

describe('未成年页真服务端分页（A-273 · AC-B4-W4-02-1/2/3）', () => {
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

	it(
		'AC-B4-W4-02-1：users 首载 page/page_size=20 上 wire；翻页发新请求 page=2 且第 2 页行上屏',
		{ timeout: 20000 },
		async () => {
			render(<MinorsProtectionPage />);
			await waitConfigLoaded();

			// 用 role=tab 定位：/未成年用户/ 文本同时命中页描述与统计卡标题（getByText 会多匹配）
			fireEvent.click(screen.getByRole('tab', { name: /未成年用户/ }));
			await waitFor(() => expect(usersCalls().length).toBe(1));

			// 首载键集恰为契约键（旧实现无 page 且 page_size=100 → 必红）
			expect(usersCalls()[0].params).toEqual({ is_minor: true, page: 1, page_size: 20 });
			// 第 1 页响应行上屏（total 42 回填 → 分页条渲染 3 页）
			expect(await screen.findByText('p1@example.com')).toBeInTheDocument();

			// 翻页 → 服务端二次请求（旧实现纯客户端切片 → 零请求 → 必红）
			clickPage(2);
			await waitFor(() => expect(usersCalls().length).toBe(2));
			expect(usersCalls()[1].params).toEqual({ is_minor: true, page: 2, page_size: 20 });
			// 第 2 页行上屏（旧实现收不到该行 → 必红）
			expect(await screen.findByText('p2@example.com')).toBeInTheDocument();
		},
	);

	it(
		'AC-B4-W4-02-2：consents 首载 page/page_size=20 上 wire；翻页发新请求 page=2 且第 2 页行上屏',
		{ timeout: 20000 },
		async () => {
			render(<MinorsProtectionPage />);
			await waitConfigLoaded();

			fireEvent.click(screen.getByRole('tab', { name: /家长同意管理/ }));
			await waitFor(() => expect(consentsCalls().length).toBe(1));

			expect(consentsCalls()[0].params).toEqual({ page: 1, page_size: 20 });
			expect(await screen.findByText('minor-of-page-1')).toBeInTheDocument();

			clickPage(2);
			await waitFor(() => expect(consentsCalls().length).toBe(2));
			expect(consentsCalls()[1].params).toEqual({ page: 2, page_size: 20 });
			expect(await screen.findByText('minor-of-page-2')).toBeInTheDocument();
		},
	);
});
