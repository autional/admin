// TASK-AB2-30（fix-admin-b2-security-forensics / A-246 + A-247 + A-251 · AC-B2-053..057）：差距分析页契约锁。
//
// A-246（RC-B2-13 P1）：`handleRunGapAnalysis` 走生成函数 `adminComplianceTenantsSelfGapAnalysisPost()`（无 body）
//   → 有标准时后端 ShouldBindJSON 得 EOF → 400 恒败；无标准时早返回 200 {overall_score:100, parameters:[]}，
//   前端只取 parameters 丢弃 overallScore → 空态→空态静默无操作（契约矛盾见 swagger body 可选 vs 必读，ADR-B2-05 取"恒发"面）。
// A-247：评估基准黑盒（无配置输入口）→ ADR-B2-05 裁定前端输入口（resolvedPolicy 参数名/值预填，可增删改）。
// A-251：差距卡头圆环读 GET /score 安全评分（83/B）而非差距 overall_score → 口径并存。
// 修：恒发 body {parameters}（输入口行，空值=未提供省略键；JSON.parse 尝试，失败按字符串）；
//   gapReport 存全对象 + ring 用 overallScore；删死代码 score/fetchScore；无标准分支语义诚实（说明文案 + 空 parameters）。
//
// 反假绿：
//   ① wire 断言穿真实链路（page → apiClient → 拦截器 → adapter）：POST body 全等（旧代码无 body → data undefined 必红）；
//   ② ring aria-valuenow = 差距 overall_score 75（旧代码 fetchScore=83 → 必红）；
//   ③ 输入口预填 camel 形状键（拦截器深 camel）+ 改/增/删 → payload 反映编辑（旧代码无输入口 → 必红）；
//   ④ 无标准分支：说明文案上屏 + ring 100 + 旧空态提示退场（旧代码空态恒在 → 必红）；
//   ⑤ 单一口径：GET /score 零调用（旧代码 mount 即调 → 必红）+ 单圆环。

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent, cleanup } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router';
import { apiClient, useAuthStore } from '@autional/shared';
import CompliancePolicyPage from '../page';

const STANDARDS_URL = '/compliance/api/v1/admin/compliance/standards';
const POLICY_URL = '/compliance/api/v1/admin/compliance/tenants/self/policy';
const GAP_URL = '/compliance/api/v1/admin/compliance/tenants/self/gap-analysis';
const SCORE_URL = '/compliance/api/v1/admin/compliance/tenants/self/score';
const OVERRIDES_URL = '/compliance/api/v1/admin/compliance/tenants/self/overrides';
const TS = '2026-10-04T00:00:00Z';

type Mode = 'standards' | 'nostd';
let mode: Mode = 'standards';

const RAW_STANDARDS = [
	{
		id: 'pci_dss_v4',
		name: 'PCI DSS v4.0.1',
		version: '4.0.1',
		category: 'financial',
		description: 'Payment Card Industry Data Security Standard',
	},
];

/** wire 形状（snake）已解析策略：参数键经响应拦截器深 camel（password_min_length_sfa → passwordMinLengthSfa）。 */
const RAW_POLICY = {
	standards: ['pci_dss_v4'],
	parameters: {
		mfa_required: {
			value: true,
			source: ['pci_dss_v4'],
			merge_rule: 'or',
			overridden: false,
			severity: 'critical',
		},
		password_min_length_sfa: {
			value: 12,
			source: ['pci_dss_v4'],
			merge_rule: 'max',
			overridden: false,
			severity: 'high',
		},
	},
	resolved_at: TS,
	version: 'a1b2c3d4',
};

const RAW_GAP = {
	standards: ['pci_dss_v4'],
	parameters: [
		{
			parameter: 'mfa_required',
			required: true,
			current: true,
			operator: 'eq',
			compliant: true,
			severity: 'critical',
			standard: 'pci_dss_v4',
			control_ref: 'pci_8.4.2',
			description: 'MFA',
		},
		{
			parameter: 'password_min_length_sfa',
			required: 12,
			current: 8,
			operator: 'gte',
			compliant: false,
			severity: 'high',
			standard: 'pci_dss_v4',
			control_ref: 'pci_8.3.6',
			description: 'Min password length',
		},
	],
	overall_score: 75,
	critical_gaps: 0,
	high_gaps: 1,
	medium_gaps: 0,
	low_gaps: 0,
};

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

		if (url === STANDARDS_URL && method === 'get') {
			return ok({ code: 0, message: 'success', data: RAW_STANDARDS, timestamp: TS }, config);
		}
		if (url === POLICY_URL && method === 'get') {
			if (mode === 'nostd') {
				return ok({ code: 0, message: 'no compliance standards selected', timestamp: TS }, config);
			}
			return ok({ code: 0, message: 'success', data: RAW_POLICY, timestamp: TS }, config);
		}
		if (url === GAP_URL && method === 'post') {
			if (mode === 'nostd') {
				return ok(
					{
						code: 0,
						message: 'success',
						data: {
							standards: null,
							parameters: [],
							overall_score: 100,
							critical_gaps: 0,
							high_gaps: 0,
							medium_gaps: 0,
							low_gaps: 0,
						},
						timestamp: TS,
					},
					config,
				);
			}
			return ok({ code: 0, message: 'success', data: RAW_GAP, timestamp: TS }, config);
		}
		if (url === SCORE_URL && method === 'get') {
			return ok(
				{ code: 0, message: 'success', data: { tenant_id: 'tenant-a', overall_score: 83, grade: 'B' }, timestamp: TS },
				config,
			);
		}
		if (url === OVERRIDES_URL && method === 'get') {
			return ok({ code: 0, message: 'success', data: { overrides: [] }, timestamp: TS }, config);
		}
		return ok({ code: 0, message: 'success', data: {}, timestamp: TS }, config);
	}) as any;
}

function gapPosts() {
	return captured.filter((c) => c.method === 'post' && c.url === GAP_URL);
}

function scoreGets() {
	return captured.filter((c) => c.method === 'get' && c.url === SCORE_URL);
}

function decode(data: any): any {
	return data ? JSON.parse(data) : undefined;
}

// 本测试穿真实 wire（拦截器链路）：种 token 会触发请求拦截器「预判式 Token 刷新」假阴性。
// 按既有模式：只种租户/角色，不种 token。
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
				<CompliancePolicyPage />
			</MemoryRouter>
		</QueryClientProvider>,
	);
}

async function switchTab(label: string | RegExp) {
	fireEvent.click(await screen.findByText(label));
}

/** 已加载门：标准列表上屏 → 组合策略透出 camel 参数行（证明 policy GET 已处理 → 输入口预填同批完成）。 */
async function waitPolicyLoaded() {
	await screen.findByText('PCI DSS v4.0.1');
	await switchTab(/组合策略/);
	await screen.findByText('mfaRequired');
}

/** 运行按钮（差距 Tab/标准 Tab 同 handler；取 DOM 末位 = 差距 Tab 输入口按钮）。 */
function clickRunButton() {
	const btns = screen.getAllByText('运行差距分析');
	fireEvent.click(btns[btns.length - 1]);
}

function inputValue(selector: string): string | null {
	const el = document.querySelector(selector) as HTMLInputElement | null;
	return el ? el.value : null;
}

function setInput(selector: string, value: string) {
	const el = document.querySelector(selector) as HTMLInputElement;
	expect(el).toBeTruthy();
	fireEvent.change(el, { target: { value } });
}

describe('差距分析页契约（A-246/A-247/A-251 · AC-B2-053..057）', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mode = 'standards';
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
		'AC-B2-053：有标准分支 POST 恒发 body {parameters=输入口预填}（旧代码无 body → data undefined 必红）',
		{ timeout: 20000 },
		async () => {
			renderPage();
			await waitPolicyLoaded();
			await switchTab('差距分析');
			clickRunButton();

			await waitFor(() => expect(gapPosts()).toHaveLength(1));
			// 拦截器契约：UI camel 键（passwordMinLengthSfa）→ wire snake 键
			expect(decode(gapPosts()[0].data)).toEqual({
				parameters: { mfa_required: true, password_min_length_sfa: 12 },
			});
		},
	);

	it(
		'AC-B2-054：ring 渲染差距 overallScore=75（旧代码读安全评分 83 → 必红）',
		{ timeout: 20000 },
		async () => {
			renderPage();
			await waitPolicyLoaded();
			await switchTab('差距分析');
			clickRunButton();

			await waitFor(() => expect(gapPosts()).toHaveLength(1));
			const ring = await screen.findByRole('progressbar');
			expect(ring.getAttribute('aria-valuenow')).toBe('75');
		},
	);

	it(
		'AC-B2-055：输入口预填（camel 键）可增删改；删除=省略键、新增 JSON 解析 → payload 全等反映编辑',
		{ timeout: 20000 },
		async () => {
			renderPage();
			await waitPolicyLoaded();
			await switchTab('差距分析');

			// 预填门（旧代码无输入口 → 必红）
			await waitFor(() => expect(document.querySelector('#gap-param-1')).toBeTruthy());
			expect(inputValue('#gap-param-0')).toBe('mfaRequired');
			expect(inputValue('#gap-value-0')).toBe('true');
			expect(inputValue('#gap-param-1')).toBe('passwordMinLengthSfa');
			expect(inputValue('#gap-value-1')).toBe('12');

			// 改：12 → 8（JSON 解析为 number）
			setInput('#gap-value-1', '8');
			// 增：JSON 数组值 + 解析失败按字符串（两行）
			fireEvent.click(screen.getByText('添加参数'));
			setInput('#gap-param-2', 'region');
			setInput('#gap-value-2', '["cn","us"]');
			fireEvent.click(screen.getByText('添加参数'));
			setInput('#gap-param-3', 'note');
			setInput('#gap-value-3', 'hello');
			// 删：mfaRequired 行 → payload 省略该键
			fireEvent.click(screen.getAllByText('移除')[0]);
			await waitFor(() => expect(inputValue('#gap-param-0')).toBe('passwordMinLengthSfa'));

			clickRunButton();
			await waitFor(() => expect(gapPosts()).toHaveLength(1));
			expect(decode(gapPosts()[0].data)).toEqual({
				parameters: { password_min_length_sfa: 8, region: ['cn', 'us'], note: 'hello' },
			});
		},
	);

	it(
		'AC-B2-056：无标准分支语义诚实（空基准恒发 body + 说明文案 + ring 100 + 旧空态提示退场）',
		{ timeout: 20000 },
		async () => {
			mode = 'nostd';
			renderPage();
			await screen.findByText('PCI DSS v4.0.1');
			await switchTab('差距分析');

			// 输入口空（无已解析参数）；旧空态提示在跑前可见
			expect(document.querySelector('#gap-param-0')).toBeNull();
			expect(screen.getByText('点击"运行差距分析"按钮查看合规差距')).toBeTruthy();

			clickRunButton();
			await waitFor(() => expect(gapPosts()).toHaveLength(1));
			// 空基准仍恒发 body（诚实语义）
			expect(decode(gapPosts()[0].data)).toEqual({ parameters: {} });

			// 说明文案 + ring 100；旧空态提示退场（旧代码 parameters:[] → 空态恒在 → 必红）
			expect(
				await screen.findByText('当前未选择任何合规标准：输入基准为空，差距评分恒为 100。'),
			).toBeTruthy();
			const ring = screen.getByRole('progressbar');
			expect(ring.getAttribute('aria-valuenow')).toBe('100');
			expect(screen.queryByText('点击"运行差距分析"按钮查看合规差距')).toBeNull();
		},
	);

	it(
		'AC-B2-057：单一口径 —— GET /score 零调用（旧代码 mount 即调 → 必红）+ 单圆环',
		{ timeout: 20000 },
		async () => {
			renderPage();
			await waitPolicyLoaded();
			await switchTab('差距分析');
			clickRunButton();

			await waitFor(() => expect(gapPosts()).toHaveLength(1));
			expect(scoreGets()).toHaveLength(0);
			expect(screen.getAllByRole('progressbar')).toHaveLength(1);
		},
	);
});
