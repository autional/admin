// TASK-AB1-14（fix-admin-b1-guard-contract / A-444①③）：入口可达性 + 菜单可见集回归锁 ——
//   AC-AB1-21：security_admin 会话（11 码，mock 终态）菜单显 /status、/oauth-clients、NHI 组
//              （父 + agents/robots/devices/policies-nhi 四叶）；不显 /users、/roles、
//              /role-activations、billing 组（运营与财务）。
//   AC-AB1-22：security_admin 直链 NHI 7 路由 + /status + /oauth-clients ⇒ 渲染；/billing ⇒
//              ForbiddenRedirect。
//
// 口径：
//   路由侧 = 真实 RequireAuth（shared 精确角色相等语义）+ 真实路由片段（NhiRoutes / DeveloperRoutes /
//   FinanceRoutes）+ 真实 ForbiddenRedirect；受测页面模块 mock 为标记组件 —— 只锁守卫接线。
//   菜单侧 = 真实 NavMenu + 真实 usePermission（11 码经 PERMISSION_MAP 映射判定；无映射源键
//   不可见）；feature gate 桩化为含 'nhi'（NHI 组 featureGateKey 门控）。
//   会话经 AuthService 同源 store 播种（token 非空 → 状态机走 authenticated/ready；
//   permissions+tenants 非空 → bootstrap 即 ready）。

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useAuthStore, TenantSlugProvider } from '@autional/shared';
import type { ReactNode } from 'react';

// ---- 页面模块桩（AC-AB1-22 直链矩阵涉及面）----
vi.mock('../../app/agents/page', () => ({
	default: () => <div data-testid="page-agents">agents page</div>,
}));
vi.mock('../../app/agents/[id]/page', () => ({
	default: () => <div data-testid="page-agent-detail">agent detail page</div>,
}));
vi.mock('../../app/robots/page', () => ({
	default: () => <div data-testid="page-robots">robots page</div>,
}));
vi.mock('../../app/robots/[id]/page', () => ({
	default: () => <div data-testid="page-robot-detail">robot detail page</div>,
}));
vi.mock('../../app/devices/page', () => ({
	default: () => <div data-testid="page-devices">devices page</div>,
}));
vi.mock('../../app/devices/[id]/page', () => ({
	default: () => <div data-testid="page-device-detail">device detail page</div>,
}));
vi.mock('../../app/policies/nhi/page', () => ({
	default: () => <div data-testid="page-nhi-policy">nhi policy page</div>,
}));
vi.mock('../../app/status/page', () => ({
	default: () => <div data-testid="page-status">status page</div>,
}));
vi.mock('../../app/oauth-clients/page', () => ({
	default: () => <div data-testid="page-oauth-clients">oauth clients page</div>,
}));
vi.mock('../../app/billing/page', () => ({
	default: () => <div data-testid="page-billing">billing page</div>,
}));

// 菜单侧网络依赖桩化：feature gates 含 'nhi'；pending members 计数桩
vi.mock('@/hooks/use-feature-gates', async (importOriginal) => ({
	...(await importOriginal<typeof import('@/hooks/use-feature-gates')>()),
	useFeatureGates: () => new Set<string>(['nhi']),
}));
vi.mock('@/lib/api.generated', async (importOriginal) => ({
	...(await importOriginal<typeof import('@/lib/api.generated')>()),
	getPendingMembers: vi.fn().mockResolvedValue({ data: { total: 0 } }),
}));

import { NhiRoutes } from '../nhi';
import { DeveloperRoutes } from '../developer';
import { FinanceRoutes } from '../finance';
import { NavMenu } from '../../components/layout/NavMenu';

/** security_admin 播种权限 = 后端 seed 的 11 码目标集（plan §ITEM-AB1-04）。 */
const SECURITY_ADMIN_11 = [
	'audit:read',
	'compliance:read',
	'role:read',
	'session:read',
	'user:read',
	'status:read',
	'oauth:read',
	'agent:read',
	'robot:read',
	'robot:health:read',
	'device:read',
];

/** 假 JWT 形 access token（未过期）——shared store.isTokenExpired 读 payload.exp：
 *  非 JWT 串（如 'test-token'）判为过期 ⇒ apiClient 预判式刷新 → refreshToken 网络失败 →
 *  onUnauthorized 异步清空 store（跨用例竞态，实证：菜单被清成「加载中」空树）。
 *  播种未来 exp 的 JWT 形 token 即绕开预判刷新，请求退化为普通网络错误（不清会话）。 */
function futureJwt(): string {
	const b64 = (obj: unknown) => btoa(JSON.stringify(obj));
	return `${b64({ alg: 'none', typ: 'JWT' })}.${b64({ exp: Math.floor(Date.now() / 1000) + 3600 })}.sig`;
}

/** 播种一个「已就绪」会话（角色经 tenants + currentTenantId 派生）。 */
function seedSession(role: string): void {
	useAuthStore.setState({
		user: { id: 'u-1', username: 'tester' } as never,
		accessToken: futureJwt(),
		refreshToken: 'test-refresh',
		tenants: [{ id: 'tenant-a', name: 'Tenant A', role }],
		currentTenantId: 'tenant-a',
		permissions: role === 'security_admin' ? SECURITY_ADMIN_11 : ['user:read'],
		isAuthenticated: true,
	});
}

/** 重置 store + localStorage，避免跨用例污染。 */
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

function wrap(node: ReactNode, path: string) {
	const queryClient = new QueryClient({
		defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
	});
	return render(
		<QueryClientProvider client={queryClient}>
			<MemoryRouter initialEntries={[path]}>
				<TenantSlugProvider value="tenant-a">{node}</TenantSlugProvider>
			</MemoryRouter>
		</QueryClientProvider>,
	);
}

function renderRouteFragment(fragment: ReactNode, path: string) {
	return wrap(
		<Routes>
			<Route path="/:tenantSlug">
				{fragment}
				{/* ForbiddenRedirect 落点（App.tsx 同构：/:tenantSlug/403） */}
				<Route path="403" element={<div data-testid="forbidden-403">403</div>} />
			</Route>
		</Routes>,
		path,
	);
}

describe('AC-AB1-22：security_admin 直链矩阵（NHI×7 + /status + /oauth-clients 渲染；/billing 403）', () => {
	beforeEach(() => {
		resetAuthStore();
	});

	afterEach(() => {
		cleanup();
		resetAuthStore();
	});

	const nhiCases: Array<[string, string]> = [
		['/tenant-a/agents', 'page-agents'],
		['/tenant-a/agents/a-1', 'page-agent-detail'],
		['/tenant-a/robots', 'page-robots'],
		['/tenant-a/robots/r-1', 'page-robot-detail'],
		['/tenant-a/devices', 'page-devices'],
		['/tenant-a/devices/d-1', 'page-device-detail'],
		['/tenant-a/policies/nhi', 'page-nhi-policy'],
	];

	for (const [path, testId] of nhiCases) {
		it(`security_admin 直链 ${path} ⇒ 渲染（不 403）`, async () => {
			seedSession('security_admin');
			renderRouteFragment(NhiRoutes, path);

			expect(await screen.findByTestId(testId)).toBeTruthy();
			expect(screen.queryByTestId('forbidden-403')).toBeNull();
		});
	}

	it('security_admin 直链 /tenant-a/status ⇒ 渲染（不 403）', async () => {
		seedSession('security_admin');
		renderRouteFragment(DeveloperRoutes, '/tenant-a/status');

		expect(await screen.findByTestId('page-status')).toBeTruthy();
		expect(screen.queryByTestId('forbidden-403')).toBeNull();
	});

	it('security_admin 直链 /tenant-a/oauth-clients ⇒ 渲染（不 403）', async () => {
		seedSession('security_admin');
		renderRouteFragment(DeveloperRoutes, '/tenant-a/oauth-clients');

		expect(await screen.findByTestId('page-oauth-clients')).toBeTruthy();
		expect(screen.queryByTestId('forbidden-403')).toBeNull();
	});

	it('security_admin 直链 /tenant-a/billing ⇒ ForbiddenRedirect（计费面裁撤，D4）', async () => {
		seedSession('security_admin');
		renderRouteFragment(FinanceRoutes, '/tenant-a/billing');

		expect(await screen.findByTestId('forbidden-403')).toBeTruthy();
		expect(screen.queryByTestId('page-billing')).toBeNull();
	});

	it('正对照：admin 直链 /tenant-a/billing ⇒ 渲染（防误伤）', async () => {
		seedSession('admin');
		renderRouteFragment(FinanceRoutes, '/tenant-a/billing');

		expect(await screen.findByTestId('page-billing')).toBeTruthy();
		expect(screen.queryByTestId('forbidden-403')).toBeNull();
	});
});

describe('AC-AB1-21：security_admin 菜单可见集（mock 11 码终态）', () => {
	beforeEach(() => {
		resetAuthStore();
	});

	afterEach(() => {
		cleanup();
		resetAuthStore();
	});

	// 仪表盘 = 恒可见锚（user:read → tenant:dashboard:read；防「菜单整树未渲染」型假绿）
	const MENU_ANCHOR = '仪表盘';

	it('显 NHI 组（父 + 智能体/机器人/IoT 设备/NHI 策略四叶）', async () => {
		seedSession('security_admin');
		wrap(<NavMenu />, '/tenant-a/agents'); // openKeys 由路由反推 = ['nhi']

		expect(await screen.findByText('非人身份')).toBeTruthy();
		expect(screen.getByText('智能体管理')).toBeTruthy();
		expect(screen.getByText('机器人管理')).toBeTruthy();
		expect(screen.getByText('IoT 设备')).toBeTruthy();
		expect(screen.getByText('NHI 策略')).toBeTruthy();
	});

	it('显 /status（服务状态，status:read 映射源）', async () => {
		seedSession('security_admin');
		wrap(<NavMenu />, '/tenant-a/status'); // openKeys = ['logs-monitoring']

		expect(await screen.findByText('服务状态')).toBeTruthy();
	});

	it('显 /oauth-clients（OAuth 客户端，oauth:read 映射源）', async () => {
		seedSession('security_admin');
		wrap(<NavMenu />, '/tenant-a/oauth-clients'); // openKeys = ['developer']

		expect(await screen.findByText('OAuth 客户端')).toBeTruthy();
	});

	it('不显 /users 与 /roles（B1/B2 裁撤：无映射源）', async () => {
		seedSession('security_admin');
		wrap(<NavMenu />, '/tenant-a/users'); // openKeys = ['user-permission']

		expect(await screen.findByText(MENU_ANCHOR)).toBeTruthy();
		expect(screen.queryByText('用户管理')).toBeNull();
		expect(screen.queryByText('角色权限')).toBeNull();
	});

	it('不显 /role-activations（角色激活审批：tenant:role:read 无映射源）', async () => {
		seedSession('security_admin');
		wrap(<NavMenu />, '/tenant-a/role-activations'); // openKeys = ['security']

		expect(await screen.findByText(MENU_ANCHOR)).toBeTruthy();
		expect(screen.queryByText('角色激活审批')).toBeNull();
	});

	it('不显 billing 组（运营与财务 + 计量与订阅：tenant:billing:read 无映射源）', async () => {
		seedSession('security_admin');
		wrap(<NavMenu />, '/tenant-a/billing'); // openKeys = ['ops-finance']

		expect(await screen.findByText(MENU_ANCHOR)).toBeTruthy();
		expect(screen.queryByText('运营与财务')).toBeNull();
		expect(screen.queryByText('计量与订阅')).toBeNull();
	});
});
