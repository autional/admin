// TASK-AB2-25（fix-admin-b2-security-forensics / A-226 · AC-B2-044）：报告页双重解包根治。
//
// A-226（RC-B2-08）：rc.21 响应拦截器已解包信封（api/client.ts:81-106：`{code,data}` → res.data =
//   camelCaseKeys(业务payload)），generated 函数再返回 `res.data`（generated/api.ts:568-569）——
//   页面却写 `const { data } = await ...; setSecData(data?.data ?? data)`：此处 `data` 已是业务对象，
//   其 `.data` 键恒 undefined → `?? data` 的 data 也是 undefined → setSecData(undefined)
//   → 成功 toast 照发、报告区恒「空态提示」不下屏（空白假成功）。compliance Tab 同型。
//   修：两生成器改 `setSecData(extractItem(res))` / `setCompData(extractItem(res))`（拦截器后单次
//   解包口径；extractItem(res) = res.data ?? res，utils/response.ts:35-39 唯一形状适配点）。
//
// 反假绿：
//   ① 过渡判别（非仅终态）：生成前空态文案在屏（判别前提），生成后空态退场 + 数据上屏（旧码：
//      空态恒在 + 数据缺席 → 双红）；
//   ② wire 断言函数路径全等（/reports/security 与 /reports/compliance）+ period/standard 参数；
//   ③ 假信封 {code:0,data:{snake 键}} 穿真实拦截器——fixtures 用 snake 键、断言 camel 键渲染，
//      同时锁「信封解包 + camelCase」整链（不 mock 拦截器）；
//   ④ 判别值选取避开 antd Statistic 千分位格式（842 < 1000 原样渲染）；
//   ⑤ compliance 用例附 security 端点零请求负控（防两生成器串线假绿）。

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router';
import { apiClient } from '@autional/shared';
import { message } from '@/lib/antd-app';
import AuditReportsPage from '../page';

// antd v6 命令式 API 由 AntdAppProvider 的 StaticsBridge 赋值（export let），测试不经 Provider 时为
// undefined——成功路径的 message 会炸在 undefined 上（生产由路由层 Provider 保证）。按仓内既有模式桩化。
vi.mock('@/lib/antd-app', () => ({
	message: { success: vi.fn(), error: vi.fn() },
	modal: { confirm: vi.fn() },
}));

const SEC_URL = '/audit/api/v1/admin/audit/reports/security';
const COMP_URL = '/audit/api/v1/admin/audit/reports/compliance';
const TS = '2026-10-04T00:00:00Z';

const SEC_EMPTY_HINT = '选择时间范围并点击「生成」以创建安全报告';
const COMP_EMPTY_HINT = '选择标准与时间范围，然后点击「生成」以创建合规报告';

interface Captured {
	url: string;
	method: string;
	params: any;
}

let captured: Captured[] = [];
let originalAdapter: unknown;

function ok(payload: unknown, config: any) {
	return { data: payload, status: 200, statusText: 'OK', headers: {}, config };
}

/** 安全报告响应 wire（snake 键 = 后端真形状；渲染断言 camel 键证明解包+转换链）。 */
function securityEnvelope() {
	return {
		code: 0,
		message: 'success',
		data: {
			period: '7d',
			generated_at: 1759536000,
			summary: {
				total_events: 842,
				failed_logins: 7,
				anomalies_detected: 3,
				blocked_ips: 2,
				suspicious_activities: 5,
			},
			top_risks: [
				{ type: 'brute_force', severity: 'high', count: 15, description: '检测到多次登录失败，可能为暴力破解攻击。' },
			],
			details: { suspicious_users: ['usr-suspect-1'], failed_login_ips: { '10.0.0.9': 4 }, unusual_access_times: [] },
		},
		timestamp: TS,
	};
}

/** 合规报告响应 wire。 */
function complianceEnvelope() {
	return {
		code: 0,
		message: 'success',
		data: {
			standard: 'GDPR',
			period: '7d',
			compliance_score: 92,
			overall_status: 'pass',
			generated_at: 1759536000,
			checks: [
				{ item: '数据加密', passed: true, severity: 'high', description: '所有数据已加密', issues: [] },
			],
			recommendations: ['启用双因素认证'],
		},
		timestamp: TS,
	};
}

function installCaptureAdapter() {
	captured = [];
	originalAdapter = apiClient.defaults.adapter;
	apiClient.defaults.adapter = (async (config: any) => {
		const url = String(config.url || '');
		captured.push({ url, method: String(config.method || 'get').toLowerCase(), params: config.params });
		if (url === SEC_URL) return ok(securityEnvelope(), config);
		if (url === COMP_URL) return ok(complianceEnvelope(), config);
		return ok({ code: 0, message: 'success', data: {}, timestamp: TS }, config);
	}) as any;
}

function requests(url: string) {
	return captured.filter((c) => c.url === url);
}

function renderPage() {
	const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
	return render(
		<QueryClientProvider client={queryClient}>
			<MemoryRouter>
				<AuditReportsPage />
			</MemoryRouter>
		</QueryClientProvider>,
	);
}

/** 当前激活 pane（Tabs 已访问过的隐藏 pane 恒挂载，判别查询必须作用域收窄）。 */
function activePane(): HTMLElement {
	const el = document.querySelector('[role="tabpanel"][aria-hidden="false"]');
	expect(el).not.toBeNull();
	return el as HTMLElement;
}

/** antd v6 Button 对「恰好两个汉字」自动插空格 → textContent 正则容忍空档（仓内既有模式）。 */
function findButtonByText(re: RegExp, root: () => HTMLElement): HTMLElement {
	const el = (Array.from(root().querySelectorAll('button')) as HTMLElement[]).find((b) =>
		re.test((b.textContent || '').trim()),
	);
	expect(el).toBeTruthy();
	return el as HTMLElement;
}

describe('报告页双重解包修复（A-226 · AC-B2-044）', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		installCaptureAdapter();
	});

	afterEach(() => {
		apiClient.defaults.adapter = originalAdapter as any;
	});

	it('AC-B2-044 security：生成后空态退场 + 摘要/风险/可疑用户上屏（旧码双重解包 → 空白假成功必红）；wire 路径全等', async () => {
		renderPage();

		// 过渡判别前提：生成前空态在屏（此时仅激活 pane 挂载 → 生成按钮唯一）
		expect(await screen.findByText(SEC_EMPTY_HINT)).toBeInTheDocument();
		fireEvent.click(findButtonByText(/^生\s*成$/, () => document.body));

		// wire：函数路径全等 + period 参数（穿真实拦截器）
		await waitFor(() => expect(requests(SEC_URL).length).toBe(1));
		expect(requests(SEC_URL)[0].method).toBe('get');
		expect(requests(SEC_URL)[0].params?.period).toBe('7d');

		// 数据上屏（snake wire → camel 渲染 = 解包 + camelCase 整链实证）
		expect(await screen.findByText('842')).toBeInTheDocument(); // summary.totalEvents（<1000 避千分位）
		expect(screen.getByText('brute force')).toBeInTheDocument(); // type 下划线替换
		expect(screen.getByText('（15 次）')).toBeInTheDocument(); // occurrenceCount 模板
		expect(screen.getByText('usr-suspect-1')).toBeInTheDocument(); // details.suspiciousUsers

		// 空态退场（旧码：空态恒在 + 数据缺席 → 双红）
		expect(screen.queryByText(SEC_EMPTY_HINT)).toBeNull();
		expect(vi.mocked(message.success)).toHaveBeenCalled();
	});

	it('AC-B2-044 compliance：生成后空态退场 + 标准/得分/检查项/建议上屏（旧码必红）；wire 路径全等 + security 零请求负控', async () => {
		renderPage();
		fireEvent.click(await screen.findByText('合规报告'));

		const pane = activePane();
		expect(await screen.findByText(COMP_EMPTY_HINT)).toBeInTheDocument();
		fireEvent.click(findButtonByText(/^生\s*成$/, () => pane));

		await waitFor(() => expect(requests(COMP_URL).length).toBe(1));
		expect(requests(COMP_URL)[0].method).toBe('get');
		expect(requests(COMP_URL)[0].params?.standard).toBe('GDPR');
		expect(requests(COMP_URL)[0].params?.period).toBe('7d');
		// 负控：security 端点零请求（防两生成器串线）
		expect(requests(SEC_URL).length).toBe(0);

		expect(await screen.findByText('92')).toBeInTheDocument(); // complianceScore
		expect(screen.getByText('pass')).toBeInTheDocument(); // overallStatus Tag
		expect(screen.getByText('数据加密')).toBeInTheDocument(); // checks[].item
		expect(screen.getByText('通过')).toBeInTheDocument(); // passed 标签
		// 建议项渲染为「1. 启用双因素认证」（序号 + 文本同节点）→ 精确匹配必炸，用正则子串
		expect(screen.getByText(/启用双因素认证/)).toBeInTheDocument(); // recommendations

		expect(screen.queryByText(COMP_EMPTY_HINT)).toBeNull();
		expect(vi.mocked(message.success)).toHaveBeenCalled();
	});
});
