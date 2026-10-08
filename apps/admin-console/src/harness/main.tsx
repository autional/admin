/**
 * admin 控制台**外壳取景框**（第 53 轮）—— 与 platform-console 的同名文件同构：
 * 给 visual / contrast 两道闸门一个能渲染出真实导航图标的静态目标页。
 *
 * 为什么必须是取景框：真实 dist 走不通 —— 无后端时控制台自身的 API 失败会触发
 * `onUnauthorized` 整页弹登录页（platform 侧实测 `rt=…session-expired&from_requireauth=1`），
 * 而 `/404` `/403` 这类免鉴权页只有设计系统的 `Result`，**一个站点自己的图标都没有**。
 * 所以这里只挂外壳：`AppShell`（零网络调用）+ 站点自己的 `NavMenu`，只换数据。
 *
 * 取景纪律（对齐 user 门户 storybook 先例与 authenticator / platform harness）：**只换数据，不换代码路径**——
 *   ① 会话：真实 `useAuthStore`，塞一条**本租户行且 role=super_admin** —— `useCurrentRole()` 取的就是
 *      `tenants` 里匹配 `currentTenantId` 那行的 role，而 `usePermission` 对 `super_admin` 放行全部
 *      `tenant:*` / `platform:*`（usePermission.ts 第 100–101 行）。不播种 ⇒ 菜单被权限过滤成空。
 *   ② feature gate：admin 的菜单是**权限 AND featureGateKey** 双过滤（NavMenu 第 515 行），
 *      而 `useFeatureGates()` 在查询无数据时返回**空集** ⇒ 带 `featureGateKey: 'nhi'` 的 5 个菜单项会消失。
 *      所以桩对 `/billing/api/v1/admin/billing/feature-gates` 返回 `nhi: enabled` —— 这是**数据**，不是改代码路径。
 *   ③ 网络：其余 API 前缀短路成 200，避免 401 → onUnauthorized → 整页跳走。
 *   ④ 不挂顶栏右侧控件（HeaderActions 会挂通知流，是 L24 记过的雷）—— 本取景框覆盖**侧栏导航**。
 *
 * 对生产零干扰：生产 `src/main.tsx` 不 import 本目录。
 */
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter, Routes, Route } from 'react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AppShell, ThemeProvider } from '@autional/ui';
import { TenantSlugProvider, useAuthStore } from '@autional/shared';
import { AntdAppProvider } from '../lib/antd-app';
import { NavMenu } from '../components/layout/NavMenu';
import '../i18n';
import '../app/globals.css';

const HARNESS_SLUG = 'demo';
const HARNESS_TENANT_ID = 'harness-tenant';

function makeProbeToken() {
	const payload = {
		tenant_id: HARNESS_TENANT_ID,
		sub: 'harness-probe',
		email: 'harness@probe.invalid',
		custom: { username: 'harness' },
		exp: Math.floor(Date.now() / 1000) + 86400 * 365,
	};
	return 'h.' + btoa(JSON.stringify(payload)) + '.s';
}

// ① 会话播种（真实 store，只换数据）
useAuthStore.setState({
	accessToken: makeProbeToken(),
	refreshToken: 'harness-probe-refresh',
	user: { id: 'harness-probe', username: 'harness', email: 'harness@probe.invalid', status: 'active' },
	tenants: [{ id: HARNESS_TENANT_ID, name: 'demo', role: 'super_admin' }],
	currentTenantId: HARNESS_TENANT_ID,
	permissions: [],
	isAuthenticated: true,
} as never);

// ②/③ 网络桩：feature-gates 打开 nhi，其余 API 前缀返回空壳 200
const API_PREFIXES = ['/api/v1/', '/identity/', '/tenant/', '/audit/', '/billing/', '/compliance/', '/storage/',
	'/wallet/', '/session/', '/mfa/', '/notification/', '/communication/', '/point/', '/profile/', '/status/',
	'/oauth/', '/bff', '/.well-known/'];
const FEATURE_GATES_PATH = '/billing/api/v1/admin/billing/feature-gates';
const realFetch = window.fetch.bind(window);
window.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
	const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
	try {
		const u = new URL(url, window.location.origin);
		if (u.origin === window.location.origin && API_PREFIXES.some((p) => u.pathname.startsWith(p))) {
			const body = u.pathname === FEATURE_GATES_PATH
				? { featureGates: [{ key: 'nhi', enabled: true }] }
				: { items: [], total: 0 };
			return Promise.resolve(new Response(JSON.stringify(body), {
				status: 200,
				headers: { 'content-type': 'application/json' },
			}));
		}
	} catch {
		/* 非法 URL 交给真 fetch */
	}
	return realFetch(input as RequestInfo, init);
}) as typeof window.fetch;

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } } });

function Harness() {
	return (
		<TenantSlugProvider value={HARNESS_SLUG}>
			<AppShell
				brand={<span className="truncate text-lg font-bold">Autional 管理控制台</span>}
				nav={<NavMenu />}
				headerLeft={<span className="text-sm">外壳取景框</span>}
				headerRight={<span className="text-sm">harness</span>}
			>
				<div className="p-6 text-sm">admin-console shell harness —— 只量外壳（侧栏导航图标），不含页面内容。</div>
			</AppShell>
		</TenantSlugProvider>
	);
}

createRoot(document.getElementById('root')!).render(
	<StrictMode>
		<QueryClientProvider client={queryClient}>
			<MemoryRouter initialEntries={['/']}>
				<ThemeProvider storageKey="admin-console-harness-theme">
					<AntdAppProvider>
						<Routes>
							<Route path="*" element={<Harness />} />
						</Routes>
					</AntdAppProvider>
				</ThemeProvider>
			</MemoryRouter>
		</QueryClientProvider>
	</StrictMode>,
);
