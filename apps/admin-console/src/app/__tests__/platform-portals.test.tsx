// TASK-AB1-27（fix-admin-b1-guard-contract / RC-5 契约收敛）：platform-portals 页契约回归锁。
//
//   ① 列表 wire = service-core 扁平 ListResponse（items/total/pagination）经拦截器解包 + 深 camel：
//      行正常渲染（旧缺陷 = raw fetch 手读 res.data 恒 undefined ⇒ 表格恒空）；
//   ② 请求参数 camel 书面写 → 拦截器 snake 化上 wire：captured.params 恰为
//      {type:'portal', is_platform:true}（旧缺陷 = 手拼 URL 字面量 ?type=portal&is_platform=true）；
//   ③ 错误路径（HTTP 500）→ PageError + 重试（旧缺陷 = 手判 res.code !== 0 信封）；
//   ④ 非平台租户会话零请求 + Empty（U320 语义回归锁）。
//
// 断言口径 = 最终 wire 请求（shared apiClient axios adapter 捕获，同 roles-permissions-pagination 先例）；
// 会话播种用未来 exp 的 JWT 形 token 绕开预判式刷新（TASK-AB1-14 实证，同 legal-documents-contract 先例）。
// 注：axios 自定义 adapter 不走 settle —— 错误注入须显式 reject（返回 {status:500} 会被当作成功响应）。

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { apiClient, useAuthStore, PLATFORM_TENANT_ID } from '@autional/shared';
import PlatformPortalsPage from '../applications/platform-portals/page';

const OTHER_TENANT_ID = '01AAAA1111BBBB2222CCCC3333';
const LIST_URL = `/tenant/api/v1/admin/tenants/${PLATFORM_TENANT_ID}/applications`;

interface CapturedCall {
	method: string;
	url: string;
	params?: Record<string, unknown>;
}

const captured: CapturedCall[] = [];
let originalAdapter: unknown;

/** wire 形状（snake）原始行 = ApplicationResponse 契约（service-tenant dto.go:1248-1271，无 config 字段）。 */
const RAW_PORTALS = [
	{
		id: 'p-1',
		tenant_id: PLATFORM_TENANT_ID,
		code: 'platform-admin',
		name: '平台管理台',
		description: '平台内置管理台',
		type: 'portal',
		status: 'active',
		is_platform: true,
		order: 1,
	},
];

/** service-core 扁平 ListResponse：拦截器只保留 items/total/pagination 并深 camel 化。 */
function listEnvelope(items: unknown[]) {
	return {
		code: 0,
		message: 'ok',
		items,
		total: items.length,
		pagination: { total: items.length, page: 1, page_size: 20, total_pages: 1, has_next: false },
		timestamp: '2026-10-04T00:00:00Z',
	};
}

/** adapter 捕获/注入：ok = 回写真实 wire 信封；error = 显式 reject 500（见文件头注）。 */
function installCaptureAdapter(mode: 'ok' | 'error' = 'ok') {
	originalAdapter = apiClient.defaults.adapter;
	apiClient.defaults.adapter = (async (config: any) => {
		captured.push({
			method: String(config.method || 'get').toLowerCase(),
			url: String(config.url || ''),
			params: config.params as Record<string, unknown> | undefined,
		});
		if (mode === 'error') {
			const err = new Error('Internal Server Error') as Error & {
				config?: unknown;
				response?: { status: number; data: unknown };
			};
			err.config = config;
			err.response = { status: 500, data: { code: 500, message: 'boom' } };
			throw err;
		}
		return { data: listEnvelope(RAW_PORTALS), status: 200, statusText: 'OK', headers: {}, config };
	}) as any;
}

/** 假 JWT 形 access token（未来 exp）——绕开 isTokenExpired 预判刷新（TASK-AB1-14 实证）。 */
function futureJwt(): string {
	const b64 = (obj: unknown) => btoa(JSON.stringify(obj));
	return `${b64({ alg: 'none', typ: 'JWT' })}.${b64({ exp: Math.floor(Date.now() / 1000) + 3600 })}.sig`;
}

function seedSession(tenantId: string): void {
	useAuthStore.setState({
		user: { id: 'u-1', username: 'tester' } as never,
		accessToken: futureJwt(),
		refreshToken: 'test-refresh',
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
			<PlatformPortalsPage />
		</QueryClientProvider>,
	);
}

const listCalls = () => captured.filter((c) => c.method === 'get' && c.url.includes(LIST_URL));

describe('platform-portals 契约收敛（RC-5 / TASK-AB1-27）', () => {
	beforeEach(() => {
		captured.length = 0;
		resetAuthStore();
	});

	afterEach(() => {
		cleanup();
		resetAuthStore();
		if (originalAdapter !== undefined) apiClient.defaults.adapter = originalAdapter as any;
	});

	it('非平台租户会话：隐藏 + 零请求（U320 语义回归锁）', async () => {
		seedSession(OTHER_TENANT_ID);
		installCaptureAdapter();
		renderPage();

		expect(
			await screen.findByText('平台内置 Portal 属平台租户数据，仅平台租户会话可查看。'),
		).toBeTruthy();
		expect(document.querySelector('.ant-table')).toBeNull();
		expect(captured).toHaveLength(0);
	});

	it('平台租户会话：扁平 ListResponse 经拦截器出表；请求参数 camel 书面写（wire = type/is_platform）', async () => {
		seedSession(PLATFORM_TENANT_ID);
		installCaptureAdapter();
		renderPage();

		// ① 行渲染（旧缺陷 = 手读 res.data 恒 undefined ⇒ 空表）
		expect(await screen.findByText('平台管理台')).toBeTruthy();
		expect(screen.getByText('platform-admin')).toBeTruthy();

		// ② 单次列表请求 + wire 参数形状（camel 书面写经拦截器 snake 化）
		expect(listCalls()).toHaveLength(1);
		expect(listCalls()[0].params).toEqual({ type: 'portal', is_platform: true });
		expect(listCalls()[0].url).toContain(LIST_URL);
	});

	it('平台租户会话 + HTTP 500：PageError + 重试（旧 = 手判信封 code）', async () => {
		seedSession(PLATFORM_TENANT_ID);
		installCaptureAdapter('error');
		renderPage();

		expect(await screen.findByText('加载应用列表失败')).toBeTruthy();
		expect(screen.getByText('重试')).toBeTruthy();
	});
});
