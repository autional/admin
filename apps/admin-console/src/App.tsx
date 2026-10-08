import { Routes, Route, Outlet, useParams } from 'react-router';
import type { ReactNode } from 'react';
import { Button } from 'antd';
import { PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { AppShell, ErrorBoundary } from '@autional/ui';
import { DEFAULT_ERROR_BOUNDARY } from './lib/error-boundary-config';
import { NavMenu } from './components/layout/NavMenu';
import { HeaderActions } from './components/layout/HeaderActions';
import { Breadcrumb } from './components/layout/Breadcrumb';
import { ImpersonationBanner } from './components/layout/ImpersonationBanner';
import { consumeImpersonationHash } from './lib/impersonation-handoff';
import { useUIStore } from './stores/ui-store';
import { ForbiddenRedirect } from './components/common/ForbiddenRedirect';
import {
	AuthGuard,
	AdminGuard,
	UserMgmtGuard,
	OAuthCallbackPage,
	RequireAuth,
	TenantIndexGuard,
	TenantRootRedirect,
	TenantSlugProvider,
	extractSlugFromPath,
	useBootstrap,
	useBranding,
	BrandingInitializer,
} from '@autional/shared';

// Pages
import DashboardPage from './app/page';
import UsersPage from './app/users/page';
import UserDetailPage from './app/users/[id]/page';
import RolesPage from './app/roles/page';
import PermissionsPage from './app/permissions/page';
import AbacPoliciesPage from './app/abac-policies/page';
import RoleActivationsPage from './app/role-activations/page';
import SessionsPage from './app/sessions/page';
import SecretsPage from './app/secrets/page';
import SecretPolicyPage from './app/secrets/policy/page';
import ProfilesPage from './app/profiles/page';
import ProfileDetailPage from './app/profiles/[userId]/page';
import ProfilePolicyPage from './app/profiles/policy/page';
import FieldSchemaPage from './app/profiles/field-schemas/page';
import ProfilesApprovalPage from './app/profiles/approval/page';
import ProfileWebhookPage from './app/profiles/webhook/page';
import ForbiddenPage from './app/403/page';
import NotFoundPage from './app/404/page';
import SettingsPage from './app/settings/page';

import { SecurityRoutes } from './routes/security';
import { NhiRoutes } from './routes/nhi';
import { OrganizationRoutes } from './routes/organization';
import { AppIntegrationRoutes } from './routes/app-integration';
import { FinanceRoutes } from './routes/finance';
import { AuditComplianceRoutes } from './routes/audit-compliance';
import { ConfigRoutes } from './routes/config';
import { DeveloperRoutes } from './routes/developer';

// 模拟交接消费必须发生在 React 渲染前：RequireAuth 首帧就要看到 store 里的模拟 token，
// 否则会被判未登录而弹去登录页。函数幂等，无 hash 时零副作用。
consumeImpersonationHash();

/**
 * 挂载级闸门：/:tenantSlug 交给共享 RequireAuth（含 F-W6/F-W7 未知 slug 闸门）；
 * 首段解析不出 slug 的裸路径（/users、/403 等站内业务段）一律本地 404 ——
 * 不进入 RequireAuth，避免其无 slug 分支的 buildLoginUrl 弹跳与 auth 侧回跳
 * 构成无限整页往返（与 platform Shape B 同口径）。
 */
function AdminMountGate({ children }: { children: ReactNode }) {
	if (typeof window === 'undefined') return null;
	if (!extractSlugFromPath(window.location.pathname)) return <NotFoundPage />;
	return <RequireAuth notFound={<NotFoundPage />}>{children}</RequireAuth>;
}

function LayoutWrapper() {
	const { tenantSlug } = useParams<{ tenantSlug?: string }>();
	useBootstrap();
	const { t } = useTranslation();
	const collapsed = useUIStore((s) => s.sidebarCollapsed);
	const toggleSidebar = useUIStore((s) => s.toggleSidebar);

	// 外壳（侧栏框架 + sticky 顶栏 + 移动端抽屉 + 内容滚动容器）来自设计系统，
	// 本站只提供内容：品牌、菜单、面包屑、折叠按钮、右上角控件。
	// 模拟横幅须在 shell 之上通栏（AppShell 无横幅槽位且自身 h-screen 固定）：
	// 外层 flex 列 + shell 强制 h-full 让出横幅高度；横幅为 null 时布局与原先一致。
	return (
		<TenantSlugProvider value={tenantSlug}>
			<div className="flex h-screen flex-col">
				<ImpersonationBanner />
				<div className="min-h-0 flex-1">
					<AppShell
						className="!h-full"
						brand={
							<span className="truncate text-lg font-bold">{collapsed ? 'A' : t('app.brand')}</span>
						}
						nav={<NavMenu />}
						sidebarCollapsed={collapsed}
						headerLeft={
							<>
								<Button
									type="text"
									className="hidden lg:inline-flex"
									icon={collapsed ? <PanelLeftOpen size="1em" /> : <PanelLeftClose size="1em" />}
									onClick={toggleSidebar}
									aria-label={collapsed ? t('header.expandSidebar') : t('header.collapseSidebar')}
									aria-expanded={!collapsed}
								/>
								<Breadcrumb />
							</>
						}
						headerRight={<HeaderActions />}
					>
						<div aria-live="polite" aria-atomic="true" className="sr-only" id="status-announcer" />
						<Outlet />
					</AppShell>
				</div>
			</div>
		</TenantSlugProvider>
	);
}

export default function App() {
	useBranding();

	return (
		<ErrorBoundary {...DEFAULT_ERROR_BOUNDARY}>
			<BrandingInitializer />
			<Routes>
				<Route path="/oauth/callback" element={<OAuthCallbackPage />} />

				{/* 裸根漏斗：有会话直达 /<slug>/，否则整页跳 brand 选品牌（user/security/platform 同口径） */}
				<Route path="/" element={<TenantRootRedirect />} />

				<Route
					path="/:tenantSlug"
					element={
						/* 控制台为租户段挂载应用：slug 是 OAuth client 解析与鉴权上下文的唯一来源 */
						<AdminMountGate>
							<LayoutWrapper />
						</AdminMountGate>
					}
				>
					{appRoutes()}
				</Route>

				{/* 无 slug 的其余路径（/users、/settings 等旧式深链）一律 404 —— 口径纯净 */}
				<Route path="*" element={<NotFoundPage />} />
			</Routes>
		</ErrorBoundary>
	);
}

function appRoutes() {
	return (
		<>
			<Route
				index
				element={
					<TenantIndexGuard notFound={<NotFoundPage />}>
						<AuthGuard>
							<DashboardPage />
						</AuthGuard>
					</TenantIndexGuard>
				}
			/>

			<Route
				path="users"
				element={
					<UserMgmtGuard fallback={<ForbiddenRedirect />}>
						<ErrorBoundary {...DEFAULT_ERROR_BOUNDARY}>
							<UsersPage />
						</ErrorBoundary>
					</UserMgmtGuard>
				}
			/>
			<Route
				path="users/:id"
				element={
					<UserMgmtGuard fallback={<ForbiddenRedirect />}>
						<UserDetailPage />
					</UserMgmtGuard>
				}
			/>
			<Route
				path="roles"
				element={
					<AdminGuard fallback={<ForbiddenRedirect />}>
						<ErrorBoundary {...DEFAULT_ERROR_BOUNDARY}>
							<RolesPage />
						</ErrorBoundary>
					</AdminGuard>
				}
			/>
			<Route
				path="permissions"
				element={
					<AdminGuard fallback={<ForbiddenRedirect />}>
						<ErrorBoundary {...DEFAULT_ERROR_BOUNDARY}>
							<PermissionsPage />
						</ErrorBoundary>
					</AdminGuard>
				}
			/>
			<Route
				path="abac-policies"
				element={
					<AdminGuard fallback={<ForbiddenRedirect />}>
						<ErrorBoundary {...DEFAULT_ERROR_BOUNDARY}>
							<AbacPoliciesPage />
						</ErrorBoundary>
					</AdminGuard>
				}
			/>
			<Route
				path="role-activations"
				element={
					<AdminGuard fallback={<ForbiddenRedirect />}>
						<ErrorBoundary {...DEFAULT_ERROR_BOUNDARY}>
							<RoleActivationsPage />
						</ErrorBoundary>
					</AdminGuard>
				}
			/>
			<Route
				path="sessions"
				element={
					<AdminGuard fallback={<ForbiddenRedirect />}>
						<ErrorBoundary {...DEFAULT_ERROR_BOUNDARY}>
							<SessionsPage />
						</ErrorBoundary>
					</AdminGuard>
				}
			/>
			<Route
				path="secrets"
				element={
					<AdminGuard fallback={<ForbiddenRedirect />}>
						<ErrorBoundary {...DEFAULT_ERROR_BOUNDARY}>
							<SecretsPage />
						</ErrorBoundary>
					</AdminGuard>
				}
			/>
			<Route
				path="secrets/policy"
				element={
					<AdminGuard fallback={<ForbiddenRedirect />}>
						<SecretPolicyPage />
					</AdminGuard>
				}
			/>
			<Route
				path="profiles"
				element={
					<AdminGuard fallback={<ForbiddenRedirect />}>
						<ProfilesPage />
					</AdminGuard>
				}
			/>
			<Route
				path="profiles/:userId"
				element={
					<AdminGuard fallback={<ForbiddenRedirect />}>
						<ProfileDetailPage />
					</AdminGuard>
				}
			/>
			<Route
				path="profiles/policy"
				element={
					<AdminGuard fallback={<ForbiddenRedirect />}>
						<ProfilePolicyPage />
					</AdminGuard>
				}
			/>
			<Route
				path="profiles/field-schemas"
				element={
					<AdminGuard fallback={<ForbiddenRedirect />}>
						<FieldSchemaPage />
					</AdminGuard>
				}
			/>
			<Route
				path="profiles/approval"
				element={
					<AdminGuard fallback={<ForbiddenRedirect />}>
						<ProfilesApprovalPage />
					</AdminGuard>
				}
			/>
			<Route
				path="profiles/webhook"
				element={
					<AdminGuard fallback={<ForbiddenRedirect />}>
						<ProfileWebhookPage />
					</AdminGuard>
				}
			/>

			{OrganizationRoutes}
			{AppIntegrationRoutes}
			{NhiRoutes}
			{SecurityRoutes}
			{ConfigRoutes}
			{DeveloperRoutes}
			{AuditComplianceRoutes}
			{FinanceRoutes}
			<Route
				path="settings"
				element={
					<AuthGuard>
						<ErrorBoundary {...DEFAULT_ERROR_BOUNDARY}>
							<SettingsPage />
						</ErrorBoundary>
					</AuthGuard>
				}
			/>
			{/* 403 与站内 404 都在租户段内（/:tenantSlug/403）；裸 /403 由 AdminMountGate 判为无 slug → 本地 404
			    （字面量 "403" 同时供 check-non-tenant 守卫推导首段名单，勿改表达式） */}
			<Route path="403" element={<ForbiddenPage />} />
			<Route path="404" element={<NotFoundPage />} />
			<Route path="*" element={<NotFoundPage />} />
		</>
	);
}
