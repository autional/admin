// TASK-AB1-20（fix-admin-b1-guard-contract / A-74 · A-94）：agents 表单类型契约 + policies/nhi 回显契约回归锁。
//
//   AC-AB1-36：agents 页在 snake 原始响应下渲染全部字段（无 undefined、无双读分支代码路径）。
//   AC-AB1-37：表单提交 payload `rotation_days` 为 number、`jit_ttl` 为 number（秒）。
//   AC-AB1-38：policies/nhi 页服务器值回显（键映射对齐）+ 保存 body = 服务器值。
//
// 断言口径 = **最终 wire 请求/响应**：捕获器装在 shared apiClient 的 axios adapter（请求拦截器之后
// 最末环），跑真实链路 page → generated api → 拦截器（camel→snake / snake→camel）→ adapter；
// adapter 回写 wire 形状（snake）响应，与线上链路同构。

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router';
import { apiClient } from '@autional/shared';
import AgentsPage from '../page';
import NhiPolicyPage from '../../policies/nhi/page';

vi.mock('@/lib/antd-app', () => ({
	message: { success: vi.fn(), error: vi.fn() },
}));

interface CapturedCall {
	method: string;
	url: string;
	params?: Record<string, unknown>;
	body?: Record<string, unknown>;
}

const AGENTS_URL = '/identity/api/v1/admin/agents';
const NHI_POLICY_URL = '/identity/api/v1/admin/policies/nhi';
const captured: CapturedCall[] = [];
let originalAdapter: unknown;

/** wire 形状（snake）原始数据：AgentInfo 契约（domain/agent.go:76-91），经响应拦截器转 camel。 */
const RAW_AGENTS = [
	{
		identity_id: 'agt_01J0000000000000000000FRT',
		name: 'ci-runner',
		description: 'CI 执行代理',
		workload_subtype: 'service_account',
		status: 'active',
		owner_id: 'owner-001',
		rotation_days: 30,
		jit_ttl: 900,
		created_at: '2026-01-05T00:00:00Z',
		updated_at: '2026-01-06T00:00:00Z',
	},
];

/** wire 形状（snake）NHI 策略（NHIPolicyResponse json tag），经响应拦截器转 camel。 */
const RAW_POLICY = {
	agent_max_count: 42,
	agent_default_ttl: '30m',
	robot_max_count: 7,
	device_max_per_owner: 4,
	rotation_days_default: 120,
	updated_at: '2026-09-07T00:00:00Z',
};

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
		captured.push({ method, url, params: config.params as Record<string, unknown> | undefined, body });

		let data: unknown;
		if (url.includes(NHI_POLICY_URL) && method === 'get') {
			data = { code: 0, message: 'success', data: RAW_POLICY, timestamp: '2026-10-04T00:00:00Z' };
		} else if (url.includes(NHI_POLICY_URL)) {
			data = { code: 0, message: 'success', data: RAW_POLICY, timestamp: '2026-10-04T00:00:00Z' };
		} else if (url.includes(AGENTS_URL) && method === 'get') {
			data = {
				code: 0,
				message: 'success',
				items: RAW_AGENTS,
				total: RAW_AGENTS.length,
				pagination: { total: 1, page: 1, page_size: 10, total_pages: 1, has_next: false },
				timestamp: '2026-10-04T00:00:00Z',
			};
		} else {
			data = { code: 0, message: 'success', data: {}, timestamp: '2026-10-04T00:00:00Z' };
		}
		return { data, status: 200, statusText: 'OK', headers: {}, config };
	}) as any;
}

function renderPage(ui: React.ReactElement) {
	const queryClient = new QueryClient({
		defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
	});
	return render(
		<QueryClientProvider client={queryClient}>
			<MemoryRouter>{ui}</MemoryRouter>
		</QueryClientProvider>,
	);
}

/** Modal 确定按钮（测试未挂 ConfigProvider，antd 默认 en locale = OK；兼容 zh 文本）。 */
function clickModalOk() {
	const ok = screen.getByRole('button', { name: /^(OK|确\s*定|确定)$/ });
	fireEvent.click(ok);
}

describe('agents 契约（A-74）', () => {
	beforeEach(() => {
		captured.length = 0;
		installCaptureAdapter();
	});

	afterEach(() => {
		apiClient.defaults.adapter = originalAdapter as any;
	});

	it('AC-AB1-36：snake 原始响应经真实拦截器渲染全字段（无 undefined）', { timeout: 20000 }, async () => {
		renderPage(<AgentsPage />);

		expect(await screen.findByText('ci-runner')).toBeTruthy();
		expect(screen.getByText('服务账户')).toBeTruthy();
		expect(screen.getByText('活跃')).toBeTruthy();
		expect(screen.getByText('owner-001')).toBeTruthy();
		expect(screen.queryByText('undefined')).toBeNull();

		const gets = captured.filter((c) => c.method === 'get' && c.url.includes(AGENTS_URL));
		expect(gets).toHaveLength(1);
	});

	// 全量并行跑时 antd 渲染较慢，显式放宽超时（默认 5s 在满载机器上会假红）
	it('AC-AB1-37：提交 wire body 的 rotation_days / jit_ttl 均为 number（秒）', { timeout: 20000 }, async () => {
		renderPage(<AgentsPage />);
		expect(await screen.findByText('ci-runner')).toBeTruthy();

		fireEvent.click(screen.getAllByText('创建 Agent')[0]);

		const nameInput = await waitFor(() => {
			const el = document.querySelector('#name') as HTMLInputElement;
			expect(el).toBeTruthy();
			return el;
		});
		fireEvent.change(nameInput, { target: { value: 'deploy-bot' } });

		// rotationDays → InputNumber（后端 int）；输入 '120' 后提交必须回落 number（旧 Input type=number 发 string → 400）
		const rotation = document.querySelector('#rotationDays') as HTMLInputElement;
		fireEvent.change(rotation, { target: { value: '120' } });

		// jitTtl → Select 秒值选项；选 30m（=1800 秒）后提交必须为 number（旧 Input 发 '1h' 字符串 → 400）
		const jitInput = document.querySelector('#jitTtl') as HTMLInputElement;
		fireEvent.mouseDown(jitInput.closest('.ant-select-content')!);
		const option = await waitFor(() => {
			const el = document.querySelector('.ant-select-item-option[title="30m"]');
			expect(el).toBeTruthy();
			return el as HTMLElement;
		});
		fireEvent.click(option);

		clickModalOk();
		await waitFor(() => expect(captured.some((c) => c.method === 'post')).toBe(true));

		const post = captured.find((c) => c.method === 'post')!;
		expect(post.url).toContain(AGENTS_URL);
		expect(post.body!.name).toBe('deploy-bot');
		expect(post.body!.workload_subtype).toBe('agent');
		expect(typeof post.body!.rotation_days).toBe('number');
		expect(post.body!.rotation_days).toBe(120);
		expect(typeof post.body!.jit_ttl).toBe('number');
		expect(post.body!.jit_ttl).toBe(1800);
	});
});

describe('policies/nhi 回显契约（A-94）', () => {
	beforeEach(() => {
		captured.length = 0;
		installCaptureAdapter();
	});

	afterEach(() => {
		apiClient.defaults.adapter = originalAdapter as any;
	});

	it('AC-AB1-38：服务器值回显（非 initialValues），保存 PUT wire body = 服务器值', { timeout: 20000 }, async () => {
		renderPage(<NhiPolicyPage />);

		// 服务器值（agent_max_count=42 等）经真实拦截器 camel 化后必须填入表单
		expect(await screen.findByDisplayValue('42')).toBeTruthy();
		expect(screen.getByDisplayValue('7')).toBeTruthy();
		expect(screen.getByDisplayValue('4')).toBeTruthy();
		expect(screen.getByDisplayValue('120')).toBeTruthy();
		// initialValues（100/50/10/90）不得作为主显示残留（旧缺陷：键错配 → setFieldsValue 全落空）
		expect(screen.queryByDisplayValue('100')).toBeNull();
		expect(screen.queryByDisplayValue('50')).toBeNull();
		expect(screen.queryByDisplayValue('10')).toBeNull();
		expect(screen.queryByDisplayValue('90')).toBeNull();
		// Select 显示服务器 agent_default_ttl=30m 对应的选项文案（旧缺陷键错配时显示 initialValue 1h="1 小时"）
		expect(screen.getByText('30 分钟')).toBeTruthy();
		expect(screen.queryByText('1 小时')).toBeNull();

		// 未动任何字段直接保存：PUT body 必须 = 服务器值（旧缺陷：initialValues 静默覆写服务器值）
		fireEvent.click(screen.getByText('保存策略'));
		await waitFor(() => expect(captured.some((c) => c.method === 'put')).toBe(true));

		const put = captured.find((c) => c.method === 'put')!;
		expect(put.url).toContain(NHI_POLICY_URL);
		expect(put.body).toEqual({
			agent_max_count: 42,
			agent_default_ttl: '30m',
			robot_max_count: 7,
			device_max_per_owner: 4,
			rotation_days_default: 120,
		});
	});
});
