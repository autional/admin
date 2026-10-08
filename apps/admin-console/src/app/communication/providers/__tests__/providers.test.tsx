// TASK-AB1-09（fix-admin-b1-guard-contract / A-177）：communication providers 页表单契约回归锁。
//
// AC-AB1-49：create 请求体 config 为 JSON 字符串、含 channel/provider/priority、无多余键。
// AC-AB1-50：update 仅发 is_active/priority +（非空时）config（无 channel/provider）；priority 控件值透传。
// W3-02（fix-admin-b3-write-path / A-189）：掩码哨兵防线——编辑态 config 不回填掩码串（留空 = 不修改、
//   不发键）；用户键入 ***REDACTED*** 由本地校验拦截（不发请求）；后端另有 400 兜底。
//
// 断言口径 = **最终请求体**：不 mock hooks/api 层，而是把捕获器装在 shared apiClient 的 axios
// adapter 上（请求拦截器之后的最末环），跑真实链路 page → hooks → generated api → 拦截器
// （camel→snake）→ adapter，捕获到的 body 即上线请求体（isActive→is_active 由拦截器完成）。

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { apiClient } from '@autional/shared';
import CommunicationProvidersPage from '../page';

vi.mock('@/lib/antd-app', () => ({
	message: { success: vi.fn(), error: vi.fn() },
	modal: { confirm: vi.fn() },
}));

interface CapturedCall {
	method: string;
	url: string;
	body?: Record<string, unknown>;
}

const captured: CapturedCall[] = [];
let listPayload: unknown[] = [];
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
		captured.push({ method, url: String(config.url || ''), body });
		return {
			data:
				method === 'get'
					? { code: 0, message: 'ok', data: { items: listPayload, total: listPayload.length } }
					: { code: 0, message: 'ok', data: {} },
			status: 200,
			statusText: 'OK',
			headers: {},
			config,
		};
	}) as any;
}

function renderPage() {
	const queryClient = new QueryClient({
		defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
	});
	return render(
		<QueryClientProvider client={queryClient}>
			<CommunicationProvidersPage />
		</QueryClientProvider>,
	);
}

async function selectProvider(label: string) {
	// antd v6：Select 触发区 = .ant-select-content（旧版 .ant-select-selector 已不存在）
	const input = document.querySelector('#provider') as HTMLInputElement;
	fireEvent.mouseDown(input.closest('.ant-select-content')!);
	const option = await waitFor(() => {
		const el = document.querySelector(`.ant-select-item-option[title="${label}"]`);
		expect(el).toBeTruthy();
		return el as HTMLElement;
	});
	fireEvent.click(option);
}

/** Modal 确定按钮（测试未挂 ConfigProvider，antd 默认 en locale = OK；兼容 zh 文本）。 */
function clickModalOk() {
	const ok = screen.getByRole('button', { name: /^(OK|确\s*定|确定)$/ });
	fireEvent.click(ok);
}

describe('CommunicationProvidersPage 表单契约（A-177）', () => {
	beforeEach(() => {
		captured.length = 0;
		listPayload = [];
		installCaptureAdapter();
	});

	afterEach(() => {
		apiClient.defaults.adapter = originalAdapter as any;
	});

	it('create：请求体 = {channel, provider, config(JSON 字符串), priority}，无多余键', async () => {
		renderPage();
		await waitFor(() => expect(captured.some((c) => c.method === 'get')).toBe(true));

		// 注：icon 的 aria-label（plus）会并入按钮 accessible name，故按文本定位
		fireEvent.click(screen.getByText('添加服务商'));
		await selectProvider('SendGrid');

		const configArea = document.querySelector('#config') as HTMLTextAreaElement;
		fireEvent.change(configArea, {
			target: {
				value: '{"api_key":"SG.test-key","from":"no-reply@example.com","from_name":"Autional"}',
			},
		});
		const priorityInput = document.querySelector('#priority') as HTMLInputElement;
		fireEvent.change(priorityInput, { target: { value: '30' } });

		clickModalOk();
		await waitFor(() => expect(captured.some((c) => c.method === 'post')).toBe(true));

		const post = captured.find((c) => c.method === 'post')!;
		expect(post.url).toContain('/admin/communication/providers');
		// AC-AB1-49：最终请求体键集精确 = {channel, provider, config, priority}
		expect(Object.keys(post.body!).sort()).toEqual(['channel', 'config', 'priority', 'provider']);
		expect(post.body!.channel).toBe('email');
		expect(post.body!.provider).toBe('sendgrid');
		// config 必须是 string（JSON 串），不是对象
		expect(typeof post.body!.config).toBe('string');
		expect(JSON.parse(post.body!.config as string)).toEqual({
			api_key: 'SG.test-key',
			from: 'no-reply@example.com',
			from_name: 'Autional',
		});
		// priority 控件值透传（InputNumber 0-100）
		expect(post.body!.priority).toBe(30);
	});

	it('update：编辑态 config 留空（不回填掩码串）——提交不发 config 键，仅 {is_active, priority}；priority 回填透传', async () => {
		listPayload = [
			{
				id: 'p1',
				channel: 'email',
				provider: 'sendgrid',
				// 服务端返回脱敏字符串（ProviderConfigResponse.config = string）
				config: '***REDACTED***',
				isActive: true,
				priority: 5,
				updatedAt: '2026-01-01T00:00:00Z',
			},
		];
		renderPage();
		await waitFor(() => expect(captured.some((c) => c.method === 'get')).toBe(true));
		fireEvent.click(await screen.findByText('编辑'));

		// W3-02：config 留空（不回填掩码串）+ priority 回填
		const configArea = document.querySelector('#config') as HTMLTextAreaElement;
		expect(configArea.value).toBe('');
		const priorityInput = document.querySelector('#priority') as HTMLInputElement;
		expect(priorityInput.value).toBe('5');

		// 未动 config 直接提交 → config 键缺席（掩码串绝不回写）
		clickModalOk();

		await waitFor(() => expect(captured.some((c) => c.method === 'put')).toBe(true));
		const put = captured.find((c) => c.method === 'put')!;
		expect(put.url).toContain('/admin/communication/providers/p1');
		// AC-AB1-50（W3-02 修订）：键集精确 = {is_active, priority}（camel isActive 经拦截器转 snake）
		expect(Object.keys(put.body!).sort()).toEqual(['is_active', 'priority']);
		expect(put.body!.is_active).toBe(true);
		expect(put.body!.priority).toBe(5);
	});

	it('update：config 改写为新明文 JSON 后提交 = 发 {config, is_active, priority} 三键', async () => {
		listPayload = [
			{
				id: 'p1',
				channel: 'email',
				provider: 'sendgrid',
				config: '***REDACTED***',
				isActive: true,
				priority: 5,
				updatedAt: '2026-01-01T00:00:00Z',
			},
		];
		renderPage();
		await waitFor(() => expect(captured.some((c) => c.method === 'get')).toBe(true));
		fireEvent.click(await screen.findByText('编辑'));

		const configArea = document.querySelector('#config') as HTMLTextAreaElement;
		fireEvent.change(configArea, { target: { value: '{"api_key":"SG.rotated"}' } });
		const priorityInput = document.querySelector('#priority') as HTMLInputElement;
		fireEvent.change(priorityInput, { target: { value: '42' } });
		clickModalOk();

		await waitFor(() => expect(captured.some((c) => c.method === 'put')).toBe(true));
		const put = captured.find((c) => c.method === 'put')!;
		expect(put.url).toContain('/admin/communication/providers/p1');
		expect(Object.keys(put.body!).sort()).toEqual(['config', 'is_active', 'priority']);
		expect(put.body!.is_active).toBe(true);
		expect(put.body!.priority).toBe(42);
		expect(typeof put.body!.config).toBe('string');
		expect(JSON.parse(put.body!.config as string)).toEqual({ api_key: 'SG.rotated' });
	});

	it('update：用户键入掩码占位串 → 本地校验拦截（不发请求）', async () => {
		listPayload = [
			{
				id: 'p1',
				channel: 'email',
				provider: 'sendgrid',
				config: '***REDACTED***',
				isActive: true,
				priority: 5,
				updatedAt: '2026-01-01T00:00:00Z',
			},
		];
		renderPage();
		await waitFor(() => expect(captured.some((c) => c.method === 'get')).toBe(true));
		fireEvent.click(await screen.findByText('编辑'));

		const configArea = document.querySelector('#config') as HTMLTextAreaElement;
		fireEvent.change(configArea, { target: { value: '***REDACTED***' } });
		clickModalOk();

		// W3-02：掩码串被拒，错误文案可见；无任何 PUT 发出
		expect(await screen.findByText('配置为脱敏占位串，请填写真实配置后再提交')).toBeTruthy();
		expect(captured.some((c) => c.method === 'put')).toBe(false);
	});
});
