// TASK-AB1-10（fix-admin-b1-guard-contract / A-277 · A-350 · A-375④）：
// 路由守卫口径回归锁 ——
//   AC-AB1-07：security_admin / admin 直链 `/:slug/compliance/legal-documents` ⇒ 渲染页面
//              （D1c「显式加」：法务文书为合规只读面，SA 同权）；
//   AC-AB1-08：security_admin 直达 `/:slug/pay/reconciliation`、`/:slug/wallet/disputes`
//              ⇒ ForbiddenRedirect（D1c「收回」：财务高风险面维持 Admin）。
//
// 口径：真实 RequireAuth（shared 精确角色相等语义）+ 真实路由片段（AuditComplianceRoutes /
// FinanceRoutes）+ 真实 ForbiddenRedirect；三个受测页面模块 mock 为标记组件 ——
// 本测试只锁守卫接线，不重复页面内部行为。会话经 AuthService 同源 store 播种
// （token 非空 → 状态机走 authenticated/ready；permissions+tenants 非空 → bootstrap 即 ready）。

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useAuthStore, TenantSlugProvider } from '@autional/shared';
import type { ReactNode } from 'react';

vi.mock('../../app/compliance/legal-documents/page', () => ({
	default: () => <div data-testid="page-legal-documents">legal-documents page</div>,
}));
vi.mock('../../app/pay/reconciliation/page', () => ({
	default: () => <div data-testid="page-reconciliation">reconciliation page</div>,
}));
vi.mock('../../app/wallet/disputes/page', () => ({
	default: () => <div data-testid="page-wallet-disputes">wallet-disputes page</div>,
}));

import { AuditComplianceRoutes } from '../audit-compliance';
import { FinanceRoutes } from '../finance';

/** 播种一个「已就绪」的 security_admin / admin 会话（角色经 tenants + currentTenantId 派生）。 */
function seedSession(role: string): void {
	useAuthStore.setState({
		user: { id: 'u-1', username: 'tester' } as never,
		accessToken: 'test-token',
		refreshToken: 'test-refresh',
		tenants: [{ id: 'tenant-a', name: 'Tenant A', role }],
		currentTenantId: 'tenant-a',
		permissions: ['audit:read', 'compliance:read'],
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

function renderAt(routes: ReactNode, path: string) {
	const queryClient = new QueryClient({
		defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
	});
	return render(
		<QueryClientProvider client={queryClient}>
			<MemoryRouter initialEntries={[path]}>
				<TenantSlugProvider value="tenant-a">
					<Routes>
						<Route path="/:tenantSlug">
							{routes}
							{/* ForbiddenRedirect 落点（App.tsx 同构：/:tenantSlug/403） */}
							<Route path="403" element={<div data-testid="forbidden-403">403</div>} />
						</Route>
					</Routes>
				</TenantSlugProvider>
			</MemoryRouter>
		</QueryClientProvider>,
	);
}

describe('路由守卫口径（AC-AB1-07 / AC-AB1-08）', () => {
	beforeEach(() => {
		resetAuthStore();
	});

	afterEach(() => {
		cleanup();
		resetAuthStore();
	});

	it('AC-AB1-07：security_admin 直链 legal-documents ⇒ 渲染页面（D1c 显式加）', async () => {
		seedSession('security_admin');
		renderAt(AuditComplianceRoutes, '/tenant-a/compliance/legal-documents');

		expect(await screen.findByTestId('page-legal-documents')).toBeTruthy();
		expect(screen.queryByTestId('forbidden-403')).toBeNull();
	});

	it('AC-AB1-07：admin 直链 legal-documents ⇒ 渲染页面（不回归）', async () => {
		seedSession('admin');
		renderAt(AuditComplianceRoutes, '/tenant-a/compliance/legal-documents');

		expect(await screen.findByTestId('page-legal-documents')).toBeTruthy();
		expect(screen.queryByTestId('forbidden-403')).toBeNull();
	});

	it('AC-AB1-08：security_admin 直达 pay/reconciliation ⇒ ForbiddenRedirect', async () => {
		seedSession('security_admin');
		renderAt(FinanceRoutes, '/tenant-a/pay/reconciliation');

		expect(await screen.findByTestId('forbidden-403')).toBeTruthy();
		expect(screen.queryByTestId('page-reconciliation')).toBeNull();
	});

	it('AC-AB1-08：security_admin 直达 wallet/disputes ⇒ ForbiddenRedirect', async () => {
		seedSession('security_admin');
		renderAt(FinanceRoutes, '/tenant-a/wallet/disputes');

		expect(await screen.findByTestId('forbidden-403')).toBeTruthy();
		expect(screen.queryByTestId('page-wallet-disputes')).toBeNull();
	});

	it('finance 正对照：admin 直达 pay/reconciliation ⇒ 渲染页面（Admin 语义锁定，防误宽/误缩）', async () => {
		seedSession('admin');
		renderAt(FinanceRoutes, '/tenant-a/pay/reconciliation');

		expect(await screen.findByTestId('page-reconciliation')).toBeTruthy();
		expect(screen.queryByTestId('forbidden-403')).toBeNull();
	});
});
