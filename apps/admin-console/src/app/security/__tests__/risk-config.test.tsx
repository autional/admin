// W1c（A-104 · A-105）：风险评分配置页回归锁 ——
//   A-104：重置后表单回显（旧实现仅 setQueryData → 表单停留旧值，随即保存把旧值打回、静默撤销重置）
//   A-105：i18n 全量迁移（signal.* 14 键 + 文案键化）+ message 走封装 + 学习期上限对齐后端 [0,3650]（旧 90）
//          + 具体错误透出（handleApiError 键链，旧仅「保存失败」吞后端 400 校验原因）
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent, cleanup, configure } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router';
import { apiClient } from '@autional/shared';
import { message } from '@/lib/antd-app';
import RiskConfigPage from '../risk-config/page';

vi.mock('@/lib/antd-app', () => ({
	message: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

// W1c 全量并发加固：78 文件并跑满载时首用例表单回填可超 waitFor 默认 1s 预算
// （全量门实测：password-policy 首用例 value='' 超时；隔离跑 3/3 绿）。
configure({ asyncUtilTimeout: 15000 });

const CONFIG_URL = '/identity/api/v1/admin/security/risk-config';
const TS = '2026-10-06T00:00:00Z';

/** wire 形状（snake）风险配置（risk_config_handler.go:26-35 + domain/risk_config.go:31-46）。 */
const RAW_CFG = {
	tenant_id: 'tenant-w1c-risk',
	elevated_threshold: 30,
	moderate_threshold: 50,
	high_threshold: 70,
	critical_threshold: 85,
	signal_weights: {
		ip_unknown: 10,
		ip_bad_reputation: 15,
		ip_vpn: 12,
		login_failure_high: 8,
		login_failure_moderate: 4,
		new_device_or_ip: 6,
		unknown_device: 5,
		unusual_location: 9,
		unusual_time: 3,
		new_country: 7,
		velocity_anomaly: 11,
		credential_leaked: 20,
		mfa_method_changed: 2,
		session_hijack: 18,
	},
	learning_period_days: 14,
	session_risk_enabled: true,
};

/** reset 响应 = 系统默认（学习期 30 → 回显探针值）。 */
const RESET_CFG = { ...RAW_CFG, learning_period_days: 30, elevated_threshold: 25 };

let originalAdapter: unknown;
let failPut = false;
const puts: Array<Record<string, unknown>> = [];
let resetCalls = 0;

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
	puts.length = 0;
	resetCalls = 0;
	originalAdapter = apiClient.defaults.adapter;
	apiClient.defaults.adapter = (async (config: any) => {
		const url = String(config.url || '');
		const method = String(config.method || 'get').toLowerCase();
		if (url.includes('/security/risk-config/reset')) {
			resetCalls += 1;
			return ok({ code: 0, message: 'success', data: RESET_CFG, timestamp: TS }, config);
		}
		if (url.includes('/security/risk-config')) {
			if (method === 'put') {
				if (failPut) {
					throw httpError(400, config, {
						code: '40000200',
						title: 'Validation Failed',
						message: '阈值必须单调递增',
					});
				}
				let body: Record<string, unknown> = {};
				if (typeof config.data === 'string') body = JSON.parse(config.data);
				else if (config.data && typeof config.data === 'object') body = config.data;
				puts.push(body);
				return ok({ code: 0, message: 'success', data: RAW_CFG, timestamp: TS }, config);
			}
			return ok({ code: 0, message: 'success', data: RAW_CFG, timestamp: TS }, config);
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
				<RiskConfigPage />
			</MemoryRouter>
		</QueryClientProvider>,
	);
}

async function dataGate() {
	await waitFor(() => {
		const el = document.querySelector('#learningPeriodDays') as HTMLInputElement | null;
		expect(el).toBeTruthy();
		expect(el!.value).toBe('14');
	});
}

describe('风险评分配置页（A-104/A-105）', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		failPut = false;
		installCaptureAdapter();
	});

	afterEach(() => {
		cleanup();
		apiClient.defaults.adapter = originalAdapter as any;
	});

	it(
		'AC-B5-W1c-10：i18n 键化（14 信号标签 + 阈值卡）+ 嵌套权重回读 + 学习期上限 3650（旧 90 → 必红）',
		{ timeout: 20000 },
		async () => {
			renderPage();
			await dataGate();

			// A-105 i18n：标题/subtitle/卡片/阈值/信号标签全走 t()
			expect(screen.getByText('风险评分配置')).toBeTruthy();
			expect(screen.getByText(/五级风险模型/)).toBeTruthy();
			expect(screen.getByText('L1 提醒阈值')).toBeTruthy();
			expect(screen.getByText('未知 IP (ipUnknown)')).toBeTruthy();
			expect(screen.getByText('会话劫持 (sessionHijack)')).toBeTruthy();

			// 嵌套权重回读（signalWeights.ipUnknown = 10）
			const w = document.querySelector('#signalWeights_ipUnknown') as HTMLInputElement;
			expect(w).toBeTruthy();
			expect(w.value).toBe('10');

			// A-105 边界：学习期上限对齐后端 binding [0,3650]（旧 UI 上限 90 → aria-valuemax=90 必红）
			const learn = document.querySelector('#learningPeriodDays') as HTMLInputElement;
			expect(learn.getAttribute('aria-valuemax')).toBe('3650');
		},
	);

	it('AC-B5-W1c-10：reset 成功后表单回显默认值（旧仅 setQueryData → 表单停留旧值必红）', { timeout: 20000 }, async () => {
		renderPage();
		await dataGate();

		fireEvent.click(screen.getByRole('button', { name: /恢复默认/ }));
		expect(await screen.findByText('恢复系统默认风险配置？')).toBeTruthy();
		const confirmBtn = document.querySelector('.ant-popconfirm .ant-btn-primary') as HTMLElement;
		expect(confirmBtn).toBeTruthy();
		fireEvent.click(confirmBtn);

		await waitFor(() => expect(resetCalls).toBe(1));
		await waitFor(() => {
			expect((document.querySelector('#learningPeriodDays') as HTMLInputElement).value).toBe('30');
		});
		expect((document.querySelector('#elevatedThreshold') as HTMLInputElement).value).toBe('25');
		await waitFor(() => expect(message.success).toHaveBeenCalledWith('已恢复默认配置'));
	});

	it('AC-B5-W1c-10：保存失败透出后端具体校验原因（旧仅「保存失败」→ 必红）', { timeout: 20000 }, async () => {
		failPut = true;
		renderPage();
		await dataGate();

		fireEvent.click(screen.getByRole('button', { name: /保存配置/ }));
		await waitFor(() => expect(message.error).toHaveBeenCalledWith('阈值必须单调递增'));
	});
});
