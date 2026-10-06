// TASK-AB2-26（fix-admin-b2-security-forensics / A-234 · AC-B2-045/046/047）：擦除请求 Tab 契约锁。
//
// A-234（RC-B2-12）根因双错：① `api.generated.ts` 把 `executeErasure` 错映射到**创建端点**
//   `adminComplianceGdprRightToErasurePost`（POST /right-to-erasure）而非真执行端点
//   `POST /right-to-erasure/{erasure_id}/execute`（后端 router.go:95/96/224/232 已核）；
//   ② DSAR 行「执行删除」把 DSAR id 字符串当 body 发创建端点（CreateErasureRequest binding 必 400）。
//   修（ADR-B2-06）：新增「擦除请求」Tab（list/create/execute 全链）+ DSAR 行改「发起擦除」预填；
//   DSAR 行请求人列 dataIndex 由不存在的 requesterEmail 归位 userId（wire 键 user_id，F-AB2-26-a）。
//
// 反假绿：
//   ① wire 断言穿真实链路（page → use-compliance → api.generated 映射 → 拦截器 → adapter），
//      不 mock hooks 模块；execute 必须命中 `{ERASURE_URL}/{erasureId}/execute` 且**零 body**
//      （旧映射 = POST {ERASURE_URL} + body 字符串 → 双断言必红）；
//   ② 负控：Popconfirm 未确认前零 execute 请求 + 零创建请求（旧实现点击即发）；
//   ③ 终态判别：pending 行唯一「执行擦除」；processing/completed 行零按钮（旧页面整个 Tab 不存在 → 红）；
//   ④ 创建 payload 断言（snake 键 user_id / data_categories，穿请求拦截器）+ DSAR 行预填 userId 实测；
//   ⑤ 表单空提交 → 双内联错误 + 零创建请求；
//   ⑥ 错误态/空态分离：列表 500 → 错误文案上屏；正常空列表 → 空态文案上屏且错误文案缺席。

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent, cleanup } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router';
import { apiClient, useAuthStore } from '@autional/shared';
import { message } from '@/lib/antd-app';
import CompliancePage from '../page';

// antd v6 命令式 API 由 AntdAppProvider 的 StaticsBridge 赋值（export let），测试不经 Provider 时为
// undefined——成功路径的 message 会炸在 undefined 上（生产由路由层 Provider 保证）。按仓内既有模式桩化。
vi.mock('@/lib/antd-app', () => ({
	message: { success: vi.fn(), error: vi.fn() },
	modal: { confirm: vi.fn() },
}));

const ERASURE_URL = '/compliance/api/v1/admin/compliance/gdpr/right-to-erasure';
const DSAR_URL = '/compliance/api/v1/admin/compliance/gdpr/dsar';
const TS = '2026-10-04T00:00:00Z';

const EMPTY_TEXT = '暂无擦除请求';
const LOAD_ERROR_TEXT = '加载擦除请求失败';

/** wire 形状（snake）擦除列表：pending / processing / completed 三态（后端 dto.go:279-287 键集）。 */
const RAW_ERASURES = [
	{
		id: 'erasure-1',
		user_id: 'usr-1',
		status: 'pending',
		reason: '账户不再使用',
		created_at: '2026-04-15T10:00:00Z',
	},
	{
		id: 'erasure-2',
		user_id: 'usr-2',
		status: 'completed',
		reason: '用户申诉',
		created_at: '2026-04-10T10:00:00Z',
		completed_at: '2026-04-12T10:00:00Z',
	},
	{
		id: 'erasure-3',
		user_id: 'usr-3',
		status: 'processing',
		created_at: '2026-04-14T10:00:00Z',
	},
];

/** wire 形状（snake）DSAR 列表：请求人 = user_id（后端 dsar.go:49 键集，无 requester_email）。 */
const RAW_DSARS = [
	{
		id: 'dsar-1',
		user_id: 'usr-dsar-9',
		type: 'erasure',
		status: 'pending',
		created_at: '2026-04-01T00:00:00Z',
	},
];

interface Captured {
	url: string;
	method: string;
	params: any;
	data: any;
}

let captured: Captured[] = [];
let originalAdapter: unknown;
let erasureListMode: 'ok' | 'empty' | 'fail' = 'ok';

function ok(payload: unknown, config: any) {
	return { data: payload, status: 200, statusText: 'OK', headers: {}, config };
}

function httpError(status: number, config: any) {
	const err: any = new Error('');
	err.response = { status, data: { code: `${status}00000` }, headers: {}, config };
	err.config = config;
	return err;
}

function installCaptureAdapter() {
	captured = [];
	erasureListMode = 'ok';
	originalAdapter = apiClient.defaults.adapter;
	apiClient.defaults.adapter = (async (config: any) => {
		const url = String(config.url || '');
		const method = String(config.method || 'get').toLowerCase();
		captured.push({ url, method, params: config.params, data: config.data });

		if (url === ERASURE_URL && method === 'get') {
			if (erasureListMode === 'fail') throw httpError(500, config);
			const items = erasureListMode === 'empty' ? [] : RAW_ERASURES;
			return ok({ code: 0, message: 'success', items, total: items.length, timestamp: TS }, config);
		}
		if (url === DSAR_URL && method === 'get') {
			return ok(
				{ code: 0, message: 'success', items: RAW_DSARS, total: RAW_DSARS.length, timestamp: TS },
				config,
			);
		}
		if (method === 'post' && url.startsWith(`${ERASURE_URL}/`) && url.endsWith('/execute')) {
			return ok({ code: 0, message: 'erasure executed', timestamp: TS }, config);
		}
		if (url === ERASURE_URL && method === 'post') {
			return ok(
				{
					code: 0,
					message: 'success',
					data: { id: 'erasure-9', user_id: 'usr-x', status: 'pending', created_at: TS },
					timestamp: TS,
				},
				config,
			);
		}
		return ok({ code: 0, message: 'success', data: {}, timestamp: TS }, config);
	}) as any;
}

function executePosts() {
	return captured.filter((c) => c.method === 'post' && /\/execute$/.test(c.url));
}

function createPosts() {
	return captured.filter((c) => c.method === 'post' && c.url === ERASURE_URL);
}

// 本测试穿真实 wire（拦截器链路）：种 token 会触发请求拦截器的「预判式 Token 刷新」
// （isTokenExpired('test-token') → refresh 失败 → onUnauthorized 清 store → 角色门假阴性）。
// 按 audit-logs-forensics-contract 既有模式：只种租户/角色，不种 token。
function seedSession(role: string): void {
	useAuthStore.setState({
		user: { id: 'u-1', username: 'tester' } as never,
		accessToken: null,
		refreshToken: null,
		tenants: [{ id: 'tenant-a', name: 'Tenant A', role }],
		currentTenantId: 'tenant-a',
		permissions: ['compliance:read'],
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
				<CompliancePage />
			</MemoryRouter>
		</QueryClientProvider>,
	);
}

async function switchTab(label: string) {
	fireEvent.click(await screen.findByText(label));
}

/** Popconfirm / Modal 的确定按钮：antd 默认 en（OK）；Popconfirm okText=「确认」两汉字 → 自动插空格。 */
async function clickConfirmButton(re: RegExp) {
	const btn = await waitFor(() => {
		const el = Array.from(document.querySelectorAll('button')).find((b) =>
			re.test((b.textContent || '').trim()),
		);
		expect(el).toBeTruthy();
		return el as HTMLElement;
	});
	fireEvent.click(btn);
}

describe('擦除请求 Tab 契约（A-234 · AC-B2-045/046/047）', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		resetAuthStore();
		seedSession('admin');
		installCaptureAdapter();
	});

	afterEach(() => {
		cleanup();
		apiClient.defaults.adapter = originalAdapter as any;
		resetAuthStore();
	});

	it(
		'AC-B2-045：pending 行「执行擦除」经确认后命中 {erasureId}/execute（路径参数、零 body；旧映射→创建端点必红）',
		{ timeout: 20000 },
		async () => {
			renderPage();
			await switchTab('擦除请求');

			// 列表三态上屏（snake wire → camel 渲染 = 解包 + camelCase 整链实证）
			expect(await screen.findByText('usr-1')).toBeTruthy();
			expect(screen.getByText('usr-2')).toBeTruthy();

			// 终态判别：仅 pending 行有「执行擦除」；processing/completed 行零按钮
			expect(screen.getAllByText('执行擦除')).toHaveLength(1);
			expect(screen.getByText('completed')).toBeTruthy();
			expect(screen.getByText('2026-04-12T10:00:00Z')).toBeTruthy(); // completedAt 终态时间

			fireEvent.click(screen.getByText('执行擦除'));
			expect(await screen.findByText('确认执行擦除')).toBeTruthy(); // 弹层确已打开

			// 负控：确认前零 execute / 零创建请求
			expect(executePosts()).toHaveLength(0);
			expect(createPosts()).toHaveLength(0);

			await clickConfirmButton(/^确\s*认$/);

			await waitFor(() => expect(executePosts()).toHaveLength(1));
			const post = executePosts()[0];
			// 真执行端点 + erasureId 在路径（旧映射：POST {ERASURE_URL} + body 字符串 → 双断言必红）
			expect(post.url).toBe(`${ERASURE_URL}/erasure-1/execute`);
			// 零 body：id 不是请求体（CreateErasureRequest binding 对字符串体必 400）
			expect(post.data).toBeUndefined();
			expect(createPosts()).toHaveLength(0);

			await waitFor(() => expect(vi.mocked(message.success)).toHaveBeenCalled());
		},
	);

	it(
		'AC-B2-047：DSAR 行「发起擦除」预填 userId；创建 payload（snake 键）实测；零 execute 请求',
		{ timeout: 20000 },
		async () => {
			renderPage();
			await switchTab('GDPR DSAR');

			expect(await screen.findByText('usr-dsar-9')).toBeTruthy(); // 请求人列 = wire user_id
			fireEvent.click(screen.getByText('发起擦除'));

			// 预填实证：userId 输入框显示 DSAR 行 userId
			expect(await screen.findByDisplayValue('usr-dsar-9')).toBeTruthy();

			// 数据类别（Select tags）：开面板 → 点选 profile 选项
			const catInput = document.querySelector('#dataCategories') as HTMLElement;
			expect(catInput).toBeTruthy();
			fireEvent.mouseDown(catInput.closest('.ant-select-content')!);
			const option = await waitFor(() => {
				const el = document.querySelector('.ant-select-item-option[title="profile"]');
				expect(el).toBeTruthy();
				return el as HTMLElement;
			});
			fireEvent.click(option);

			await clickConfirmButton(/^(OK|确\s*定|确定)$/);

			await waitFor(() => expect(createPosts()).toHaveLength(1));
			const post = createPosts()[0];
			const body = JSON.parse(post.data);
			// 请求拦截器 camel→snake：userId → user_id；dataCategories → data_categories（后端 binding 必填）
			expect(body.user_id).toBe('usr-dsar-9');
			expect(body.data_categories).toEqual(['profile']);

			// 负控 + 成功链路
			expect(executePosts()).toHaveLength(0);
			await waitFor(() => expect(vi.mocked(message.success)).toHaveBeenCalled());
		},
	);

	it(
		'AC-B2-045/046：空表单提交 → 双内联必填错误 + 零创建请求（校验门先行）',
		{ timeout: 20000 },
		async () => {
			renderPage();
			await switchTab('擦除请求');

			fireEvent.click(await screen.findByText('新建擦除请求'));
			expect(await waitFor(() => document.querySelector('#userId'))).toBeTruthy();

			await clickConfirmButton(/^(OK|确\s*定|确定)$/);

			expect(await screen.findByText('请输入用户ID')).toBeTruthy();
			expect(screen.getByText('请至少选择一个数据类别')).toBeTruthy();
			expect(createPosts()).toHaveLength(0);
			expect(executePosts()).toHaveLength(0);
		},
	);

	it(
		'AC-B2-046：错误态/空态分离——500 → 错误文案上屏；正常空列表 → 空态文案上屏且错误文案缺席',
		{ timeout: 20000 },
		async () => {
			erasureListMode = 'empty';
			renderPage();
			await switchTab('擦除请求');
			expect(await screen.findByText(EMPTY_TEXT)).toBeTruthy();
			expect(screen.queryByText(LOAD_ERROR_TEXT)).toBeNull();

			cleanup();
			erasureListMode = 'fail';
			renderPage();
			await switchTab('擦除请求');
			expect(await screen.findByText(LOAD_ERROR_TEXT)).toBeTruthy();
		},
	);
});
