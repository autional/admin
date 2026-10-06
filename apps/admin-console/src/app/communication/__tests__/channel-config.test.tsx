// fix-admin-b1-guard-contract 补修（A-177 真身）：/communication 页签「渠道配置」表单
// provider 化后的请求体契约回归锁。
//
// 背景：审计 A-177（P1）= 页签四字段表单 {host,port,apiKey,secret} 与后端 DTO 不匹配，
// 保存恒 400 "no fields to update"（code 61090001）。修复 = 表单对齐 provider 契约：
//  ① create：POST body = {channel, provider, config(JSON 字符串), priority} 键集精确。
//  ② update 掩码未改：PUT body 仅 {priority} —— 掩码哨兵与空值均不回写 config（防销毁真密文）。
//  ③ update 改配置：PUT body = {config, priority} 键集精确（无 channel/provider/is_active）。
//
// 断言口径 = 最终请求体（adapter 捕获，同 providers.test.tsx 模式：装在 shared apiClient 的
// axios adapter 上，请求拦截器之后的最末环，跑真实链路 page → hooks → generated api → 拦截器）。

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { apiClient } from '@autional/shared';
import CommunicationPage from '../page';

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
			<CommunicationPage />
		</QueryClientProvider>,
	);
}

/** 打开邮件页签（缺省激活页签是 dashboard，渠道表单懒挂载）。 */
async function openEmailTab() {
	fireEvent.click(await screen.findByRole('tab', { name: '邮件' }));
	await waitFor(() => expect(document.querySelector('#email_provider')).toBeTruthy());
}

async function selectOption(fieldId: string, label: string) {
	// antd v6：Select 触发区 = .ant-select-content（旧版 .ant-select-selector 已不存在）
	const input = document.querySelector(`#${fieldId}`) as HTMLInputElement;
	fireEvent.mouseDown(input.closest('.ant-select-content')!);
	const option = await waitFor(() => {
		const el = document.querySelector(`.ant-select-item-option[title="${label}"]`);
		expect(el).toBeTruthy();
		return el as HTMLElement;
	});
	fireEvent.click(option);
}

function clickSave() {
	fireEvent.click(screen.getByRole('button', { name: /保存配置/ }));
}

describe('/communication 页签渠道配置表单契约（A-177 补修）', () => {
	beforeEach(() => {
		captured.length = 0;
		listPayload = [];
		installCaptureAdapter();
	});

	afterEach(() => {
		apiClient.defaults.adapter = originalAdapter as any;
	});

	it('create：POST body = {channel, provider, config(JSON 字符串), priority} 键集精确（无 host/port/apiKey/secret）', async () => {
		renderPage();
		await waitFor(() => expect(captured.some((c) => c.method === 'get')).toBe(true));
		await openEmailTab();

		await selectOption('email_provider', 'SendGrid');
		const configArea = document.querySelector('#email_config') as HTMLTextAreaElement;
		fireEvent.change(configArea, {
			target: { value: '{"host":"smtp.example.com","port":587}' },
		});
		const priorityInput = document.querySelector('#email_priority') as HTMLInputElement;
		fireEvent.change(priorityInput, { target: { value: '30' } });

		clickSave();
		await waitFor(() => expect(captured.some((c) => c.method === 'post')).toBe(true));

		const post = captured.find((c) => c.method === 'post')!;
		expect(post.url).toContain('/admin/communication/providers');
		expect(Object.keys(post.body!).sort()).toEqual(['channel', 'config', 'priority', 'provider']);
		expect(post.body!.channel).toBe('email');
		expect(post.body!.provider).toBe('sendgrid');
		// config 必须是 string（JSON 串），不是对象
		expect(typeof post.body!.config).toBe('string');
		expect(JSON.parse(post.body!.config as string)).toEqual({
			host: 'smtp.example.com',
			port: 587,
		});
		expect(post.body!.priority).toBe(30);
	}, 15000);

	it('update 掩码未改：PUT body 仅 {priority} —— 掩码哨兵不回写 config', async () => {
		listPayload = [
			{
				id: 'cfg-email',
				channel: 'email',
				provider: 'sendgrid',
				config: '***REDACTED***',
				isActive: true,
				priority: 5,
			},
		];
		renderPage();
		await waitFor(() => expect(captured.some((c) => c.method === 'get')).toBe(true));
		await openEmailTab();

		// 回填：掩码按字符串展示 + priority 回填；既有行 provider 锁定（update 契约不可改）
		const configArea = document.querySelector('#email_config') as HTMLTextAreaElement;
		await waitFor(() => expect(configArea.value).toBe('***REDACTED***'));
		const providerInput = document.querySelector('#email_provider') as HTMLInputElement;
		expect(providerInput.disabled).toBe(true);
		const priorityInput = document.querySelector('#email_priority') as HTMLInputElement;
		expect(priorityInput.value).toBe('5');

		fireEvent.change(priorityInput, { target: { value: '42' } });
		clickSave();

		await waitFor(() => expect(captured.some((c) => c.method === 'put')).toBe(true));
		const put = captured.find((c) => c.method === 'put')!;
		expect(put.url).toContain('/admin/communication/providers/cfg-email');
		// 哨兵未改 → config 不随请求回写
		expect(Object.keys(put.body!).sort()).toEqual(['priority']);
		expect(put.body!.priority).toBe(42);
	}, 15000);

	it('update 改配置：PUT body = {config, priority} 键集精确（无 channel/provider/is_active）', async () => {
		listPayload = [
			{
				id: 'cfg-email',
				channel: 'email',
				provider: 'sendgrid',
				config: '***REDACTED***',
				isActive: true,
				priority: 5,
			},
		];
		renderPage();
		await waitFor(() => expect(captured.some((c) => c.method === 'get')).toBe(true));
		await openEmailTab();

		const configArea = document.querySelector('#email_config') as HTMLTextAreaElement;
		await waitFor(() => expect(configArea.value).toBe('***REDACTED***'));
		fireEvent.change(configArea, {
			target: { value: '{"host":"smtp2.example.com","port":587}' },
		});
		clickSave();

		await waitFor(() => expect(captured.some((c) => c.method === 'put')).toBe(true));
		const put = captured.find((c) => c.method === 'put')!;
		expect(put.url).toContain('/admin/communication/providers/cfg-email');
		expect(Object.keys(put.body!).sort()).toEqual(['config', 'priority']);
		expect(typeof put.body!.config).toBe('string');
		expect(JSON.parse(put.body!.config as string)).toEqual({
			host: 'smtp2.example.com',
			port: 587,
		});
		// priority 未改 → 回填值原样透传
		expect(put.body!.priority).toBe(5);
	}, 15000);
});
