// W1c（A-124 · A-125）：数据分类页回归锁 ——
//   A-124：description/color 双向读写（旧只读 label，保存丢弃 description/color）+ 非 4 级存量条目
//          原样保留（旧 LEVELS.map 全量覆写 → 他面定制条目保存即被静默抹除）+ updated_at 展示
//   A-125：刷新改局部 refetch（旧 window.location.reload() 整页重载）
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent, cleanup, configure } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router';
import { apiClient, useAuthStore } from '@autional/shared';
import DataClassificationPage from '../page';

vi.mock('@/lib/antd-app', () => ({
	message: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

// W1c 全量并发加固：78 文件并跑满载时首用例表单回填可超 waitFor 默认 1s 预算
// （全量门实测：password-policy 首用例 value='' 超时；隔离跑 3/3 绿）。
configure({ asyncUtilTimeout: 15000 });

const TENANT = 'tenant-w1c-dc';
const DC_URL = `/tenant/api/v1/admin/tenants/${TENANT}/data-classification`;
const UPDATED_AT = '2026-10-06T01:02:03Z';

/** wire 形状（snake）分类配置：4 级中 2 级 + 1 条非 4 级存量（他面定制）。 */
const RAW_DC = {
	tenant_id: TENANT,
	classifications: [
		{ level: 'public', label: '公开数据', description: '公开可见', color: '#52C41A' },
		{ level: 'internal', label: '内部数据', description: '', color: 'blue' },
		{ level: 'critical', label: '关键数据', description: '他面定制条目', color: 'purple' },
	],
	updated_at: UPDATED_AT,
};

let originalAdapter: unknown;
let getCount = 0;
const posts: Array<Record<string, unknown>> = [];

function ok(payload: unknown, config: any) {
	return { data: payload, status: 200, statusText: 'OK', headers: {}, config };
}

function installCaptureAdapter() {
	getCount = 0;
	posts.length = 0;
	originalAdapter = apiClient.defaults.adapter;
	apiClient.defaults.adapter = (async (config: any) => {
		const url = String(config.url || '');
		const method = String(config.method || 'get').toLowerCase();
		if (url === DC_URL) {
			if (method === 'get') {
				getCount += 1;
				return ok({ code: 0, message: 'success', data: RAW_DC, timestamp: UPDATED_AT }, config);
			}
			let body: Record<string, unknown> = {};
			if (typeof config.data === 'string') body = JSON.parse(config.data);
			else if (config.data && typeof config.data === 'object') body = config.data;
			posts.push(body);
			return ok({ code: 0, message: 'success', data: RAW_DC, timestamp: UPDATED_AT }, config);
		}
		return ok({ code: 0, message: 'success', data: {}, timestamp: UPDATED_AT }, config);
	}) as any;
	// A-125 反证探针：旧实现 window.location.reload() 在 jsdom（Location 属性 unforgeable、不可挂桩）
	// 中不产生新 GET —— getCount 计数即可判红，无需 reload 桩。
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
				<DataClassificationPage />
			</MemoryRouter>
		</QueryClientProvider>,
	);
}

async function dataGate() {
	await waitFor(() => {
		const el = document.querySelector('#public_label') as HTMLInputElement | null;
		expect(el).toBeTruthy();
		expect(el!.value).toBe('公开数据');
	});
}

describe('数据分类页（A-124/A-125）', () => {
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
		'AC-B5-W1c-08/09：description/color 回读 + updated_at 展示 + 保存保留非 4 级存量条目（旧全量覆写 → 必红）',
		{ timeout: 20000 },
		async () => {
			renderPage();
			await dataGate();

			// A-124 回读：label/description/color 三字段（旧仅读 label → description/color 必红）
			expect((document.querySelector('#public_description') as HTMLInputElement).value).toBe(
				'公开可见',
			);
			expect((document.querySelector('#public_color') as HTMLInputElement).value).toBe('#52C41A');

			// A-125：updated_at 展示（响应含该字段而旧界面零处展示）
			const updated = await screen.findByText(/最近更新/);
			expect(updated.textContent).toContain(new Date(UPDATED_AT).toLocaleString());

			// A-124 保存：非 4 级存量条目（critical/关键数据）原样保留
			fireEvent.click(screen.getByRole('button', { name: /保存配置/ }));
			await waitFor(() => expect(posts.length).toBe(1));
			const classifications = posts[0].classifications as Array<Record<string, unknown>>;
			expect(classifications).toHaveLength(5);
			expect(classifications).toEqual(
				expect.arrayContaining([
					{
						level: 'public',
						label: '公开数据',
						description: '公开可见',
						color: '#52C41A',
					},
					{ level: 'critical', label: '关键数据', description: '他面定制条目', color: 'purple' },
				]),
			);
		},
	);

	it('AC-B5-W1c-09：刷新走局部 refetch（发第二次 GET；旧整页 reload 不产生请求 → 必红）', { timeout: 20000 }, async () => {
		renderPage();
		await dataGate();
		expect(getCount).toBe(1);

		fireEvent.click(screen.getByRole('button', { name: /刷新/ }));

		await waitFor(() => expect(getCount).toBe(2));
	});
});
