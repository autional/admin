// TASK-AB1-18（fix-admin-b1-guard-contract / A-14 · A-17）：roles / permissions 服务端分页契约回归锁。
//
//   AC-AB1-32：roles/permissions 切页发出正确 `page_size` 且 total 驱动分页器。
//
// 断言口径 = **最终 wire 请求**（沿用 AB1-17 users-contract 模式）：捕获器装在 shared apiClient 的
// axios adapter（请求拦截器之后最末环），跑真实链路 page → useRoles/usePermissions → generated api
// → 拦截器 → adapter；adapter 回写 wire 形状（snake，service-core 扁平 ListResponse）响应，由响应
// 拦截器深 camel 化 + 解包，与线上链路同构。
//   ① 首屏渲染：snake 原始行经拦截器 camel 化后正常出表；
//   ② 请求参数：恰含 page/page_size（旧缺陷不带分页参数 → 后端忽略，此处判别）；
//   ③ 单次列表请求：无前端二次取数旁路；
//   ④ total 驱动分页器：total=25（>pageSize 10）时第 2/3 页按钮存在（前端 slice 假分页只有 1 页）；
//   ⑤ 切页：点击第 2 页发出 page=2&page_size=10 的真实服务端请求（非前端切片）。

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router';
import type { ReactElement } from 'react';
import { apiClient } from '@autional/shared';
import RolesPage from '../roles/page';
import PermissionsPage from '../permissions/page';

interface CapturedCall {
	method: string;
	url: string;
	params?: Record<string, unknown>;
}

const ROLES_URL = '/rbac/api/v1/admin/roles';
const PERMISSIONS_URL = '/rbac/api/v1/admin/permissions';
const captured: CapturedCall[] = [];
let originalAdapter: unknown;

/** wire 形状（snake）原始数据：经响应拦截器转 camel。 */
const RAW_ROLES = [
	{
		id: 'r-1',
		tenant_id: 't-1',
		code: 'admin',
		name: '管理员',
		description: '系统管理员',
		data_scope: 'all',
		is_system: true,
		permission_count: 12,
		created_at: '2026-01-01T00:00:00Z',
		updated_at: '2026-01-01T00:00:00Z',
	},
	{
		id: 'r-2',
		tenant_id: 't-1',
		code: 'editor',
		name: '编辑',
		description: '内容编辑',
		data_scope: 'self',
		is_system: false,
		permission_count: 7,
		created_at: '2026-02-01T00:00:00Z',
		updated_at: '2026-02-01T00:00:00Z',
	},
];

const RAW_PERMISSIONS = [
	{
		id: 'p-1',
		code: 'user:read',
		name: '读取用户',
		resource: 'user',
		action: 'read',
		category: 'user',
		description: '读取用户信息',
	},
	{
		id: 'p-2',
		code: 'user:create',
		name: '创建用户',
		resource: 'user',
		action: 'create',
		category: 'user',
		description: '创建新用户',
	},
];

/** service-core 扁平 ListResponse：拦截器只保留 items/total/pagination 并深 camel 化。 */
function listEnvelope(items: unknown[]) {
	return {
		code: 0,
		message: 'ok',
		items,
		total: 25,
		pagination: { total: 25, page: 1, page_size: 10, total_pages: 3, has_next: true },
		timestamp: '2026-10-04T00:00:00Z',
	};
}

function installCaptureAdapter() {
	originalAdapter = apiClient.defaults.adapter;
	apiClient.defaults.adapter = (async (config: any) => {
		const url = String(config.url || '');
		captured.push({
			method: String(config.method || 'get').toLowerCase(),
			url,
			params: config.params as Record<string, unknown> | undefined,
		});
		const items = url.includes(PERMISSIONS_URL) ? RAW_PERMISSIONS : RAW_ROLES;
		return { data: listEnvelope(items), status: 200, statusText: 'OK', headers: {}, config };
	}) as any;
}

function renderPage(ui: ReactElement) {
	const queryClient = new QueryClient({
		defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
	});
	return render(
		<QueryClientProvider client={queryClient}>
			<MemoryRouter>{ui}</MemoryRouter>
		</QueryClientProvider>,
	);
}

const roleCalls = () => captured.filter((c) => c.url.includes(ROLES_URL));
const permissionCalls = () => captured.filter((c) => c.url.includes(PERMISSIONS_URL));

describe('roles 页服务端分页契约（A-17）', () => {
	beforeEach(() => {
		captured.length = 0;
		installCaptureAdapter();
	});

	afterEach(() => {
		apiClient.defaults.adapter = originalAdapter as any;
	});

	it('AC-AB1-32：首屏请求带 page/page_size，total 驱动分页器，切页发出 page=2 服务端请求', async () => {
		renderPage(<RolesPage />);

		// ① 首屏渲染：snake 原始行经拦截器 camel 化后出表
		expect(await screen.findByText('admin')).toBeTruthy();
		expect(screen.getByText('管理员')).toBeTruthy();
		expect(screen.getByText('editor')).toBeTruthy();

		// ② 请求参数：page/page_size 单点（旧缺陷不传分页参数 → 后端默认截断）
		await waitFor(() => expect(roleCalls().length).toBeGreaterThan(0));
		expect(roleCalls()[0].params).toEqual({ page: 1, page_size: 10 });

		// ③ 单次列表请求：无前端二次取数旁路
		expect(roleCalls()).toHaveLength(1);

		// ④ total=25（服务端）驱动分页器：第 2、3 页可达（前端 slice 假分页只有 1 页）
		expect(screen.getByTitle('2')).toBeTruthy();
		expect(screen.getByTitle('3')).toBeTruthy();

		// ⑤ 切页：点击第 2 页 → 发出 page=2&page_size=10 的真实服务端请求
		fireEvent.click(screen.getByTitle('2'));
		await waitFor(() => expect(roleCalls().some((c) => c.params?.page === 2)).toBe(true));
		const page2 = roleCalls().filter((c) => c.params?.page === 2);
		expect(page2[0].params!.page_size).toBe(10);
	});
});

describe('permissions 页服务端分页契约（A-14）', () => {
	beforeEach(() => {
		captured.length = 0;
		installCaptureAdapter();
	});

	afterEach(() => {
		apiClient.defaults.adapter = originalAdapter as any;
	});

	it('AC-AB1-32：首屏请求带 page/page_size，total 驱动分页器，切页发出 page=2 服务端请求', async () => {
		renderPage(<PermissionsPage />);

		// ① 首屏渲染：snake 原始行经拦截器 camel 化后出表
		expect(await screen.findByText('user:read')).toBeTruthy();
		expect(screen.getByText('读取用户')).toBeTruthy();

		// ② 请求参数：page/page_size 单点（旧缺陷不传参 → 首页 20 条本地分页，其余不可达）
		await waitFor(() => expect(permissionCalls().length).toBeGreaterThan(0));
		expect(permissionCalls()[0].params).toEqual({ page: 1, page_size: 10 });

		// ③ 单次列表请求：无前端二次取数旁路
		expect(permissionCalls()).toHaveLength(1);

		// ④ total=25（服务端）驱动分页器：第 2、3 页可达（前端 slice 假分页只有 1 页）
		expect(screen.getByTitle('2')).toBeTruthy();
		expect(screen.getByTitle('3')).toBeTruthy();

		// ⑤ 切页：点击第 2 页 → 发出 page=2&page_size=10 的真实服务端请求
		fireEvent.click(screen.getByTitle('2'));
		await waitFor(() => expect(permissionCalls().some((c) => c.params?.page === 2)).toBe(true));
		const page2 = permissionCalls().filter((c) => c.params?.page === 2);
		expect(page2[0].params!.page_size).toBe(10);
	});
});
