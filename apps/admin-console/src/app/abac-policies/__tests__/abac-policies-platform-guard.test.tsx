// TASK-AB2-09（fix-admin-b2-security-forensics / A-132f · AC-B2-015）：ABAC 策略页平台行只读契约锁。
//
// A-132f（RC-B2-04）：平台策略对租户面完全只读（ADR-B2-01 双面守卫的前端镜像）——
//   旧代码：列表无归属列（平台行不可辨）；平台行照常渲染编辑/删除入口（点击即触发后端 403）。
//   修：模型 camel 化（契约键直读，拦截器 snake→camel 后单次解包口径）+ 归属列（平台/租户）+
//   平台行只读（租户会话下隐藏入口 + 「平台策略只读」标记）；平台租户自身会话保持可操作
//   （镜像后端 platformPolicyWriteForbidden：requestTenantID == platform 时写路径放行，防误伤自管）。
//
// 反假绿：
//   ① 归属列标题「归属」+ 「平台」标签在旧代码必红（旧无此列）；
//   ② 租户会话下平台行「编辑/删除」缺席断言在旧代码必红（旧照常渲染入口）；
//   ③ 只读标记「平台策略只读」旧代码必红；平台行内 queryAllByRole('button') 为空（点击不可达）；
//   ④ 平台会话正控锁（防过度收口）：平台行入口保留 + 无只读标记；
//   ⑤ 租户行正控锁：编辑可达（Modal 开 + 表单预填）+ 删除走确认。

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { apiClient, useAuthStore, PLATFORM_TENANT_ID } from '@autional/shared';
import { modal } from '@/lib/antd-app';
import AbacPoliciesPage from '../page';

vi.mock('@/lib/antd-app', () => ({
	message: { success: vi.fn(), error: vi.fn() },
	modal: { confirm: vi.fn() },
}));

const TENANT = 'tenant-a';
const LIST_URL = '/identity/api/v1/admin/abac-policies';
const TS = '2026-10-04T00:00:00Z';

/** wire 形状（snake）平台属主策略（platformPolicyWriteForbidden 命中面，经拦截器 camel 化）。 */
const RAW_PLATFORM = {
	id: 'pol-plat-1',
	tenant_id: PLATFORM_TENANT_ID,
	name: 'Platform Deny Sensitive',
	description: 'platform owned',
	priority: 5,
	condition: '{"user.role":"guest"}',
	effect: 'deny',
	enabled: true,
	created_at: TS,
	updated_at: TS,
};

/** wire 形状（snake）租户属主策略（租户行保持可操作面）。 */
const RAW_TENANT = {
	id: 'pol-tenant-1',
	tenant_id: TENANT,
	name: 'Tenant Allow Ops',
	description: 'tenant owned',
	priority: 10,
	condition: '{"user.role":"ops"}',
	effect: 'allow',
	enabled: true,
	created_at: TS,
	updated_at: TS,
};

let originalAdapter: unknown;

function ok(payload: unknown, config: any) {
	return { data: payload, status: 200, statusText: 'OK', headers: {}, config };
}

function installCaptureAdapter() {
	originalAdapter = apiClient.defaults.adapter;
	apiClient.defaults.adapter = (async (config: any) => {
		const url = String(config.url || '');
		const method = String(config.method || 'get').toLowerCase();
		if (url === LIST_URL && method === 'get') {
			return ok(
				{ code: 0, message: 'success', items: [RAW_PLATFORM, RAW_TENANT], total: 2, timestamp: TS },
				config,
			);
		}
		return ok({ code: 0, message: 'success', data: {}, timestamp: TS }, config);
	}) as any;
}

// 本测试穿真实 wire（拦截器链路）：种 token 会触发请求拦截器「预判式 Token 刷新」假阴性。
// 按既有模式：只种租户/角色，不种 token。
function seedSession(tenantId: string): void {
	useAuthStore.setState({
		user: { id: 'u-1', username: 'tester' } as never,
		accessToken: null,
		refreshToken: null,
		tenants: [{ id: tenantId, name: 'T', role: 'admin' }],
		currentTenantId: tenantId,
		permissions: ['rbac:read'],
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
			<AbacPoliciesPage />
		</QueryClientProvider>,
	);
}

function rowOf(text: string): HTMLElement {
	const row = screen.getByText(text).closest('tr');
	expect(row).toBeTruthy();
	return row as HTMLElement;
}

describe('ABAC 策略页平台守卫（A-132f · AC-B2-015 / AC-B2-014 前端镜像）', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		resetAuthStore();
		seedSession(TENANT);
		installCaptureAdapter();
	});

	afterEach(() => {
		cleanup();
		apiClient.defaults.adapter = originalAdapter as any;
		resetAuthStore();
	});

	it(
		'AC-B2-015：归属列（平台/租户）+ 租户会话下平台行只读（无编辑/删除入口 + 只读标记）；租户行可操作',
		{ timeout: 20000 },
		async () => {
			renderPage();
			await screen.findByText('Platform Deny Sensitive');

			// 归属列（旧代码无此列 → 必红）；getByRole 收窄：antd 隐藏测量行亦含列标题副本
			expect(screen.getByRole('columnheader', { name: '归属' })).toBeInTheDocument();
			const platformRow = rowOf('Platform Deny Sensitive');
			const tenantRow = rowOf('Tenant Allow Ops');
			expect(within(platformRow).getByText('平台')).toBeInTheDocument();
			expect(within(tenantRow).getByText('租户')).toBeInTheDocument();

			// 平台行只读：无编辑/删除入口（旧代码照常渲染 → 必红）+ 只读标记 + 行内零 button（点击不可达）
			expect(within(platformRow).queryByText('编辑')).toBeNull();
			expect(within(platformRow).queryByText('删除')).toBeNull();
			expect(within(platformRow).getByText('平台策略只读')).toBeInTheDocument();
			expect(within(platformRow).queryAllByRole('button')).toHaveLength(0);

			// 租户行保持可操作
			expect(within(tenantRow).getByText('编辑')).toBeInTheDocument();
			expect(within(tenantRow).getByText('删除')).toBeInTheDocument();
		},
	);

	it(
		'正控：租户行编辑入口可达（Modal 开 + 表单预填）+ 删除走确认（防过度收口）',
		{ timeout: 20000 },
		async () => {
			renderPage();
			await screen.findByText('Tenant Allow Ops');
			const tenantRow = rowOf('Tenant Allow Ops');

			fireEvent.click(within(tenantRow).getByText('编辑'));
			await screen.findByText('编辑策略');
			const nameInput = document.querySelector('#name') as HTMLInputElement | null;
			expect(nameInput).toBeTruthy();
			expect(nameInput!.value).toBe('Tenant Allow Ops');

			fireEvent.click(within(tenantRow).getByText('删除'));
			expect(modal.confirm).toHaveBeenCalledTimes(1);
		},
	);

	it(
		'AC-B2-014 前端镜像：平台租户会话下平台行保持可操作（无只读标记；防误伤自管）',
		{ timeout: 20000 },
		async () => {
			seedSession(PLATFORM_TENANT_ID);
			renderPage();
			await screen.findByText('Platform Deny Sensitive');
			const platformRow = rowOf('Platform Deny Sensitive');

			expect(within(platformRow).getByText('编辑')).toBeInTheDocument();
			expect(within(platformRow).getByText('删除')).toBeInTheDocument();
			expect(within(platformRow).queryByText('平台策略只读')).toBeNull();
			// 归属列仍辨「平台」
			expect(within(platformRow).getByText('平台')).toBeInTheDocument();
		},
	);
});
