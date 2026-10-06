// TASK-AB2-31（fix-admin-b2-security-forensics / A-265f + A-268f · AC-B2-059/060）：未成年人页错误态契约锁。
//
// A-265f（RC-B2-14 P1 家族）：loadConfig 空 catch（page:119-121）——配置加载失败被静默吞掉，
//   页面照常渲染空表单 + 统计卡 0/「关闭」（失败被伪装成「租户未配置」）。
// A-268f（RC-B2-14 P2）：loadConsents 空 catch（page:149-151）——403（网关漏声明，TASK-AB2-32
//   已在 repo 侧收口）被伪装成「暂无数据」空表，管理员看不到任何错误提示。
// W0-04（TASK-AB2-04 后端已落地）：空更新显式 422 empty_update——前端必须承接为可读错误，
//   不再 200 假成功（旧链路空表单 PUT {} → 静默 no-op → toast「保存成功」）。
//
// 反假绿：
//   ① 旧代码 config 500 → 无任何错误文案（空表单照常渲染）→ 本测试专用文案断言必红；
//   ② 旧代码 consents 403 → 空表 + 无错误文案 → 本测试专用文案 + 表格缺席断言必红；
//   ③ 保存被 422 empty_update 拒绝 → message.error 收到专用中文文案（旧代码走 handleApiError
//      收英文 title "Validation Failed"）→ 必红；success 未调（假成功反向锁）；
//   ④ 负控：consents 500 → 通用失败文案（证明 403 分支未劫持全部失败）；保存 500 → 回落文案；
//   ⑤ 重试链路：config 失败 → 点「重试」→ 二次请求 → 表单恢复（错误态 → 数据态转换实证）。

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent, cleanup, within } from '@testing-library/react';
import { apiClient, useAuthStore } from '@autional/shared';
import { message } from '@/lib/antd-app';
import MinorsProtectionPage from '../page';

// antd v6 命令式 API 由 AntdAppProvider 的 StaticsBridge 赋值（export let），测试不经 Provider 时
// 为 undefined——错误路径 message.error 会炸在 undefined 上而吞掉断言（生产由路由层 Provider 保证）。
// 按仓内既有模式桩化（audit-logs/anomalies/compliance 同款），使错误分支可被真实驱动。
vi.mock('@/lib/antd-app', () => ({
	message: { success: vi.fn(), error: vi.fn() },
	modal: { confirm: vi.fn() },
}));

const TENANT = 'tenant-b2m';
const CONFIG_URL = `/tenant/api/v1/admin/tenants/${TENANT}/minors-protection`;
const CONSENTS_URL = '/identity/api/v1/admin/consents';

const CONFIG_ERROR_TEXT = '加载未成年人保护配置失败';
const CONSENTS_FORBIDDEN_TEXT = '访问被拒绝：家长同意记录不可用（权限不足或管理面配置缺失）';
const CONSENTS_FAILED_TEXT = '加载家长同意记录失败';
const SAVE_EMPTY_TEXT = '请至少修改一项配置后再保存';
const SAVE_FAILED_TEXT = '保存配置失败';

/** 后端 house 422 校验 Problem 真形（service-core BuildValidationProblem + dto.go:168 Custom）。 */
const EMPTY_UPDATE_PROBLEM = {
	title: 'Validation Failed',
	status: 422,
	detail: "Field 'request': at least one field must be provided for update",
	errors: [
		{
			field: 'request',
			description: 'at least one field must be provided for update',
			code: 'empty_update',
		},
	],
};

/** wire 形状（snake）配置夹具（service-tenant MinorsProtectionConfigResponse，经拦截器 camel 化）。 */
const RAW_CONFIG = {
	tenant_id: TENANT,
	daily_usage_limit_min: 60,
	night_mode_start: '22:00',
	night_mode_end: '06:00',
	night_mode_enabled: true,
	monthly_spend_limit: 10000,
	live_stream_blocked_under16: true,
	content_filter_enabled: true,
	child_default_max_privacy: true,
	minor_data_retention_days: 365,
};

const RAW_CONSENT = {
	id: 'consent-b2-01',
	user_id: 'user-b2-minor',
	parent_email: 'parent@example.com',
	parent_phone: '13800000000',
	status: 'verified',
	verified: true,
	method: 'email',
	recorded_at: '2026-10-01T10:00:00Z',
};

interface Captured {
	url: string;
	method: string;
	params: any;
	data: any;
}

let captured: Captured[] = [];
let originalAdapter: unknown;
let failConfigStatus: number | null = null;
let failConsentsStatus: number | null = null;
let failSaveStatus: number | null = null;

/** axios 形状的 HTTP 错误（穿响应拦截器：非 401/404 → 原样 reject）。 */
function httpError(status: number, config: any, data?: unknown) {
	const err: any = new Error('');
	err.response = { status, data: data ?? { code: `${status}00000` }, headers: {}, config };
	err.config = config;
	return err;
}

function ok(payload: unknown, config: any) {
	return { data: payload, status: 200, statusText: 'OK', headers: {}, config };
}

function installCaptureAdapter() {
	captured = [];
	failConfigStatus = null;
	failConsentsStatus = null;
	failSaveStatus = null;
	originalAdapter = apiClient.defaults.adapter;
	apiClient.defaults.adapter = (async (config: any) => {
		const url = String(config.url || '');
		const method = String(config.method || 'get').toLowerCase();
		captured.push({ url, method, params: config.params, data: config.data });
		const ts = '2026-10-04T00:00:00Z';

		if (url.endsWith('/minors-protection')) {
			if (method === 'put') {
				if (failSaveStatus) {
					throw httpError(
						failSaveStatus,
						config,
						failSaveStatus === 422 ? EMPTY_UPDATE_PROBLEM : { code: '50000000' },
					);
				}
				return ok({ code: 0, message: 'success', data: RAW_CONFIG, timestamp: ts }, config);
			}
			if (failConfigStatus) throw httpError(failConfigStatus, config);
			return ok({ code: 0, message: 'success', data: RAW_CONFIG, timestamp: ts }, config);
		}

		if (url === CONSENTS_URL) {
			if (failConsentsStatus) throw httpError(failConsentsStatus, config);
			return ok(
				{ code: 0, message: 'success', items: [RAW_CONSENT], total: 1, timestamp: ts },
				config,
			);
		}

		return ok({ code: 0, message: 'success', items: [], total: 0, timestamp: ts }, config);
	}) as any;
}

function configCalls() {
	return captured.filter((c) => c.url === CONFIG_URL && c.method === 'get');
}

function consentsCalls() {
	return captured.filter((c) => c.url === CONSENTS_URL && c.method === 'get');
}

function savePuts() {
	return captured.filter((c) => c.url === CONFIG_URL && c.method === 'put');
}

function decode(data: any): any {
	return data ? JSON.parse(data) : undefined;
}

/** antd v6 Tabs：pane 为 role=tabpanel + aria-hidden={!active}（隐藏 pane 恒挂载，须作用域收窄）。 */
function activePane(): HTMLElement {
	return document.querySelector('[role="tabpanel"][aria-hidden="false"]') as HTMLElement;
}

// 本测试穿真实 wire（拦截器链路）：种 token 会触发请求拦截器「预判式 Token 刷新」假阴性。
// 按既有模式：只种租户/角色，不种 token。
function seedSession(): void {
	useAuthStore.setState({
		user: { id: 'u-1', username: 'tester' } as never,
		accessToken: null,
		refreshToken: null,
		tenants: [{ id: TENANT, name: 'Tenant B2M', role: 'admin' }],
		currentTenantId: TENANT,
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
	return render(<MinorsProtectionPage />);
}

/** 数据态门：配置加载成功 → 防沉迷区渲染（超时放宽：collect 量大机器负载）。 */
async function waitConfigLoaded() {
	await screen.findByText('防沉迷与宵禁', undefined, { timeout: 20000 });
}

describe('未成年人页错误态（A-265f/A-268f · AC-B2-059/060）', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		resetAuthStore();
		seedSession();
		installCaptureAdapter();
	});

	afterEach(() => {
		cleanup();
		apiClient.defaults.adapter = originalAdapter as any;
		resetAuthStore();
	});

	it(
		'AC-B2-059：loadConfig 失败 → 错误态可见（旧代码静默空表单 → 必红）；重试 → 数据态',
		{ timeout: 20000 },
		async () => {
			failConfigStatus = 500;
			renderPage();

			// 错误态：专用文案上屏（旧代码静默兜默认 → 无此文案 → 必红）
			expect(await screen.findByText(CONFIG_ERROR_TEXT)).toBeInTheDocument();
			// 旧代码：空表单 + 保存按钮照常渲染（失败伪装成「未配置」）→ 以下缺席断言必红
			expect(screen.queryByText('保存配置')).toBeNull();
			expect(screen.queryByText('防沉迷与宵禁')).toBeNull();
			// 统计卡不呈现伪 0 值（config 不可知，不得伪装「0 分钟/关闭」）
			expect(screen.queryByText('每日时长限制')).toBeNull();

			// 重试：二次请求 → 成功 → 表单恢复（错误态 → 数据态转换实证）
			failConfigStatus = null;
			fireEvent.click(screen.getByRole('button', { name: /^重\s*试$/ }));
			await waitConfigLoaded();
			expect(screen.getByText('保存配置')).toBeInTheDocument();
			expect(configCalls().length).toBe(2);
		},
	);

	it(
		'AC-B2-060：consents 403 → 专用错误提示（≠「暂无数据」空表）（旧代码静默空表 → 必红）',
		{ timeout: 20000 },
		async () => {
			failConsentsStatus = 403;
			renderPage();
			await waitConfigLoaded();

			fireEvent.click(screen.getByText('家长同意管理'));

			// 403 专用文案（旧代码静默 → 必红）
			expect(await screen.findByText(CONSENTS_FORBIDDEN_TEXT)).toBeInTheDocument();
			// 激活 pane 内：表格（空态载体）整体缺席（错误态 ≠ 空态）
			const pane = activePane();
			expect(pane).toBeTruthy();
			expect(pane.querySelector('.ant-table')).toBeNull();
			expect(within(pane).queryByText(CONSENTS_FAILED_TEXT)).toBeNull();
			expect(consentsCalls().length).toBe(1);
		},
	);

	it(
		'负控：consents 500 → 通用失败文案（403 专用文案缺席；防 403 分支劫持全部失败）',
		{ timeout: 20000 },
		async () => {
			failConsentsStatus = 500;
			renderPage();
			await waitConfigLoaded();

			fireEvent.click(screen.getByText('家长同意管理'));

			expect(await screen.findByText(CONSENTS_FAILED_TEXT)).toBeInTheDocument();
			expect(screen.queryByText(CONSENTS_FORBIDDEN_TEXT)).toBeNull();
		},
	);

	it(
		'AC-B2-060：保存被后端 422 empty_update 拒绝 → 专用可读错误（旧代码英文 title → 必红）；success 未调',
		{ timeout: 20000 },
		async () => {
			failSaveStatus = 422;
			renderPage();
			await waitConfigLoaded();

			fireEvent.click(screen.getByText('保存配置'));

			await waitFor(() => expect(message.error).toHaveBeenCalledWith(SAVE_EMPTY_TEXT));
			// 假成功反向锁：不得出现「更新成功」toast
			expect(message.success).not.toHaveBeenCalled();
			// wire 实证：PUT 已到配置端点（422 是真实链路响应而非前端预判短路）
			const puts = savePuts();
			expect(puts).toHaveLength(1);
			expect(decode(puts[0].data)?.daily_usage_limit_min).toBe(60);
		},
	);

	it(
		'负控：保存 500 → 走 handleApiError 回落文案（empty_update 分支未劫持其它失败）',
		{ timeout: 20000 },
		async () => {
			failSaveStatus = 500;
			renderPage();
			await waitConfigLoaded();

			fireEvent.click(screen.getByText('保存配置'));

			await waitFor(() => expect(message.error).toHaveBeenCalledWith(SAVE_FAILED_TEXT));
			expect(message.error).not.toHaveBeenCalledWith(SAVE_EMPTY_TEXT);
			expect(message.success).not.toHaveBeenCalled();
		},
	);
});
