// W1c（A-114 · A-115）：认证配置页回归锁 ——
//   A-114：成员加入方式（membership_approval）回显核定（组件级）——前端读写双路径就绪性证明：
//          响应携带该键时 Radio 回读命中（分支①），且保存 payload 齐发（写入路径已具备）；
//          后端响应 DTO 缺口 = 运行时实形观察（不含该键 → 全空）另录。
//   A-115：maxLength UI 上限 256→128 三层同源（UpdateAuthConfigRequest.Validate max_length ≤128）
// 并入 A-119（含 A-109）回显键映射：requireUpper/requireLower → requireUppercase/requireLowercase、
//   passwordTransmission → transmissionMethod（旧实现四组键错配 → 已启用项呈未启用）。
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent, cleanup, configure } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router';
import { apiClient, useAuthStore } from '@autional/shared';
import { message } from '@/lib/antd-app';
import AuthConfigPage from '../auth-config/page';

vi.mock('@/lib/antd-app', () => ({
	message: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

// W1c 全量并发加固：78 文件并跑满载时首用例表单回填可超 waitFor 默认 1s 预算
// （全量门实测：password-policy 首用例 value='' 超时；隔离跑 3/3 绿）。
configure({ asyncUtilTimeout: 15000 });

const TENANT = 'tenant-w1c-authcfg';
const CONFIG_URL = '/identity/api/v1/admin/security/auth-config';
const TS = '2026-10-06T00:00:00Z';

/** wire 形状（snake）认证配置（identity dto/policy.go require_upper/require_lower/password_transmission 等）。 */
function rawConfig(withMembership: boolean): Record<string, unknown> {
	const cfg: Record<string, unknown> = {
		require_upper: true,
		require_lower: false,
		require_digit: true,
		require_special: false,
		min_length: 10,
		max_length: 128,
		password_transmission: 'hash',
		check_breached_passwords: true,
	};
	if (withMembership) cfg.membership_approval = 'approval_required';
	return cfg;
}

let originalAdapter: unknown;
let withMembership = true;
const puts: Array<Record<string, unknown>> = [];

function ok(payload: unknown, config: any) {
	return { data: payload, status: 200, statusText: 'OK', headers: {}, config };
}

function installCaptureAdapter() {
	puts.length = 0;
	originalAdapter = apiClient.defaults.adapter;
	apiClient.defaults.adapter = (async (config: any) => {
		const url = String(config.url || '');
		const method = String(config.method || 'get').toLowerCase();
		if (url.includes('/security/auth-config')) {
			if (method === 'put') {
				let body: Record<string, unknown> = {};
				if (typeof config.data === 'string') body = JSON.parse(config.data);
				else if (config.data && typeof config.data === 'object') body = config.data;
				puts.push(body);
			}
			return ok(
				{ code: 0, message: 'success', data: rawConfig(withMembership), timestamp: TS },
				config,
			);
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
				<AuthConfigPage />
			</MemoryRouter>
		</QueryClientProvider>,
	);
}

async function dataGate() {
	await waitFor(() => {
		const el = document.querySelector('#minLength') as HTMLInputElement | null;
		expect(el).toBeTruthy();
		expect(el!.value).toBe('10');
	});
}

describe('认证配置页（A-114/A-115，并入 A-119 映射）', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		withMembership = true;
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
		'AC-B5-W1c-11/12：membership_approval 回读命中 + 保存 payload 齐发；requireUpper/transmission 映射生效',
		{ timeout: 20000 },
		async () => {
			renderPage();
			await dataGate();

			// A-114 分支①：响应携带 membership_approval → Radio 回读（前端就绪证明）
			expect((screen.getByRole('radio', { name: /需要审批/ }) as HTMLInputElement).checked).toBe(
				true,
			);

			// A-119 映射：requireUpper → requireUppercase（旧未映射 → 未勾 → 必红）
			expect(
				(screen.getByRole('checkbox', { name: '必须包含大写字母' }) as HTMLInputElement).checked,
			).toBe(true);
			// A-119 映射：passwordTransmission → transmissionMethod（旧未映射 → Select 空白 → 必红）
			expect(await screen.findByText('SHA-256 哈希')).toBeTruthy();

			// A-114 写入路径：保存 payload 齐发 membership_approval
			fireEvent.click(screen.getByRole('button', { name: /保存/ }));
			await waitFor(() => expect(puts.length).toBeGreaterThan(0));
			expect(puts[0]).toMatchObject({
				membership_approval: 'approval_required',
				require_upper: true,
				password_transmission: 'hash',
				max_length: 128,
			});
			await waitFor(() => expect(message.success).toHaveBeenCalled());
		},
	);

	it('AC-B5-W1c-12：maxLength UI 上限 128 三层同源（旧 UI 256 → aria-valuemax=256 必红）', { timeout: 20000 }, async () => {
		renderPage();
		await dataGate();

		const maxInput = document.querySelector('#maxLength') as HTMLInputElement;
		expect(maxInput).toBeTruthy();
		expect(maxInput.getAttribute('aria-valuemax')).toBe('128');
		const minInput = document.querySelector('#minLength') as HTMLInputElement;
		expect(minInput.getAttribute('aria-valuemax')).toBe('128');
	});

	it('A-114 实形观察：响应不含 membership_approval 时三态 Radio 全空（后端 DTO 缺口运行时实证）', { timeout: 20000 }, async () => {
		withMembership = false;
		renderPage();
		await dataGate();

		const radios = screen.getAllByRole('radio') as HTMLInputElement[];
		expect(radios.length).toBe(3);
		expect(radios.every((r) => !r.checked)).toBe(true);
	});
});
