// TASK-AB1-26（fix-admin-b1-guard-contract / A-164）：event-mappings 模板选择器数据源契约回归锁。
//
//   AC-AB1-47：选择器请求指向 `/admin/notifications/templates/available`（admin twin，不 403），
//              选项 value = 模板 code。
//
// 断言口径 = **最终 wire 请求**：捕获器装在 shared apiClient 的 axios adapter（请求拦截器之后最末环），
// 跑真实链路 page → hooks → apiClient → 拦截器（camel→snake / snake→camel）→ adapter；
// adapter 回写 wire 形状（snake）响应，与线上链路同构。
// wire 契约（实读）：service-notification router.go:238 adminRead twin（TASK-AB1-08 落地）；
// AvailableTemplateResponse 条目含 `code`（dto.go:887-898）——列表端点 TemplateResponse 无 code 字段。

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router';
import { apiClient } from '@autional/shared';
import EventMappingsPage from '../page';

vi.mock('@/lib/antd-app', () => ({ message: { success: vi.fn(), error: vi.fn() } }));

const AVAILABLE_URL = '/notification/api/v1/admin/notifications/templates/available';
const MAPPINGS_URL = '/notification/api/v1/admin/notifications/event-mappings';

interface CapturedCall {
	method: string;
	url: string;
	body?: Record<string, unknown>;
}

const captured: CapturedCall[] = [];
let originalAdapter: unknown;

/** wire 形状（snake）：AvailableTemplateResponse（code = 选择器 value 契约键）。 */
const RAW_AVAILABLE = [
	{
		code: 'welcome.v1',
		name: '欢迎邮件',
		channel: 'email',
		locale: 'zh-CN',
		source: 'platform',
		is_active: true,
		is_customized: false,
		subject: '欢迎',
		variables: [],
	},
	{
		code: 'billing.quota.warning.v1',
		name: '额度告警邮件',
		channel: 'email',
		locale: 'zh-CN',
		source: 'platform',
		is_active: true,
		is_customized: false,
		subject: '告警',
		variables: [],
	},
];

const dataEnvelope = (data: unknown) => ({
	code: 0,
	message: 'success',
	data,
	timestamp: '2026-10-04T00:00:00Z',
});

const listEnvelope = (items: unknown[]) => ({
	code: 0,
	message: 'success',
	items,
	total: items.length,
	pagination: { total: items.length, page: 1, page_size: 20, total_pages: 1, has_next: false },
	timestamp: '2026-10-04T00:00:00Z',
});

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
		if (url.includes(AVAILABLE_URL) && method === 'get') {
			data = listEnvelope(RAW_AVAILABLE);
		} else if (url.includes(MAPPINGS_URL) && method === 'get') {
			data = listEnvelope([]);
		} else {
			data = dataEnvelope({});
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
			<MemoryRouter>
				<EventMappingsPage />
			</MemoryRouter>
		</QueryClientProvider>,
	);
}

/** Modal 确定按钮（测试未挂 ConfigProvider，antd 默认 en locale = OK；兼容 zh 文本）。 */
function clickModalOk() {
	const ok = screen.getByRole('button', { name: /^(OK|确\s*定|确定)$/ });
	fireEvent.click(ok);
}

/** 在 antd v6 Select 中按唯一 option 文案选择（触发区 = .ant-select-content）。 */
async function selectOption(selectDomId: string, optionTitle: string) {
	const input = document.querySelector(`#${selectDomId}`) as HTMLInputElement;
	fireEvent.mouseDown(input.closest('.ant-select-content')!);
	const option = await waitFor(() => {
		const el = document.querySelector(`.ant-select-item-option[title="${optionTitle}"]`);
		expect(el).toBeTruthy();
		return el as HTMLElement;
	});
	fireEvent.click(option);
}

describe('event-mappings 模板选择器数据源（A-164）', () => {
	beforeEach(() => {
		captured.length = 0;
		installCaptureAdapter();
	});

	afterEach(() => {
		apiClient.defaults.adapter = originalAdapter as any;
	});

	it('AC-AB1-47：选择器请求指向 /admin/notifications/templates/available twin，选项按名称渲染', { timeout: 20000 }, async () => {
		renderPage();

		// 等页面数据链路启动（事件映射列表请求先至）
		await waitFor(
			() => expect(captured.some((c) => c.method === 'get' && c.url.includes(MAPPINGS_URL))).toBe(true),
			{ timeout: 15000 },
		);

		// 选择器数据源 = admin twin（RED 回显实际 URL 清单；旧缺陷指列表端点）
		const getUrls = captured.filter((c) => c.method === 'get').map((c) => c.url);
		expect(getUrls).toContain(AVAILABLE_URL);
		expect(getUrls.filter((u) => u.includes(AVAILABLE_URL))).toHaveLength(1);
		// 负断言：user 面同路径（无 /admin/ 前缀）零请求（admin 平面会 403）
		expect(
			getUrls.some((u) => u.includes('/notifications/templates/available') && !u.includes('/admin/')),
		).toBe(false);

		// 打开创建弹窗 → 模板选择器选项渲染（label = name）
		// 注：TASK-AB1-27 后 Form.Item name 为 camel 契约键，antd 生成 id = templateCode（旧 template_code）
		fireEvent.click(screen.getByText('创建映射'));
		await waitFor(() => expect(document.querySelector('#templateCode')).toBeTruthy());
		const input = document.querySelector('#templateCode') as HTMLInputElement;
		fireEvent.mouseDown(input.closest('.ant-select-content')!);
		await waitFor(() => {
			expect(document.querySelector('.ant-select-item-option[title="欢迎邮件"]')).toBeTruthy();
			expect(document.querySelector('.ant-select-item-option[title="额度告警邮件"]')).toBeTruthy();
		});
	});

	it('AC-AB1-47：选项 value = code —— 选中后提交 wire body template_code 为 code（非 name）', { timeout: 20000 }, async () => {
		renderPage();
		await waitFor(
			() => expect(captured.some((c) => c.method === 'get' && c.url.includes(AVAILABLE_URL))).toBe(true),
			{ timeout: 15000 },
		);

		fireEvent.click(screen.getByText('创建映射'));
		await waitFor(() => expect(document.querySelector('#eventType')).toBeTruthy());

		await selectOption('eventType', 'user.registered');
		await selectOption('templateCode', '欢迎邮件');

		clickModalOk();
		await waitFor(() => expect(captured.some((c) => c.method === 'post')).toBe(true));

		const post = captured.find((c) => c.method === 'post')!;
		expect(post.url).toContain(MAPPINGS_URL);
		expect(post.body!.event_type).toBe('user.registered');
		// 旧缺陷：tpl.code 恒 undefined → template_code 提交空/undefined
		expect(post.body!.template_code).toBe('welcome.v1');
	});
});
