// W1c（A-136 · A-138 · A-140）：ABAC 策略页回归锁 ——
//   A-136：服务端分页接线（page/page_size 上 wire；total 驱动分页器；切页发 page=2）
//   A-138：ABAC 条件校验错误经代理透传展示（后端 message 逐字上屏，不落 fallback）
//   A-140：usePageTitle（tab 标题）+ 优先级口径说明（列表列头 Tooltip）+ 条件列 title 全文提示
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent, cleanup, configure } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router';
import { apiClient, useAuthStore } from '@autional/shared';
import { message } from '@/lib/antd-app';
import AbacPoliciesPage from '../page';

vi.mock('@/lib/antd-app', () => ({
	message: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
	modal: { confirm: vi.fn() },
}));

// W1c 全量并发加固：78 文件并跑满载时首用例表单回填可超 waitFor 默认 1s 预算
// （全量门实测：password-policy 首用例 value='' 超时；隔离跑 3/3 绿）。
configure({ asyncUtilTimeout: 15000 });

const TENANT = 'tenant-w1c-abac';
const LIST_URL = '/identity/api/v1/admin/abac-policies';
const TS = '2026-10-06T00:00:00Z';

const CONDITION = '{"user.role":"ops"}';

/** wire 形状（snake）租户属主策略（经拦截器 camel 化）。 */
const RAW_ROW = {
	id: 'pol-w1c-1',
	tenant_id: TENANT,
	name: 'Tenant Allow Ops',
	description: 'tenant owned',
	priority: 10,
	condition: CONDITION,
	effect: 'allow',
	enabled: true,
	created_at: TS,
	updated_at: TS,
};

let originalAdapter: unknown;
let failPut = false;
const captured: Array<{ method: string; url: string; params?: Record<string, unknown> }> = [];

function httpError(status: number, config: any, data?: unknown) {
	const err: any = new Error(`Request failed with status code ${status}`);
	err.response = { status, data: data ?? { code: `${status}00000` }, headers: {}, config };
	err.config = config;
	return err;
}

function ok(payload: unknown, config: any) {
	return { data: payload, status: 200, statusText: 'OK', headers: {}, config };
}

function installCaptureAdapter() {
	captured.length = 0;
	originalAdapter = apiClient.defaults.adapter;
	apiClient.defaults.adapter = (async (config: any) => {
		const url = String(config.url || '');
		const method = String(config.method || 'get').toLowerCase();
		captured.push({ method, url, params: config.params as Record<string, unknown> | undefined });
		if (url === LIST_URL && method === 'get') {
			return ok(
				{
					code: 0,
					message: 'success',
					items: [RAW_ROW],
					total: 43,
					pagination: { total: 43, page: 1, page_size: 10, total_pages: 5, has_next: true },
					timestamp: TS,
				},
				config,
			);
		}
		if (url.startsWith(`${LIST_URL}/`) && method === 'put') {
			if (failPut) {
				throw httpError(400, config, {
					code: '40000200',
					title: 'Invalid Condition',
					message: '条件表达式解析失败: unexpected token',
				});
			}
			return ok({ code: 0, message: 'success', data: RAW_ROW, timestamp: TS }, config);
		}
		return ok({ code: 0, message: 'success', data: {}, timestamp: TS }, config);
	}) as any;
}

function seedSession(tenantId: string): void {
	useAuthStore.setState({
		user: { id: 'u-1', username: 'tester' } as never,
		accessToken: null,
		refreshToken: null,
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
			<MemoryRouter>
				<AbacPoliciesPage />
			</MemoryRouter>
		</QueryClientProvider>,
	);
}

const listCalls = () => captured.filter((c) => c.method === 'get' && c.url === LIST_URL);

describe('ABAC 策略页（A-136/A-138/A-140）', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		failPut = false;
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
		'AC-B5-W1c-16/18：分页参数上 wire（page/page_size）+ total=43 驱动分页器 + 切页发 page=2；标题/提示位就绪',
		{ timeout: 20000 },
		async () => {
			renderPage();
			expect(await screen.findByText('Tenant Allow Ops')).toBeTruthy();

			// A-136：首屏请求带 page/page_size（旧实现无参 → 后端默认 20 截断 → 必红）
			await waitFor(() => expect(listCalls().length).toBeGreaterThan(0));
			expect(listCalls()[0].params).toMatchObject({ page: 1, page_size: 10 });

			// A-136：total=43 驱动分页器（5 页）；切页发 page=2
			expect(screen.getByTitle('2')).toBeTruthy();
			expect(screen.getByTitle('5')).toBeTruthy();
			fireEvent.click(screen.getByTitle('2'));
			await waitFor(() => expect(listCalls().some((c) => c.params?.page === 2)).toBe(true));

			// A-140：tab 标题 + 优先级列头 Tooltip 口径说明 + 条件列 title 全文
			expect(document.title).toContain('ABAC 策略管理');
			expect(screen.getByRole('columnheader', { name: /优先级/ })).toBeTruthy();
			const code = document.querySelector('td code[title]') as HTMLElement;
			expect(code).toBeTruthy();
			expect(code.getAttribute('title')).toBe(CONDITION);
		},
	);

	it('AC-B5-W1c-17：条件校验错误经代理透传展示（后端 message 逐字上屏）', { timeout: 20000 }, async () => {
		failPut = true;
		renderPage();
		expect(await screen.findByText('Tenant Allow Ops')).toBeTruthy();

		fireEvent.click(screen.getByText('编辑'));
		expect(await screen.findByText('编辑策略')).toBeTruthy();

		// 注入非法条件（后端 400 校验）→ 提交 → 错误消息逐字透出
		const condition = document.querySelector('#condition') as HTMLTextAreaElement;
		expect(condition.value).toBe(CONDITION);
		fireEvent.change(condition, { target: { value: '{"user.role":' } });

		const okBtn = document.querySelector('.ant-modal .ant-btn-primary') as HTMLElement;
		expect(okBtn).toBeTruthy();
		fireEvent.click(okBtn);

		await waitFor(() =>
			expect(message.error).toHaveBeenCalledWith('条件表达式解析失败: unexpected token'),
		);
		// wire 锚：确实发起了 PUT（错误来自后端而非前端拦截；旧 fallback 文案不出现）
		expect(captured.some((c) => c.method === 'put' && c.url.startsWith(`${LIST_URL}/`))).toBe(true);
	});
});
