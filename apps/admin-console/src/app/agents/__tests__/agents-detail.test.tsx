// W1b（A-78 · A-79）：agents 详情波修复回归锁 ——
//   A-78：JIT TTL 人性化（900 → 「15 分钟」/ 3600 → 「1 小时」/ 45 → 「45 秒」；旧实现直显原始秒数）
//   A-79：错误副标题不得残留「加载中」（旧实现 description fallback = t('common.loading')）
//   A-79：404 不重试（retryUnlessNotFound 页面接线：404 → 恰 1 次详情请求）
// 断言口径 = 最终 wire 请求/响应（axios adapter 最末环捕获 + snake 行回写，与线上链路同构）。
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Routes, Route } from 'react-router';
import { apiClient } from '@autional/shared';
import AgentDetailPage from '../[id]/page';

vi.mock('@/lib/antd-app', () => ({
	message: { success: vi.fn(), error: vi.fn() },
}));

const AGENTS_URL = '/identity/api/v1/admin/agents';
const AGENT_ID = 'agt_01J0000000000000000000W1B';

/** wire 形状（snake）AgentInfo 行；jit_ttl 由各用例覆写。 */
function rawAgent(jitTtl: number) {
	return {
		identity_id: AGENT_ID,
		name: 'ci-runner',
		description: 'CI 执行代理',
		workload_subtype: 'service_account',
		status: 'active',
		owner_id: 'owner-001',
		rotation_days: 30,
		jit_ttl: jitTtl,
		created_at: '2026-01-05T00:00:00Z',
		updated_at: '2026-01-06T00:00:00Z',
	};
}

interface CapturedCall {
	method: string;
	url: string;
}

const captured: CapturedCall[] = [];
let originalAdapter: unknown;
let rawJitTtl = 900;
let failDetailStatus: number | null = null;

function httpError(status: number, config: any) {
	const err: any = new Error(`Request failed with status code ${status}`);
	err.response = { status, data: { code: `${status}00000` }, headers: {}, config };
	err.config = config;
	return err;
}

function installCaptureAdapter() {
	originalAdapter = apiClient.defaults.adapter;
	apiClient.defaults.adapter = (async (config: any) => {
		const method = String(config.method || 'get').toLowerCase();
		const url = String(config.url || '');
		captured.push({ method, url });
		const ts = '2026-10-06T00:00:00Z';
		// 详情端点（credentials/activity/permissions 以子路径区分）
		if (url.endsWith(`${AGENTS_URL}/${AGENT_ID}`)) {
			if (failDetailStatus) throw httpError(failDetailStatus, config);
			return { data: { code: 0, message: 'success', data: rawAgent(rawJitTtl), timestamp: ts }, status: 200, statusText: 'OK', headers: {}, config };
		}
		// credentials / activity / permissions：空列表
		return { data: { code: 0, message: 'success', items: [], total: 0, timestamp: ts }, status: 200, statusText: 'OK', headers: {}, config };
	}) as any;
}

const detailCalls = () => captured.filter((c) => c.method === 'get' && c.url.endsWith(`${AGENTS_URL}/${AGENT_ID}`));

function renderPage() {
	const queryClient = new QueryClient({
		defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
	});
	return render(
		<QueryClientProvider client={queryClient}>
			<MemoryRouter initialEntries={[`/agents/${AGENT_ID}`]}>
				<Routes>
					<Route path="/agents/:id" element={<AgentDetailPage />} />
				</Routes>
			</MemoryRouter>
		</QueryClientProvider>,
	);
}

describe('agents 详情（A-78 TTL 人性化 · A-79 错误副标题）', () => {
	beforeEach(() => {
		captured.length = 0;
		rawJitTtl = 900;
		failDetailStatus = null;
		installCaptureAdapter();
	});

	afterEach(() => {
		apiClient.defaults.adapter = originalAdapter as any;
	});

	it('AC-B5-W1b-78：jit_ttl=900 → 「15 分钟」（旧实现直显原始秒数 900）', { timeout: 20000 }, async () => {
		renderPage();
		// h1 标题与详情位各一处 name → All 变体防多匹配
		expect((await screen.findAllByText('ci-runner')).length).toBeGreaterThan(0);

		expect(screen.getByText('15 分钟')).toBeTruthy();
		expect(screen.queryByText('900')).toBeNull();
	});

	it('AC-B5-W1b-78：jit_ttl=3600 → 「1 小时」；45 → 「45 秒」（整除分支全覆盖）', { timeout: 20000 }, async () => {
		rawJitTtl = 3600;
		const first = renderPage();
		expect((await screen.findAllByText('ci-runner')).length).toBeGreaterThan(0);
		expect(screen.getByText('1 小时')).toBeTruthy();
		expect(screen.queryByText('3600')).toBeNull();
		first.unmount();

		rawJitTtl = 45;
		renderPage();
		expect((await screen.findAllByText('ci-runner')).length).toBeGreaterThan(0);
		expect(screen.getByText('45 秒')).toBeTruthy();
		expect(screen.queryByText('45')).toBeNull();
	});

	it('AC-B5-W1b-79：404 → 错误态可见（加载 Agent 失败）+ 副标题无「加载中」+ 404 零重试', { timeout: 20000 }, async () => {
		failDetailStatus = 404;
		renderPage();

		expect(await screen.findByText('加载 Agent 失败')).toBeTruthy();
		// A-79：副标题不得残留「加载中」（旧实现 description = t('common.loading')）
		expect(screen.queryByText('加载中')).toBeNull();
		// 404 零重试：恰 1 次详情请求
		expect(detailCalls()).toHaveLength(1);
	});
});
