// TASK-AB1-11（fix-admin-b1-guard-contract / A-263 · RC-6 面漂移）：verifications 面收口回归锁 ——
//   AC-AB1-16：security_admin 直达 `/:slug/verifications` ⇒ ForbiddenRedirect；admin ⇒ 渲染。
//   AC-AB1-17：security_admin 会话下菜单不渲染 verifications / compliance-policy / compliance-minors
//              三项；admin 三者全显。
//
// 口径：路由侧 = 真实 RequireAuth + 真实 ConfigRoutes（页面 mock 为标记组件）；
// 菜单侧 = 真实 NavMenu + 真实 usePermission（三个新键在 PERMISSION_MAP 无任何映射源 ⇒
// security_admin 的 11 枚原始码无一可授予；admin 走 `tenant:*` 前缀豁免可见）。

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, cleanup, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useAuthStore, TenantSlugProvider } from '@autional/shared';
import type { ReactNode } from 'react';

vi.mock('../../app/verifications/page', () => ({
	default: () => <div data-testid="page-verifications">verifications page</div>,
}));
vi.mock('../../app/verifications/[id]/page', () => ({
	default: () => <div data-testid="page-verification-detail">verification detail page</div>,
}));
// 菜单侧网络依赖桩化（feature gates 空集：本用例三项均无 featureGateKey，不受门控影响）
vi.mock('@/hooks/use-feature-gates', async (importOriginal) => ({
	...(await importOriginal<typeof import('@/hooks/use-feature-gates')>()),
	useFeatureGates: () => new Set<string>(),
}));
vi.mock('@/lib/api.generated', async (importOriginal) => ({
	...(await importOriginal<typeof import('@/lib/api.generated')>()),
	getPendingMembers: vi.fn().mockResolvedValue({ data: { total: 0 } }),
}));

import { ConfigRoutes } from '../config';
import { NavMenu } from '../../components/layout/NavMenu';

/** security_admin 播种权限 = 后端 seed 的 11 码子集（含 audit:read / compliance:read）；
 *  两角色均须非空 permissions+tenants（useBootstrap 才能返回 ready，状态机方可越过 bootstrap）。 */
function seedSession(role: string): void {
	useAuthStore.setState({
		user: { id: 'u-1', username: 'tester' } as never,
		accessToken: 'test-token',
		refreshToken: 'test-refresh',
		tenants: [{ id: 'tenant-a', name: 'Tenant A', role }],
		currentTenantId: 'tenant-a',
		permissions:
			role === 'security_admin'
				? ['audit:read', 'compliance:read', 'role:read', 'user:read']
				: ['user:read'],
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

function renderConfigRoute(path: string) {
	return wrap(
		<Routes>
			<Route path="/:tenantSlug">
				{ConfigRoutes}
				{/* ForbiddenRedirect 落点（App.tsx 同构：/:tenantSlug/403） */}
				<Route path="403" element={<div data-testid="forbidden-403">403</div>} />
			</Route>
		</Routes>,
		path,
	);
}

describe('AC-AB1-16：verifications 路由收紧 Admin', () => {
	beforeEach(() => {
		resetAuthStore();
	});

	afterEach(() => {
		cleanup();
		resetAuthStore();
	});

	it('security_admin 直达 /:slug/verifications ⇒ ForbiddenRedirect', async () => {
		seedSession('security_admin');
		renderConfigRoute('/tenant-a/verifications');

		expect(await screen.findByTestId('forbidden-403')).toBeTruthy();
		expect(screen.queryByTestId('page-verifications')).toBeNull();
	});

	it('security_admin 直达 /:slug/verifications/:id ⇒ ForbiddenRedirect', async () => {
		seedSession('security_admin');
		renderConfigRoute('/tenant-a/verifications/v-1');

		expect(await screen.findByTestId('forbidden-403')).toBeTruthy();
		expect(screen.queryByTestId('page-verification-detail')).toBeNull();
	});

	it('admin 直达 /:slug/verifications ⇒ 渲染页面', async () => {
		seedSession('admin');
		renderConfigRoute('/tenant-a/verifications');

		expect(await screen.findByTestId('page-verifications')).toBeTruthy();
		expect(screen.queryByTestId('forbidden-403')).toBeNull();
	});
});

describe('AC-AB1-17：菜单三项可见性（无映射源键 = admin-only）', () => {
	beforeEach(() => {
		resetAuthStore();
	});

	afterEach(() => {
		cleanup();
		resetAuthStore();
	});

	// 菜单条目所在组（audit-compliance）的展开态由路由反推（openKeys=['audit-compliance']）
	const MENU_PATH = '/tenant-a/verifications';
	const ITEM_VERIFICATIONS = '实名认证管理';
	const ITEM_COMPLIANCE_POLICY = '合规策略';
	const ITEM_MINORS = '未成年人保护';

	it('security_admin：三项均不渲染（audit:read/compliance:read 无法授予新键）', async () => {
		seedSession('security_admin');
		wrap(<NavMenu />, MENU_PATH);

		// 先锚定菜单已渲染且审计组已展开（审计日志为同组既有可见项）
		expect(await screen.findByText('审计日志')).toBeTruthy();
		expect(screen.queryByText(ITEM_VERIFICATIONS)).toBeNull();
		expect(screen.queryByText(ITEM_COMPLIANCE_POLICY)).toBeNull();
		expect(screen.queryByText(ITEM_MINORS)).toBeNull();
	});

	it('admin：三项全显（tenant:* 前缀豁免）', async () => {
		seedSession('admin');
		wrap(<NavMenu />, MENU_PATH);

		await waitFor(() => expect(screen.getByText(ITEM_VERIFICATIONS)).toBeTruthy());
		expect(screen.getByText(ITEM_COMPLIANCE_POLICY)).toBeTruthy();
		expect(screen.getByText(ITEM_MINORS)).toBeTruthy();
	});
});
