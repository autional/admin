// TASK-AB2-27（fix-admin-b2-security-forensics / A-235 + A-241 · AC-B2-048/049/050）：留存三面契约锁。
//
// A-235（RC-B2-12）：旧创建表单发 name/resourceType/retentionDays/actionAfterExpiry，而
//   CreateRetentionPolicyRequest binding 必填 name*/data_type*/retention_period_days*/purpose*/legal_basis*
//   （dto.go:431-438）——resource_type/retention_days/action_after_expiry 后端无对应键 ⇒ 填满表单必 400。
// A-241：旧编辑走 record.id（wire 无 id，恒 undefined → PUT /undefined）且三键 resourceType/retentionDays/
//   actionAfterExpiry 在 Update DTO 无对应 → Go 静默忽略 → toast「更新成功」而参数未变。
// 修：三面（创建/列表/编辑）全部对齐 wire 真键——policy_id/data_type/retention_period_days/purpose/
//   legal_basis/status（dto.go:411-418）；rowKey=policyId；编辑 PUT 路径参数 policyId。
//
// 反假绿：
//   ① wire 断言穿真实链路（page → use-compliance → generated → 拦截器 → adapter），不 mock hooks 模块；
//      创建 POST body 键集必须全等 DTO 键集（旧表单键 → 必红）；retention_period_days 必须 JSON number
//      （字符串 '365' → Go int32 binding 必 400——防 Input type=number 出字符串同型回归）；
//   ② 编辑 PUT 命中 `{RETENTION_URL}/{policyId}` 路径参数（旧 record.id=undefined → 路径 /undefined 必红）；
//      body 键集 == [data_type,legal_basis,purpose,retention_period_days]——name/auto_delete 未触碰不提交
//      （列表 wire 不返回 name/auto_delete，无回显源，盲提交会静默覆写）；
//   ③ 列表列键正确：snake wire 经 camel 渲染上屏（policyId/dataType/retentionPeriodDays/purpose/
//      legalBasis/status），零 'undefined' 文本（旧列 resourceType/retentionDays/actionAfterExpiry 恒空必红）；
//   ④ 空表单提交 → 内联必填错误 + 零 POST（校验门先行）；
//   ⑤ 创建成功后列表失效重取（GET 计数 +1 = 「创建后刷新列表」）。

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent, cleanup } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router';
import { apiClient, useAuthStore } from '@autional/shared';
import { message } from '@/lib/antd-app';
import CompliancePage from '../page';

// antd v6 命令式 API 由 AntdAppProvider 的 StaticsBridge 赋值（export let），测试不经 Provider 时为
// undefined——成功路径的 message 会炸在 undefined 上。按仓内既有模式桩化。
vi.mock('@/lib/antd-app', () => ({
	message: { success: vi.fn(), error: vi.fn() },
	modal: { confirm: vi.fn() },
}));

const RETENTION_URL = '/compliance/api/v1/admin/compliance/retention-policies';
const TS = '2026-10-04T00:00:00Z';

/** wire 形状（snake）留存列表：后端 dto.go:411-418 键集（无 name/id/auto_delete）。 */
const RAW_POLICIES = [
	{
		policy_id: 'ret-1',
		data_type: 'user_activity_logs',
		retention_period_days: 365,
		purpose: '安全审计',
		legal_basis: '合同义务',
		status: 'active',
	},
	{
		policy_id: 'ret-2',
		data_type: 'audit_trails',
		retention_period_days: 730,
		purpose: '法规遵循',
		legal_basis: '法律要求',
		status: 'inactive',
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

function ok(payload: unknown, config: any) {
	return { data: payload, status: 200, statusText: 'OK', headers: {}, config };
}

function installCaptureAdapter() {
	captured = [];
	originalAdapter = apiClient.defaults.adapter;
	apiClient.defaults.adapter = (async (config: any) => {
		const url = String(config.url || '');
		const method = String(config.method || 'get').toLowerCase();
		captured.push({ url, method, params: config.params, data: config.data });

		if (url === RETENTION_URL && method === 'get') {
			return ok(
				{
					code: 0,
					message: 'success',
					items: RAW_POLICIES,
					total: RAW_POLICIES.length,
					timestamp: TS,
				},
				config,
			);
		}
		if (url === RETENTION_URL && method === 'post') {
			return ok(
				{
					code: 0,
					message: 'created',
					data: RAW_POLICIES[0],
					timestamp: TS,
				},
				config,
			);
		}
		if (method === 'put' && url.startsWith(`${RETENTION_URL}/`)) {
			return ok({ code: 0, message: 'success', data: RAW_POLICIES[0], timestamp: TS }, config);
		}
		return ok({ code: 0, message: 'success', data: {}, timestamp: TS }, config);
	}) as any;
}

function createPosts() {
	return captured.filter((c) => c.method === 'post' && c.url === RETENTION_URL);
}

function putPosts() {
	return captured.filter((c) => c.method === 'put' && c.url.startsWith(`${RETENTION_URL}/`));
}

function listGets() {
	return captured.filter((c) => c.method === 'get' && c.url === RETENTION_URL);
}

// 本测试穿真实 wire（拦截器链路）：假 token 会触发请求拦截器的「预判式 Token 刷新」
// （isTokenExpired → refresh 失败 → onUnauthorized 清 store → 角色门假阴性）。
// 按 audit-logs/erasure-tab 既有模式：只种租户/角色，不种 token。
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

/** Modal 确定按钮：antd 默认 en（OK）；Popconfirm okText=「确认」两汉字自动插空格。 */
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

function setInput(id: string, value: string) {
	const el = document.querySelector(id) as HTMLInputElement;
	expect(el).toBeTruthy();
	fireEvent.change(el, { target: { value } });
}

describe('留存三面契约（A-235/A-241 · AC-B2-048/049/050）', () => {
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
		'AC-B2-050：列表列键对齐 wire（policyId/dataType/retentionPeriodDays/purpose/legalBasis/status），零 undefined',
		{ timeout: 20000 },
		async () => {
			renderPage();
			await switchTab('留存策略');

			// 两行全量上屏（snake wire → camel 渲染 = 解包 + camelCase 整链实证）
			expect(await screen.findByText('user_activity_logs')).toBeTruthy();
			expect(screen.getByText('audit_trails')).toBeTruthy();
			expect(screen.getByText('ret-1')).toBeTruthy();
			expect(screen.getByText('ret-2')).toBeTruthy();
			expect(screen.getByText('365')).toBeTruthy();
			expect(screen.getByText('730')).toBeTruthy();
			expect(screen.getByText('安全审计')).toBeTruthy();
			expect(screen.getByText('法规遵循')).toBeTruthy();
			expect(screen.getByText('合同义务')).toBeTruthy();
			expect(screen.getByText('法律要求')).toBeTruthy();
			expect(screen.getByText('active')).toBeTruthy();
			expect(screen.getByText('inactive')).toBeTruthy();

			// 列头对齐（旧列 resourceType/retentionDays/actionAfterExpiry → 必红）；
			// antd Table scroll={{x}} 会渲染隐藏测宽行复制列头文本 → 用 AllBy 变体。
			expect(screen.getAllByText('策略ID').length).toBeGreaterThan(0);
			expect(screen.getAllByText('数据类型').length).toBeGreaterThan(0);
			expect(screen.getAllByText('留存天数').length).toBeGreaterThan(0);
			expect(screen.getAllByText('留存目的').length).toBeGreaterThan(0);
			expect(screen.getAllByText('法律依据').length).toBeGreaterThan(0);

			// 无 undefined 列（键错配的显性判别）
			expect(screen.queryAllByText('undefined')).toHaveLength(0);
		},
	);

	it(
		'AC-B2-048：创建 payload 全键（DTO 键集全等）+ retention_period_days 为 JSON number + 创建后列表重取',
		{ timeout: 20000 },
		async () => {
			renderPage();
			await switchTab('留存策略');
			expect(await screen.findByText('user_activity_logs')).toBeTruthy();

			fireEvent.click(await screen.findByText('新建策略'));
			expect(await waitFor(() => document.querySelector('#name'))).toBeTruthy();

			const getsBefore = listGets().length;

			setInput('#name', '用户日志留存策略');
			setInput('#dataType', 'user_activity_logs');
			setInput('#retentionPeriodDays', '365');
			setInput('#purpose', '安全审计');
			setInput('#legalBasis', '合同义务');
			fireEvent.click(document.querySelector('#autoDelete') as HTMLElement);

			await clickConfirmButton(/^(OK|确\s*定|确定)$/);

			await waitFor(() => expect(createPosts()).toHaveLength(1));
			const body = JSON.parse(createPosts()[0].data);
			// 键集全等（拦截器 camel→snake；旧表单 resource_type/retention_days/action_after_expiry → 不等必红）
			expect(Object.keys(body).sort()).toEqual([
				'auto_delete',
				'data_type',
				'legal_basis',
				'name',
				'purpose',
				'retention_period_days',
			]);
			expect(body.name).toBe('用户日志留存策略');
			expect(body.data_type).toBe('user_activity_logs');
			expect(body.purpose).toBe('安全审计');
			expect(body.legal_basis).toBe('合同义务');
			expect(body.auto_delete).toBe(true);
			// number 判别（字符串 '365' → Go int32 binding 必 400）
			expect(typeof body.retention_period_days).toBe('number');
			expect(body.retention_period_days).toBe(365);

			// 创建后刷新列表（invalidate → 重取）
			await waitFor(() => expect(listGets().length).toBeGreaterThan(getsBefore));
			await waitFor(() => expect(vi.mocked(message.success)).toHaveBeenCalled());
		},
	);

	it(
		'AC-B2-048/049：空表单提交 → 内联必填错误 + 零 POST/PUT（校验门先行）',
		{ timeout: 20000 },
		async () => {
			renderPage();
			await switchTab('留存策略');
			expect(await screen.findByText('user_activity_logs')).toBeTruthy();

			fireEvent.click(await screen.findByText('新建策略'));
			expect(await waitFor(() => document.querySelector('#name'))).toBeTruthy();

			await clickConfirmButton(/^(OK|确\s*定|确定)$/);

			expect(await screen.findByText('请输入策略名称')).toBeTruthy();
			expect(screen.getByText('请输入数据类型')).toBeTruthy();
			expect(screen.getByText('请输入留存天数')).toBeTruthy();
			expect(screen.getByText('请输入留存目的')).toBeTruthy();
			expect(screen.getByText('请输入法律依据')).toBeTruthy();
			expect(createPosts()).toHaveLength(0);
			expect(putPosts()).toHaveLength(0);
		},
	);

	it(
		'AC-B2-049：编辑预填 wire 四键；PUT 命中 {policyId} 路径参数；未触碰键不提交（零覆写）',
		{ timeout: 20000 },
		async () => {
			renderPage();
			await switchTab('留存策略');
			expect(await screen.findByText('user_activity_logs')).toBeTruthy();

			fireEvent.click(screen.getAllByText('编辑')[0]);
			expect(await screen.findByDisplayValue('user_activity_logs')).toBeTruthy();

			// 预填完整性（旧表单 setFieldsValue(resourceType/retentionDays...) → 四断言必红）
			expect(screen.getByDisplayValue('365')).toBeTruthy();
			expect(screen.getByDisplayValue('安全审计')).toBeTruthy();
			expect(screen.getByDisplayValue('合同义务')).toBeTruthy();
			// name 无回显源（列表 wire 无 name）→ 编辑态空 + 可选
			expect((document.querySelector('#name') as HTMLInputElement).value).toBe('');

			setInput('#retentionPeriodDays', '400');

			await clickConfirmButton(/^(OK|确\s*定|确定)$/);

			await waitFor(() => expect(putPosts()).toHaveLength(1));
			const put = putPosts()[0];
			// 路径参数 = row policyId（旧 record.id=undefined → /undefined 必红）
			expect(put.url).toBe(`${RETENTION_URL}/ret-1`);
			const body = JSON.parse(put.data);
			// 键集 = 四 wire 键：name/auto_delete 未触碰不提交（列表无回显源，盲提交 = 静默覆写）
			expect(Object.keys(body).sort()).toEqual([
				'data_type',
				'legal_basis',
				'purpose',
				'retention_period_days',
			]);
			expect(body.data_type).toBe('user_activity_logs');
			expect(body.purpose).toBe('安全审计');
			expect(body.legal_basis).toBe('合同义务');
			expect(typeof body.retention_period_days).toBe('number');
			expect(body.retention_period_days).toBe(400);

			expect(createPosts()).toHaveLength(0);
			await waitFor(() => expect(vi.mocked(message.success)).toHaveBeenCalled());
		},
	);
});
