// W1c（A-144 · A-146）：角色激活记录页回归锁 ——
//   A-144：服务端分页接线（page/page_size 上 wire；total 驱动分页器；切页/筛选变更回落第 1 页）
//   A-146：日期随 UI 语言本地化（旧硬编码 'zh-CN' → EN 模式日期仍中文格式）+ tab 标题（usePageTitle）
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent, cleanup, configure } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router';
import i18n from 'i18next';
import { apiClient } from '@autional/shared';
import RoleActivationsPage from '../page';

vi.mock('@/lib/antd-app', () => ({
	message: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

// W1c 全量并发加固：78 文件并跑满载时首用例表单回填可超 waitFor 默认 1s 预算
// （全量门实测：password-policy 首用例 value='' 超时；隔离跑 3/3 绿）。
configure({ asyncUtilTimeout: 15000 });

const LIST_URL = '/identity/api/v1/admin/role-activations';
const TS = '2026-10-06T00:00:00Z';
const EXPIRE_AT = '2026-10-04T02:00:00Z';
const CREATED_AT = '2026-10-05T01:00:00Z';

/** wire 形状（snake）激活记录（service-rbac dto.go:126 user_id/role_id/expire_at/created_at）。 */
const RAW_ROWS = [
	{
		id: 'ra-w1c-1',
		tenant_id: 'tenant-w1c-ra',
		user_id: 'user-000000000000000001',
		role_id: 'role-000000000000000001',
		status: 'active',
		justification: 'w1c-工单甲',
		activated_at: '2026-10-04T01:00:00Z',
		expire_at: EXPIRE_AT,
		revoked_at: '',
		created_at: CREATED_AT,
	},
	{
		id: 'ra-w1c-2',
		tenant_id: 'tenant-w1c-ra',
		user_id: 'user-000000000000000002',
		role_id: 'role-000000000000000002',
		status: 'revoked',
		justification: 'w1c-工单乙',
		activated_at: '2026-10-04T01:00:00Z',
		expire_at: EXPIRE_AT,
		revoked_at: '2026-10-04T03:00:00Z',
		created_at: CREATED_AT,
	},
];

let originalAdapter: unknown;
const listCalls: Array<{ params?: Record<string, unknown> }> = [];

function ok(payload: unknown, config: any) {
	return { data: payload, status: 200, statusText: 'OK', headers: {}, config };
}

function installCaptureAdapter() {
	listCalls.length = 0;
	originalAdapter = apiClient.defaults.adapter;
	apiClient.defaults.adapter = (async (config: any) => {
		const url = String(config.url || '');
		const method = String(config.method || 'get').toLowerCase();
		if (url === LIST_URL && method === 'get') {
			listCalls.push({ params: config.params as Record<string, unknown> | undefined });
			return ok(
				{
					code: 0,
					message: 'success',
					items: RAW_ROWS,
					total: 25,
					pagination: { total: 25, page: 1, page_size: 10, total_pages: 3, has_next: true },
					timestamp: TS,
				},
				config,
			);
		}
		return ok({ code: 0, message: 'success', data: {}, timestamp: TS }, config);
	}) as any;
}

function renderPage() {
	const queryClient = new QueryClient({
		defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
	});
	return render(
		<QueryClientProvider client={queryClient}>
			<MemoryRouter>
				<RoleActivationsPage />
			</MemoryRouter>
		</QueryClientProvider>,
	);
}

describe('角色激活记录页（A-144/A-146）', () => {
	beforeEach(async () => {
		vi.clearAllMocks();
		await i18n.changeLanguage('zh-CN');
		installCaptureAdapter();
	});

	afterEach(async () => {
		cleanup();
		apiClient.defaults.adapter = originalAdapter as any;
		await i18n.changeLanguage('zh-CN');
	});

	it(
		'AC-B5-W1c-19：分页参数上 wire（page/page_size）+ total=25 驱动分页器 + 切页发 page=2 + 筛选带 status 且回落第 1 页',
		{ timeout: 20000 },
		async () => {
			renderPage();
			expect(await screen.findByText('w1c-工单甲')).toBeTruthy();

			// A-144：首屏请求带 page/page_size（旧实现无参 → 后端默认 20 截断 → 必红）
			await waitFor(() => expect(listCalls.length).toBeGreaterThan(0));
			expect(listCalls[0].params).toMatchObject({ page: 1, page_size: 10 });

			// total=25 → 3 页可达；切页发 page=2
			expect(screen.getByTitle('2')).toBeTruthy();
			expect(screen.getByTitle('3')).toBeTruthy();
			fireEvent.click(screen.getByTitle('2'));
			await waitFor(() => expect(listCalls.some((c) => c.params?.page === 2)).toBe(true));

			// 状态筛选：打开 Select → 选「已撤销」→ status=revoked 且 page 回落 1
			const filterSelect = screen.getByText('全部').closest('.ant-select') as HTMLElement;
			expect(filterSelect).toBeTruthy();
			fireEvent.mouseDown(filterSelect);
			const option = await waitFor(() => {
				const el = document.querySelector('.ant-select-item-option[title="已撤销"]');
				expect(el).toBeTruthy();
				return el as HTMLElement;
			});
			fireEvent.click(option);
			await waitFor(() =>
				expect(listCalls.some((c) => c.params?.status === 'revoked')).toBe(true),
			);
			const filtered = listCalls.find((c) => c.params?.status === 'revoked')!;
			expect(filtered.params).toMatchObject({ page: 1, page_size: 10 });
		},
	);

	it('AC-B5-W1c-20：EN 模式日期本地化（旧硬编码 zh-CN 格式 → 必红）+ tab 标题随语言', { timeout: 20000 }, async () => {
		await i18n.changeLanguage('en-US');
		renderPage();

		expect(await screen.findByText('w1c-工单甲')).toBeTruthy();
		// A-146：tab 标题（旧恒「Autional 管理控制台」→ 必红）
		expect(document.title).toContain('Activation Records');

		// A-146：日期列 = en-US 格式（旧硬编码 'zh-CN' → 输出 2026/10/4 形态 → 必红）
		const enExpire = new Date(EXPIRE_AT).toLocaleDateString('en-US');
		const enCreated = new Date(CREATED_AT).toLocaleDateString('en-US');
		expect(enExpire).not.toBe(new Date(EXPIRE_AT).toLocaleDateString('zh-CN'));
		expect(screen.getAllByText(enExpire).length).toBeGreaterThanOrEqual(1);
		expect(screen.getAllByText(enCreated).length).toBeGreaterThanOrEqual(1);
	});
});
