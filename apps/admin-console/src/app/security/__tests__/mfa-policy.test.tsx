// W1c（A-99 · A-100 · A-101）：MFA 策略页回归锁 ——
//   A-99：GET 失败独立文案（旧复用 mfa.saveFailed「保存失败」→ 误导为保存出错）
//   A-100：mfa_methods / mfa_preferred_methods 双集合回读 + 双字段齐保存（旧实现 preferred 零展示零编辑）
//   A-101：mode=禁用 联动（方式勾选与两个强制 Switch 均置灰 + 禁用提示；重新启用值保留）
// 断言口径 = 最终 wire 请求/响应（axios adapter 末环捕获 + snake 回写，与线上链路同构）。
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent, cleanup, configure } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router';
import { apiClient, useAuthStore } from '@autional/shared';
import MFAPolicyPage from '../mfa/page';

vi.mock('@/lib/antd-app', () => ({
	message: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

// W1c 全量并发加固：78 文件并跑满载时首用例表单回填可超 waitFor 默认 1s 预算
// （全量门实测：password-policy 首用例 value='' 超时；隔离跑 3/3 绿）。
configure({ asyncUtilTimeout: 15000 });

const TENANT = 'tenant-w1c-mfa';
const POLICY_URL = `/tenant/api/v1/admin/tenants/${TENANT}/auth-policy`;
const TS = '2026-10-06T00:00:00Z';

/** wire 形状（snake）认证策略（service-tenant dto.go:437-480；mfa_* 双集合为 JSON 数组字符串）。 */
const RAW_POLICY = {
	mfa_enabled: true,
	mfa_enforce_for_all: false,
	mfa_enforce_for_high_risk: true,
	mfa_enforce_for_new_device: false,
	mfa_methods: '["totp","sms"]',
	mfa_preferred_methods: '["totp"]',
};

let originalAdapter: unknown;
let failGet = false;
const puts: Array<Record<string, unknown>> = [];

function httpError(status: number, config: any) {
	const err: any = new Error(`Request failed with status code ${status}`);
	err.response = { status, data: { code: `${status}00000` }, headers: {}, config };
	err.config = config;
	return err;
}

function ok(payload: unknown, config: any) {
	return { data: payload, status: 200, statusText: 'OK', headers: {}, config };
}

function installCaptureAdapter() {
	puts.length = 0;
	originalAdapter = apiClient.defaults.adapter;
	apiClient.defaults.adapter = (async (config: any) => {
		const url = String(config.url || '');
		const method = String(config.method || 'get').toLowerCase();
		if (url.includes('/auth-policy')) {
			if (method === 'get') {
				if (failGet) throw httpError(500, config);
				return ok({ code: 0, message: 'success', data: RAW_POLICY, timestamp: TS }, config);
			}
			let body: Record<string, unknown> = {};
			if (typeof config.data === 'string') body = JSON.parse(config.data);
			else if (config.data && typeof config.data === 'object') body = config.data;
			puts.push(body);
			return ok({ code: 0, message: 'success', data: RAW_POLICY, timestamp: TS }, config);
		}
		return ok({ code: 0, message: 'success', data: {}, timestamp: TS }, config);
	}) as any;
}

// 按仓内既有模式：只种租户（不种 token —— 拦截器「预判式 Token 刷新」会引入假阴性）。
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
				<MFAPolicyPage />
			</MemoryRouter>
		</QueryClientProvider>,
	);
}

/** 两集合共 10 枚 checkbox：前 5 = 可用方式，后 5 = 首选方式（选项序 totp/sms/email/passkey/recovery_code）。 */
async function fiveByFive(): Promise<HTMLInputElement[]> {
	return waitFor(() => {
		const boxes = screen.getAllByRole('checkbox') as HTMLInputElement[];
		expect(boxes.length).toBe(10);
		return boxes;
	});
}

describe('MFA 策略页（A-99/A-100/A-101）', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		failGet = false;
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
		'AC-B5-W1c-99/100：双集合回读（可用= totp+sms / 首选= totp）+ 保存双字段齐发（preferred 可编辑）',
		{ timeout: 20000 },
		async () => {
			renderPage();
			const boxes = await fiveByFive();

			// A-100 回读：可用方式组
			expect(boxes[0].checked).toBe(true); // totp
			expect(boxes[1].checked).toBe(true); // sms
			expect(boxes[2].checked).toBe(false); // email
			// A-100 回读：首选方式组（旧实现零展示零编辑 → 必红）
			expect(boxes[5].checked).toBe(true); // preferred totp
			expect(boxes[6].checked).toBe(false); // preferred sms

			// 编辑首选：勾上 email（index 7）→ 保存 → wire 双字段齐发
			fireEvent.click(boxes[7]);
			fireEvent.click(screen.getByRole('button', { name: /保存/ }));
			await waitFor(() => expect(puts.length).toBeGreaterThan(0));
			expect(puts[0]).toMatchObject({
				mfa_methods: '["totp","sms"]',
				mfa_preferred_methods: '["totp","email"]',
			});
		},
	);

	it('AC-B5-W1c-101：mode=禁用 → 方式勾选与两枚强制 Switch 置灰 + 禁用提示；改回强制恢复可编辑', { timeout: 20000 }, async () => {
		renderPage();
		const boxes = await fiveByFive();
		expect(boxes[0].disabled).toBe(false);

		fireEvent.click(screen.getByRole('radio', { name: '禁用' }));

		await waitFor(() => {
			expect((screen.getAllByRole('checkbox')[0] as HTMLInputElement).disabled).toBe(true);
		});
		const switches = screen.getAllByRole('switch') as HTMLButtonElement[];
		expect(switches.length).toBe(2);
		expect(switches.every((s) => s.disabled)).toBe(true);
		expect(screen.getByText(/MFA 已禁用/)).toBeTruthy();

		// 重新启用 → 恢复可编辑（值保留：totp/sms 勾选仍在）
		fireEvent.click(screen.getByRole('radio', { name: '强制' }));
		await waitFor(() => {
			expect((screen.getAllByRole('checkbox')[0] as HTMLInputElement).disabled).toBe(false);
		});
		expect((screen.getAllByRole('checkbox')[0] as HTMLInputElement).checked).toBe(true);
	});

	it('AC-B5-W1c-99：GET 失败显示「加载 MFA 策略失败」（非保存失败文案）', { timeout: 20000 }, async () => {
		failGet = true;
		renderPage();

		expect(await screen.findByText('加载 MFA 策略失败')).toBeTruthy();
		// 旧实现复用 mfa.saveFailed → 必红断言：保存失败文案不得出现在加载失败路径
		expect(screen.queryByText('保存失败')).toBeNull();
	});
});
