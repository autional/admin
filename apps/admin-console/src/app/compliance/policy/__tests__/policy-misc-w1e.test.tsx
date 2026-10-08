// W1e-28（fix-admin-b5-polish / A-253）：合规策略页杂项 4 收口回归锁。
//
//   A-253①：死间接 `const filteredStandards = standards`（HEAD :324）→ 删除，渲染直读 standards；
//   A-253②：handleApply PUT/GET 单 try（回读 GET 失败连带报「更新失败」，成功回执被吞、文案与
//           事实不符）→ 分段：PUT 成功即回执（standardsUpdated），回读失败仅「刷新策略失败」；
//   A-253③：零勾选应用 = 静默清空全部标准（无确认无警示）→ 前置 Popconfirm（确认前零 PUT）；
//   A-253④：组合策略空态无引导 → 空态引导文案（matrixEmptyHint）。
//
// 断言口径 = 渲染输出 + 最终通知实参 + PUT wire body；正控/负控成对：
//   ③ 确认前 PUT 零请求（负控）→ 确认后 body {standards: []}（正控）；
//   ② 回读失败仍保留成功回执（正控）且错误文案 = 刷新策略失败而非更新失败（判别旧单 try 形态）；
//   ① 勾选后直发（无确认弹窗）+ body 携带所选 id（标准列表直读 path 被真实走通）。
//
// 注：本页成功回执 message 直连 'antd' 静态方法（非 '@/lib/antd-app'）→ 以 spy 捕获；
//     error 通知走 '@/lib/error-handler' → '@/lib/antd-app'（mock 捕获）。

import { describe, it, expect, vi, beforeEach, afterEach, type MockInstance } from 'vitest';
import { render, screen, waitFor, fireEvent, cleanup, configure } from '@testing-library/react';
import { MemoryRouter } from 'react-router';

// 全量门并行负载下，antd 动画/首渲染可超测试库默认 1000ms 异步超时 → 放宽（防假红）
configure({ asyncUtilTimeout: 5000 });
import { message as antdMessage } from 'antd';
import { apiClient } from '@autional/shared';
import { message } from '@/lib/antd-app';
import CompliancePolicyPage from '../page';

vi.mock('@/lib/antd-app', () => ({
	message: { success: vi.fn(), error: vi.fn() },
	modal: { confirm: vi.fn() },
}));

const STANDARDS_URL = '/compliance/api/v1/admin/compliance/standards';
const POLICY_URL = '/compliance/api/v1/admin/compliance/tenants/self/policy';
const OVERRIDES_URL = '/compliance/api/v1/admin/compliance/tenants/self/overrides';
const STANDARDS_PUT_URL = '/compliance/api/v1/admin/compliance/tenants/self/standards';
const TS = '2026-10-04T00:00:00Z';

const RAW_STANDARDS = [
	{
		id: 'std-gdpr',
		name: 'GDPR',
		version: '2016/679',
		category: 'privacy',
		description: '欧盟通用数据保护条例',
	},
];

interface Captured {
	url: string;
	method: string;
	data?: string;
}

let captured: Captured[] = [];
let originalAdapter: unknown;
let policyGets = 0;
let failPolicyReadBack = false;
let successSpy: MockInstance<typeof antdMessage.success>;

function ok(payload: unknown, config: any) {
	return { data: payload, status: 200, statusText: 'OK', headers: {}, config };
}

function installCaptureAdapter() {
	captured = [];
	policyGets = 0;
	failPolicyReadBack = false;
	originalAdapter = apiClient.defaults.adapter;
	apiClient.defaults.adapter = (async (config: any) => {
		const url = String(config.url || '');
		const method = String(config.method || 'get').toLowerCase();
		captured.push({ url, method, data: typeof config.data === 'string' ? config.data : undefined });
		if (url === STANDARDS_URL && method === 'get') {
			return ok({ code: 0, message: 'success', data: RAW_STANDARDS, timestamp: TS }, config);
		}
		if (url === POLICY_URL && method === 'get') {
			policyGets += 1;
			// 首取（mount）恒成功；回读失败用例在确认前置 flag → 第 2 次起抛传输层错误
			if (failPolicyReadBack && policyGets > 1) {
				throw new Error('Request failed with status code 500');
			}
			return ok(
				{ code: 0, message: 'success', data: { standards: [], parameters: {} }, timestamp: TS },
				config,
			);
		}
		if (url === OVERRIDES_URL && method === 'get') {
			return ok({ code: 0, message: 'success', data: { overrides: [] }, timestamp: TS }, config);
		}
		if (url === STANDARDS_PUT_URL && method === 'put') {
			return ok({ code: 0, message: 'success', data: {}, timestamp: TS }, config);
		}
		return ok({ code: 0, message: 'success', data: {}, timestamp: TS }, config);
	}) as any;
}

function puts() {
	return captured.filter((c) => c.method === 'put' && c.url === STANDARDS_PUT_URL);
}

function decode(data?: string): any {
	return data ? JSON.parse(data) : undefined;
}

function renderPage() {
	return render(
		<MemoryRouter>
			<CompliancePolicyPage />
		</MemoryRouter>,
	);
}

describe('合规策略页 A-253 杂项 4（W1e）', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		installCaptureAdapter();
		// antd v6 静态 message（页面直连 import）——spy 捕获并断掉实际渲染
		successSpy = vi.spyOn(antdMessage, 'success').mockImplementation((() => {}) as any);
	});

	afterEach(() => {
		cleanup();
		successSpy.mockRestore();
		apiClient.defaults.adapter = originalAdapter as any;
	});

	it('A-253③：零勾选应用 → Popconfirm 前置确认；确认前零 PUT，确认后 PUT body {standards: []} + 成功回执/零 error', async () => {
		renderPage();
		await screen.findByText('GDPR');

		expect(puts()).toHaveLength(0);
		fireEvent.click(screen.getByText('应用标准选择'));

		// 确认弹窗上屏（旧形态：零勾选点即静默 PUT → 必红）；并行负载下动画可滞后 → 显式放宽
		expect(await screen.findByText('确认清空标准选择？', undefined, { timeout: 5000 })).toBeInTheDocument();
		expect(screen.getByText('当前未勾选任何标准，确认应用将清空全部已选标准。')).toBeInTheDocument();
		// 负控：确认前 PUT 零请求
		expect(puts()).toHaveLength(0);

		fireEvent.click(screen.getByRole('button', { name: /^确\s*认$/ }));
		await waitFor(() => expect(puts()).toHaveLength(1));
		expect(decode(puts()[0].data)).toEqual({ standards: [] });

		// 回读成功正控：成功回执上屏（antd 静态 message）+ 零 error 通知
		await waitFor(() => expect(successSpy).toHaveBeenCalledWith('标准选择已更新'));
		expect(vi.mocked(message.error)).not.toHaveBeenCalled();
	});

	it('A-253①/分支：勾选标准后直发（无确认弹窗）+ PUT body {standards: [std-gdpr]}（标准列表直读渲染）', async () => {
		renderPage();
		await screen.findByText('GDPR');

		fireEvent.click(screen.getByRole('checkbox', { name: /GDPR/ }));
		await waitFor(() =>
			expect((document.querySelector('input[type="checkbox"]') as HTMLInputElement).checked).toBe(true),
		);

		fireEvent.click(screen.getByText('应用标准选择'));
		await waitFor(() => expect(puts()).toHaveLength(1));
		// 非零勾选：无确认弹窗（分支判别；旧形态此处本就直发，锁防误挂确认到正路）
		expect(screen.queryByText('确认清空标准选择？')).toBeNull();
		expect(decode(puts()[0].data)).toEqual({ standards: ['std-gdpr'] });
	});

	it('A-253②：PUT 成功 + 回读失败 → 成功回执保留、错误为「刷新策略失败」而非「更新失败」（旧单 try 必红）', async () => {
		renderPage();
		await screen.findByText('GDPR');
		await waitFor(() => expect(policyGets).toBe(1));
		failPolicyReadBack = true;

		fireEvent.click(screen.getByText('应用标准选择'));
		await screen.findByText('确认清空标准选择？', undefined, { timeout: 5000 });
		fireEvent.click(screen.getByRole('button', { name: /^确\s*认$/ }));

		await waitFor(() => expect(puts()).toHaveLength(1));
		// 旧形态：单 try 吞成功回执 + 报「更新失败」（两断言必红）；新形态分段
		await waitFor(() => expect(vi.mocked(message.error)).toHaveBeenCalledWith('刷新策略失败'));
		expect(vi.mocked(message.error).mock.calls.map((c) => String(c[0]))).not.toContain('更新失败');
		expect(successSpy).toHaveBeenCalledWith('标准选择已更新');
	});

	it('A-253④：组合策略空态引导文案（旧形态空态无引导）', async () => {
		renderPage();
		await screen.findByText('GDPR');

		fireEvent.click(screen.getByText(/组合策略/));
		expect(
			await screen.findByText('暂无组合策略数据：请先在「标准选择」中勾选标准并应用，此处将展示解析结果', undefined, {
				timeout: 5000,
			}),
		).toBeInTheDocument();
	});
});
