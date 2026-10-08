// TASK-B4-W2-05（fix-admin-b4-presentation / A-75 残余 · RC-B4-04 · ADR-B4-08）：
//   AC-B4-W2-05-1：编辑表单仅 {name, description, callbackUrl}；提交 payload 键集 = 契约键集。
//   AC-B4-W2-05-2：callbackUrl 回显服务器值（保存生效的 dev 实测归 G-B4-02）。
//   AC-B4-W2-05-3：测试（键集 + 回显）。
//
// 旧缺陷锁死：编辑弹窗含 workloadSubtype/rotationDays/jitTtl —— PUT UpdateAgentRequest
// （identity agent.go:104-108）不含这些键，后端**静默忽略** ⇒ 用户以为改了实际没改（假成功）。
// 恢复即红：这三个控件一旦回到编辑弹窗（键集断言此刻为 6 键）/ callbackUrl 控件缺失（回显断空）。
//
// 断言口径与 agents-contract.test.tsx 同款：捕获器装在最末环 axios adapter（拦截器之后），
// 跑真实链路 page → generated api → 拦截器（camel→snake）→ adapter；wire 形状（snake）回写。

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Routes, Route } from 'react-router';
import { apiClient } from '@autional/shared';
import AgentDetailPage from '../[id]/page';
import { message } from '@/lib/antd-app';

vi.mock('@/lib/antd-app', () => ({
	message: { success: vi.fn(), error: vi.fn() },
}));

const AGENT_ID = 'agt_01J0000000000000000000FRT';
const AGENTS_URL = '/identity/api/v1/admin/agents';
const OLD_CALLBACK = 'https://ci.example.com/hook';

/** wire 形状（snake）原始数据：AgentInfo 契约（domain/agent.go:76-91），经响应拦截器转 camel。 */
const RAW_AGENT = {
	identity_id: AGENT_ID,
	name: 'ci-runner',
	description: 'CI 执行代理',
	callback_url: OLD_CALLBACK,
	workload_subtype: 'service_account',
	status: 'active',
	owner_id: 'owner-001',
	rotation_days: 30,
	jit_ttl: 900,
	created_at: '2026-01-05T00:00:00Z',
	updated_at: '2026-01-06T00:00:00Z',
};

interface CapturedCall {
	method: string;
	url: string;
	body?: Record<string, unknown>;
}

const captured: CapturedCall[] = [];
let originalAdapter: unknown;

function installCaptureAdapter() {
	originalAdapter = apiClient.defaults.adapter;
	apiClient.defaults.adapter = (async (config: any) => {
		let body: Record<string, unknown> | undefined;
		if (typeof config.data === 'string' && config.data.length > 0) {
			body = JSON.parse(config.data);
		} else if (config.data && typeof config.data === 'object') {
			body = config.data as Record<string, unknown>;
		}
		const method = String(config.method || 'get').toLowerCase();
		const url = String(config.url || '');
		captured.push({ method, url, body });

		let data: unknown;
		if (method === 'put') {
			data = {
				code: 0,
				message: 'success',
				data: { ...RAW_AGENT, name: body?.name ?? RAW_AGENT.name },
				timestamp: '2026-10-05T00:00:00Z',
			};
		} else if (method === 'get' && url === `${AGENTS_URL}/${AGENT_ID}`) {
			data = { code: 0, message: 'success', data: RAW_AGENT, timestamp: '2026-10-05T00:00:00Z' };
		} else {
			// credentials / activity / permissions：空列表（页面在无数据时走 EmptyState，不阻断编辑面）
			data = { code: 0, message: 'success', items: [], total: 0, timestamp: '2026-10-05T00:00:00Z' };
		}
		return { data, status: 200, statusText: 'OK', headers: {}, config };
	}) as any;
}

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

/** Modal 确定按钮（测试未挂 ConfigProvider，antd 默认 en locale = OK；兼容 zh 文本）。 */
function clickModalOk() {
	const ok = screen.getByRole('button', { name: /^(OK|确\s*定|确定)$/ });
	fireEvent.click(ok);
}

describe('agents 编辑表单收窄（A-75 残余）', () => {
	beforeEach(() => {
		captured.length = 0;
		installCaptureAdapter();
	});

	afterEach(() => {
		apiClient.defaults.adapter = originalAdapter as any;
	});

	it('AC-B4-W2-05-1/2/3：callbackUrl 回显 + 提交 payload 键集恰为契约三键（无被静默忽略的旧键）', { timeout: 20000 }, async () => {
		renderPage();

		// 详情加载完成（服务器 name 渲染；h1 标题与详情位各一处 → All 变体防多匹配）
		expect((await screen.findAllByText('ci-runner')).length).toBeGreaterThan(0);

		fireEvent.click(screen.getByText('编辑 Agent'));

		// 回显：name / description / callbackUrl = 服务器值（camel 直读 AgentInfo）
		expect(await screen.findByDisplayValue('ci-runner')).toBeTruthy();
		expect(screen.getByDisplayValue('CI 执行代理')).toBeTruthy();
		const callbackInput = await waitFor(() => {
			const el = document.querySelector('#callbackUrl') as HTMLInputElement;
			expect(el).toBeTruthy();
			return el;
		});
		expect(callbackInput.value).toBe(OLD_CALLBACK);

		// 收窄核验：被后端静默忽略的三键控件不得存在（恢复即红）
		expect(document.querySelector('#workloadSubtype')).toBeNull();
		expect(document.querySelector('#rotationDays')).toBeNull();
		expect(document.querySelector('#jitTtl')).toBeNull();

		// 修改 name + callbackUrl 后保存
		fireEvent.change(document.querySelector('#name')!, { target: { value: 'ci-runner-v2' } });
		fireEvent.change(callbackInput, { target: { value: 'https://ci.example.com/hook-v2' } });
		clickModalOk();

		await waitFor(() => expect(captured.some((c) => c.method === 'put')).toBe(true));
		const put = captured.find((c) => c.method === 'put')!;
		expect(put.url).toBe(`${AGENTS_URL}/${AGENT_ID}`);
		// 键集断言：拦截器 camel→snake 后恰为契约三键（UpdateAgentRequest），
		// workload_subtype / rotation_days / jit_ttl 零出现（旧表单单侧承诺的键）
		expect(Object.keys(put.body!).sort()).toEqual(['callback_url', 'description', 'name']);
		expect(put.body!.name).toBe('ci-runner-v2');
		expect(put.body!.callback_url).toBe('https://ci.example.com/hook-v2');
		expect(put.body!.description).toBe('CI 执行代理');
		expect(message.success).toHaveBeenCalled();
	});
});
