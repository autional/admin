// W4-01（fix-admin-b4-presentation / A-243 + A-244 + A-245）compliance 中心契约锁。
//
//   AC-B4-W4-01-1：SoD 列 rolesA/rolesB 数组 join 渲染 + enabled 列（旧单值键 roleA/roleB → 两列恒空）。
//   AC-B4-W4-01-2：consent/dsar/iso/retention 四表服务端分页（发 page/page_size；分页器接服务端 total）。
//   AC-B4-W4-01-3：sod 表服务端分页（Q-02 Go 扩展配套——前端接线面）。
//   AC-B4-W4-01-4：score 卡 403/失败成态（无伪 0）；grade 渲染。
//   AC-B4-W4-01-5：五表 error≠empty（403 分流无权限态，不落空表）。
//   AC-B4-W4-01-6：isRestricted（sod_mode=strict + admin）→ AuditStatsOnly 携统计 children。
//   AC-B4-W4-01-7：usePageTitle 落位（document.title）。
//
// 反假绿：断言穿真实链路（page → use-compliance → generated api → 拦截器 → adapter），不 mock hooks；
// 失败例注入 403/500 于 adapter（最末环），经拦截器错误通道原样上抛给 react-query → 页面成态。
// 旧实现（无 page/page_size、无 error 分流、score `?? 0` 伪 0）下本文件核心断言全红。
//
// Stage-B 门控注记：W0-01 的 classifyQueryState/isRetryableError 在 shared rc.N 物化前（现装 rc.30）缺失。
// 下方 vi.mock 以「真实现存在则原样透传、缺失才注入同语义桩」自让位——本地（rc.30）可跑页面接线断言，
// Stage B 物化后自动切真实现（桩失效，不掩盖语义）；QueryStateFallback 自身三分支语义由
// components/common/__tests__/QueryStateFallback.test.tsx 在 Stage B 独立锁。

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent, cleanup } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router';
import { apiClient, useAuthStore } from '@autional/shared';

vi.mock('@autional/shared', async (importOriginal) => {
	const actual = (await importOriginal()) as Record<string, any>;
	const statusOf = (error: any) => error?.response?.status;
	return {
		...actual,
		classifyQueryState:
			actual.classifyQueryState ??
			(({ isLoading, error, data }: any) => {
				if (statusOf(error) === 403) return 'forbidden';
				if (error) return 'error';
				if (isLoading) return 'loading';
				if (data == null || (Array.isArray(data) && data.length === 0)) return 'empty';
				return 'ready';
			}),
		isRetryableError:
			actual.isRetryableError ??
			((error: any) => {
				const s = statusOf(error);
				return s == null || s >= 500;
			}),
	};
});

vi.mock('@/lib/antd-app', () => ({
	message: { success: vi.fn(), error: vi.fn() },
	modal: { confirm: vi.fn() },
}));

import CompliancePage from '../page';

const URLS = {
	dsar: '/compliance/api/v1/admin/compliance/gdpr/dsar',
	consent: '/compliance/api/v1/admin/compliance/gdpr/consent',
	retention: '/compliance/api/v1/admin/compliance/retention-policies',
	sod: '/audit/api/v1/admin/audit/compliance/sod-rules',
	iso: '/compliance/api/v1/admin/compliance/iso27001/controls',
	score: '/compliance/api/v1/admin/compliance/tenants/self/score',
	policy: '/compliance/api/v1/admin/compliance/tenants/self/policy',
	sodConfig: '/tenant/api/v1/admin/tenants/tenant-a/sod-config',
	erasure: '/compliance/api/v1/admin/compliance/gdpr/right-to-erasure',
};

const TS = '2026-10-05T00:00:00Z';

// wire 形状（snake）——经响应拦截器解包 + 深 camel 化后与线上链路同构。
const RAW_DSARS = [
	{ id: 'dsar-1', user_id: 'usr-d1', type: 'access', status: 'pending', created_at: '2026-01-01T00:00:00Z' },
];
const RAW_CONSENTS = [
	{ id: 'consent-1', user_id: 'usr-c1', purpose: 'marketing', granted: true, granted_at: '2026-04-15T10:00:00Z' },
];
const RAW_POLICIES = [
	{
		policy_id: 'p-1',
		data_type: 'audit_logs',
		retention_period_days: 365,
		purpose: '安全审计',
		legal_basis: '合同义务',
		status: 'active',
	},
];
// A-243 判别锁：roles_a/roles_b 为数组（旧本地类型单值 roleA/roleB 与 wire 不符 → 两列恒空）。
const RAW_SOD = [
	{
		id: 'sod-1',
		name: 'Rule One',
		roles_a: ['role-a1', 'role-a2'],
		roles_b: ['role-b1'],
		enabled: true,
		description: '互斥规则一',
	},
	{ id: 'sod-2', name: 'Rule Two', roles_a: [], roles_b: [], enabled: false, description: '' },
];
const RAW_ISO = [
	{ id: 'iso-1', control_id: 'A.5.1', title: '信息安全策略', domain: '组织安全', compliance_status: 'compliant' },
];

const STANDARDS = Array.from({ length: 7 }, (_, i) => ({ id: `s-${i + 1}` }));

interface Captured {
	url: string;
	method: string;
	params: any;
}

let captured: Captured[] = [];
let failures: Array<[string, number]> = [];
let sodMode = 'single';
let originalAdapter: unknown;

function ok(payload: unknown, config: any) {
	return { data: payload, status: 200, statusText: 'OK', headers: {}, config };
}

/** service-core 扁平 ListResponse（拦截器只保留 items/total/pagination 并深 camel 化）。 */
function listEnvelope(items: unknown[]) {
	return {
		code: 0,
		message: 'ok',
		items,
		total: 25,
		pagination: { total: 25, page: 1, page_size: 10, total_pages: 3, has_next: true },
		timestamp: TS,
	};
}

function installCaptureAdapter() {
	captured = [];
	originalAdapter = apiClient.defaults.adapter;
	apiClient.defaults.adapter = (async (config: any) => {
		const url = String(config.url || '');
		const method = String(config.method || 'get').toLowerCase();
		captured.push({ url, method, params: config.params });

		const fail = failures.find(([u]) => url === u);
		if (fail) {
			return Promise.reject(
				Object.assign(new Error('request failed'), {
					response: { status: fail[1], data: { code: fail[1], message: 'boom' } },
				}),
			);
		}

		if (url === URLS.sodConfig) {
			return ok({ code: 0, message: 'ok', data: { tenant_id: 'tenant-a', sod_mode: sodMode, updated_at: TS } }, config);
		}
		if (url === URLS.score) {
			return ok({ code: 0, message: 'ok', data: { tenant_id: 'tenant-a', overall_score: 87, grade: 'B' } }, config);
		}
		if (url === URLS.policy) {
			return ok({ code: 0, message: 'ok', data: { tenant_id: 'tenant-a', standards: STANDARDS } }, config);
		}
		if (url === URLS.dsar) return ok(listEnvelope(RAW_DSARS), config);
		if (url === URLS.consent) return ok(listEnvelope(RAW_CONSENTS), config);
		if (url === URLS.retention) return ok(listEnvelope(RAW_POLICIES), config);
		if (url === URLS.sod) return ok(listEnvelope(RAW_SOD), config);
		if (url === URLS.iso) return ok(listEnvelope(RAW_ISO), config);
		if (url === URLS.erasure) return ok({ code: 0, message: 'ok', items: [], total: 0, timestamp: TS }, config);
		return ok({ code: 0, message: 'ok', data: {}, timestamp: TS }, config);
	}) as any;
}

const calls = (url: string) => captured.filter((c) => c.url === url);

// 穿真实 wire：不种 token（种假 token 触发预判式刷新 → 清 store → 角色门假阴性）。
function seedSession(role: string): void {
	useAuthStore.setState({
		user: { id: 'u-1', username: 'tester' } as never,
		accessToken: null,
		refreshToken: null,
		tenants: [{ id: 'tenant-a', name: 'Tenant A', role }],
		currentTenantId: 'tenant-a',
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

function renderPage() {
	const queryClient = new QueryClient({
		defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
	});
	return render(
		<QueryClientProvider client={queryClient}>
			<MemoryRouter>
				<CompliancePage />
			</MemoryRouter>
		</QueryClientProvider>,
	);
}

async function switchTab(label: string) {
	fireEvent.click(await screen.findByText(label));
}

/** 当前可见 tabpanel 内的分页页码项（已访问过的其它 pane 残留同 class 元素——按 aria-hidden 去歧）。 */
function pageItem(n: number): HTMLElement {
	const items = Array.from(document.querySelectorAll<HTMLElement>(`.ant-pagination-item-${n}`));
	const visible = items.find(
		(el) => el.closest('[role="tabpanel"]')?.getAttribute('aria-hidden') !== 'true',
	);
	expect(visible).toBeTruthy();
	return visible as HTMLElement;
}

function activePane(): HTMLElement {
	const el = document.querySelector<HTMLElement>('[role="tabpanel"]:not([aria-hidden="true"])');
	expect(el).toBeTruthy();
	return el as HTMLElement;
}

describe('W4-01 compliance 中心契约（A-243/A-244/A-245）', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		failures = [];
		sodMode = 'single';
		resetAuthStore();
		seedSession('admin');
		installCaptureAdapter();
	});

	afterEach(() => {
		cleanup();
		apiClient.defaults.adapter = originalAdapter as any;
		resetAuthStore();
	});

	it(
		'AC-1/2/4/7：四表首屏发 page/page_size + SoD 数组列渲染 + score/grade 上屏 + 页面标题',
		{ timeout: 30000 },
		async () => {
			renderPage();

			// AC-4：score 卡出真值（旧实现失败静默伪 0 的另一面：成功路径 grade 旧实现零渲染）
			expect(await screen.findByText('87')).toBeTruthy();
			expect(screen.getByText('合规评分')).toBeTruthy();
			expect(screen.getByText('B')).toBeTruthy();
			expect(screen.getByText(/评级/)).toBeTruthy();

			// AC-7：usePageTitle 落位
			await waitFor(() => expect(document.title).toBe('合规中心 — Autional'));

			// AC-2：四表首屏请求带 page/page_size（旧实现无参单拉 → 后端默认截断且分页器假全量）
			await waitFor(() => expect(calls(URLS.consent).length).toBeGreaterThan(0));
			for (const url of [URLS.consent, URLS.retention, URLS.iso]) {
				expect(calls(url)[0].params).toEqual(expect.objectContaining({ page: 1, page_size: 10 }));
			}
			const dsarTable = calls(URLS.dsar).find((c) => c.params?.page_size === 10);
			expect(dsarTable?.params).toEqual(expect.objectContaining({ page: 1, page_size: 10 }));

			// AC-3 配套：sod-rules 首次请求同为 page/page_size（Q-02 后端扩展的消费面）
			expect(calls(URLS.sod)[0].params).toEqual(expect.objectContaining({ page: 1, page_size: 10 }));

			// AC-1：SoD 表数组列 join + enabled 列（旧单值键 → 'role-a1, role-a2' 不上屏必红）
			await switchTab('SoD 规则');
			expect(await screen.findByText('role-a1, role-a2')).toBeTruthy();
			expect(screen.getByText('role-b1')).toBeTruthy();
			expect(screen.getAllByText('角色 A').length).toBeGreaterThan(0);
			expect(screen.getAllByText('角色 B').length).toBeGreaterThan(0);
			expect(screen.getAllByText('启用').length).toBeGreaterThan(0);
			// enabled 布尔两态：true → 是，false → 否（空数组 → '-'，两列各一）
			expect(screen.getByText('是')).toBeTruthy();
			expect(screen.getByText('否')).toBeTruthy();
			expect(screen.getAllByText('-').length).toBeGreaterThanOrEqual(2);
		},
	);

	it(
		'AC-2/3：五表分页器接服务端 total，切页发出 page=2 真实请求',
		{ timeout: 30000 },
		async () => {
			renderPage();
			// 列表门：dashboard 默认 tab 渲染后再切表
			expect(await screen.findByText('合规评分')).toBeTruthy();

			const cases: Array<[string, string]> = [
				['GDPR DSAR', URLS.dsar],
				['同意管理', URLS.consent],
				['留存策略', URLS.retention],
				['SoD 规则', URLS.sod],
				['ISO27001', URLS.iso],
			];
			for (const [tab, url] of cases) {
				await switchTab(tab);
				await waitFor(() => expect(calls(url).length).toBeGreaterThan(0));
				// 分页器接服务端 total=25（旧实现本地 slice 假分页只有 1 页 → 第 2 页不存在必红）
				const item = await waitFor(() => pageItem(2));
				fireEvent.click(item);
				await waitFor(() => expect(calls(url).some((c) => c.params?.page === 2)).toBe(true));
				const page2 = calls(url).find((c) => c.params?.page === 2);
				expect(page2?.params).toEqual(expect.objectContaining({ page: 2, page_size: 10 }));
			}
		},
	);

	it(
		'AC-5：五表 403 → 分流无权限态（消费当前 pane 文本，空表假象必红）',
		{ timeout: 30000 },
		async () => {
			failures = [
				[URLS.dsar, 403],
				[URLS.consent, 403],
				[URLS.retention, 403],
				[URLS.sod, 403],
				[URLS.iso, 403],
			];
			renderPage();
			expect(await screen.findByText('合规评分')).toBeTruthy();

			for (const tab of ['GDPR DSAR', '同意管理', '留存策略', 'SoD 规则', 'ISO27001']) {
				await switchTab(tab);
				await waitFor(() => expect(activePane().textContent).toContain('无权限访问'));
				// error≠empty 核心判别：错误态整位替换表格（空表假象必红）
				expect(activePane().querySelector('.ant-table')).toBeNull();
				// 403 不接重试（重试必败；免与页内新建按钮混淆，只认「重试」按钮）
				const retryButtons = Array.from(activePane().querySelectorAll('button')).filter((b) =>
					(b.textContent || '').includes('重试'),
				);
				expect(retryButtons).toHaveLength(0);
			}
		},
	);

	it(
		'AC-6：sod_mode=strict + admin → AuditStatsOnly 携统计 children（旧实现零统计）',
		{ timeout: 30000 },
		async () => {
			sodMode = 'strict';
			renderPage();

			expect(await screen.findByText(/在当前模式下/)).toBeTruthy();
			// 统计 children：两卡真值随锁卡呈现
			expect(screen.getByText('合规评分')).toBeTruthy();
			expect(screen.getByText('87')).toBeTruthy();
			expect(screen.getByText('待处理 DSAR')).toBeTruthy();
			// 锁卡态 = 早退：完整 Tabs 面不应存在
			expect(screen.queryByText('GDPR DSAR')).toBeNull();
			expect(screen.queryByText('SoD 规则')).toBeNull();
		},
	);

	it(
		'AC-4：score 403 → 卡内无权限态（无伪 0）',
		{ timeout: 30000 },
		async () => {
			failures = [[URLS.score, 403]];
			renderPage();

			// 成态判别锚点：错误分支整位替换 Statistic（标题随旧值一并不渲染是设计本意），
			// 故按 dashboard 三卡顺序取首卡容器（score 卡）断言，而非卡标题文本。
			const scoreCard = () =>
				document.querySelectorAll<HTMLElement>('.ant-card')[0];
			await waitFor(() => expect(scoreCard()?.textContent).toContain('无权限访问'));
			expect(scoreCard()?.textContent).not.toContain('0');
			expect(scoreCard()?.querySelector('button')).toBeNull();
		},
	);

	it(
		'AC-4：score 500 → 卡内失败态 + 重试按钮（无伪 0）',
		{ timeout: 30000 },
		async () => {
			failures = [[URLS.score, 500]];
			renderPage();

			const scoreCard = () =>
				document.querySelectorAll<HTMLElement>('.ant-card')[0];
			await waitFor(() => expect(scoreCard()?.textContent).toContain('合规评分加载失败'));
			expect(scoreCard()?.textContent).not.toContain('0');
			expect(scoreCard()?.querySelector('button')?.textContent).toContain('重试');
		},
	);
});
