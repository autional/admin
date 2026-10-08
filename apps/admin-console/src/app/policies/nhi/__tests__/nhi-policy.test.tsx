// W1b（A-96 · A-97）：NHI 策略页波修复回归锁 ——
//   A-96：三处边界/缺省与后端同源 —— robotMaxCount 缺省 100（旧前端 50 漂移）、
//         rotationDaysDefault 缺省 90 且 UI max=3650（后端 Validate [1,3650]；旧 UI 365 漂移）、
//         agentMaxCount 缺省 100（nhi_policy.go gorm default）。
//   A-97：updated_at 展示（响应有值 → 「上次修改」上屏；旧实现零展示）。
// 断言口径 = 渲染后的 DOM 属性/值与真实 wire 请求（axios adapter 最末环 + snake 行）。
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router';
import { apiClient } from '@autional/shared';
import NhiPolicyPage from '../page';

vi.mock('@/lib/antd-app', () => ({
	message: { success: vi.fn(), error: vi.fn() },
}));

const NHI_URL = '/identity/api/v1/admin/policies/nhi';
const UPDATED_AT = '2026-10-05T12:30:00Z';
const captured: string[] = [];
let originalAdapter: unknown;

function installCaptureAdapter() {
	captured.length = 0;
	originalAdapter = apiClient.defaults.adapter;
	apiClient.defaults.adapter = (async (config: any) => {
		captured.push(String(config.url || ''));
		// 部分响应：仅 updated_at（字段缺省 → 由 initialValues 兜底，锁 A-96 同源缺省值）
		const data = {
			code: 0,
			message: 'success',
			data: { updated_at: UPDATED_AT },
			timestamp: '2026-10-06T00:00:00Z',
		};
		return { data, status: 200, statusText: 'OK', headers: {}, config };
	}) as any;
}

function renderPage() {
	const queryClient = new QueryClient({
		defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
	});
	return render(
		<QueryClientProvider client={queryClient}>
			<MemoryRouter>{<NhiPolicyPage />}</MemoryRouter>
		</QueryClientProvider>,
	);
}

describe('NHI 策略（A-96 边界/缺省同源 · A-97 updatedAt 展示）', () => {
	beforeEach(() => {
		installCaptureAdapter();
	});

	afterEach(() => {
		apiClient.defaults.adapter = originalAdapter as any;
	});

	it('AC-B5-W1b-96：缺省值 = 后端同源（robot=100 / rotation=90 / agent=100）+ rotation UI 上限 3650', { timeout: 20000 }, async () => {
		renderPage();
		// 数据态门：标题上屏（部分响应仍进表单）
		expect(await screen.findByText('NHI 策略')).toBeTruthy();

		// 缺省值（旧前端 robotMaxCount=50 → 必红）
		const robot = document.querySelector('#robotMaxCount') as HTMLInputElement;
		expect(robot).toBeTruthy();
		expect(robot.value).toBe('100');

		const agent = document.querySelector('#agentMaxCount') as HTMLInputElement;
		expect(agent.value).toBe('100');

		const rotation = document.querySelector('#rotationDaysDefault') as HTMLInputElement;
		expect(rotation.value).toBe('90');
		// A-96：UI 上限对齐后端 Validate [1,3650]（旧 UI 365 → aria-valuemax=365 → 必红）
		expect(rotation.getAttribute('aria-valuemax')).toBe('3650');
	});

	it('AC-B5-W1b-97：updated_at 随响应 → 「上次修改」上屏（含格式化值）+ wire 打到策略端点', { timeout: 20000 }, async () => {
		renderPage();
		expect(await screen.findByText('NHI 策略')).toBeTruthy();

		const el = await screen.findByText(/上次修改/);
		// 展示值 = toLocaleString('zh-CN')（同一环境同构计算）
		expect(el.textContent).toContain(new Date(UPDATED_AT).toLocaleString('zh-CN'));

		// wire 锚：GET 打到 NHI 策略端点（真实链路而非桩数据直渲染）
		expect(captured.some((u) => u.includes(NHI_URL))).toBe(true);
	});
});
