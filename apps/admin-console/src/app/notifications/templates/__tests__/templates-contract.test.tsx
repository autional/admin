// TASK-AB1-25（fix-admin-b1-guard-contract / A-151 · A-155）：通知模板链表单契约回归锁。
//
// AC-AB1-45：创建表单提交体 ∈ CreateTemplateRequest 必填集 {code,name,type,subject,content}
//            （zod 先行 + 请求体键集断言，无 contentZh/contentEn 键）。
// AC-AB1-46：en 路径发出恰 1 次 create + 1 次 clone-to-locale（target_locale=en-US，调用序断言）。
// 附带：A-155 行内「克隆到语言」UI 存在且以真实 template_id 调 clone 端点。
//
// 断言口径 = **最终请求体**：捕获器装在 shared apiClient 的 axios adapter（请求拦截器之后最末环），
// 跑真实链路 page → hooks → generated api → 拦截器 → adapter；adapter 回写 wire 形状（snake）响应
// 由响应拦截器深 camel 化，与线上链路同构（create 响应 template_id → 克隆 URL 的 id 亦被行测）。

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { apiClient } from '@autional/shared';
import { message } from '@/lib/antd-app';
import NotificationTemplatesPage from '../page';

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
let listItems: Array<Record<string, unknown>> = [];
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
		if (method === 'get') {
			data = { code: 0, message: 'ok', data: { items: listItems, total: listItems.length } };
		} else if (url.includes('clone-to-locale')) {
			// wire 形状：template_id 由响应拦截器深 camel 化
			data = { code: 0, message: 'ok', data: { template_id: 'tpl-new-1-en-US' } };
		} else if (url.includes('/templates')) {
			data = { code: 0, message: 'ok', data: { template_id: 'tpl-new-1', name: '欢迎通知' } };
		} else {
			data = { code: 0, message: 'ok', data: {} };
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
			<NotificationTemplatesPage />
		</QueryClientProvider>,
	);
}

async function waitForListLoad() {
	await waitFor(() => expect(captured.some((c) => c.method === 'get')).toBe(true));
}

function fill(id: string, value: string) {
	fireEvent.change(document.querySelector(`#${id}`)! as HTMLInputElement, { target: { value } });
}

function openCreateModal() {
	fireEvent.click(screen.getByText('创建模板'));
}

/** Modal 确定按钮（测试未挂 ConfigProvider，antd 默认 en locale = OK；兼容 zh 文本）。 */
function clickModalOk() {
	const ok = screen.getByRole('button', { name: /^(OK|确\s*定|确定)$/ });
	fireEvent.click(ok);
}

const cloneCalls = () => captured.filter((c) => c.url.includes('clone-to-locale'));
const createCalls = () => captured.filter((c) => c.method === 'post' && c.url.endsWith('/templates'));

describe('NotificationTemplatesPage 表单契约（A-151/A-155）', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		captured.length = 0;
		listItems = [];
		installCaptureAdapter();
	});

	afterEach(() => {
		apiClient.defaults.adapter = originalAdapter as any;
	});

	it('create（zh）：请求体 = CreateTemplateRequest 必填集，无 contentZh/contentEn/channel 键', async () => {
		renderPage();
		await waitForListLoad();
		openCreateModal();

		fill('code', 'welcome_notification');
		fill('name', '欢迎通知');
		fill('subject', '欢迎加入');
		fill('content', '亲爱的用户，欢迎加入！');
		clickModalOk();

		await waitFor(() => expect(createCalls()).toHaveLength(1));
		const post = createCalls()[0];
		expect(post.url).toContain('/notification/api/v1/admin/notifications/templates');
		// AC-AB1-45：最终请求体键集精确 = {code,name,type,subject,content}
		expect(Object.keys(post.body!).sort()).toEqual(['code', 'content', 'name', 'subject', 'type']);
		expect(post.body!.code).toBe('welcome_notification');
		expect(post.body!.name).toBe('欢迎通知');
		expect(post.body!.type).toBe('system');
		expect(post.body!.subject).toBe('欢迎加入');
		expect(post.body!.content).toBe('亲爱的用户，欢迎加入！');
		// 旧缺陷键零残留（缺 4 个必填键 + 发明键 ⇒ 必 400）
		expect(post.body).not.toHaveProperty('contentZh');
		expect(post.body).not.toHaveProperty('contentEn');
		expect(post.body).not.toHaveProperty('channel');
		// en 未填 ⇒ 不发克隆
		expect(cloneCalls()).toHaveLength(0);
	});

	it('create（en 两步）：恰 1 次 create + 1 次 clone-to-locale（target_locale=en-US，调用序）', async () => {
		renderPage();
		await waitForListLoad();
		openCreateModal();

		fill('code', 'welcome_notification');
		fill('name', '欢迎通知');
		fill('subject', '欢迎加入');
		fill('content', '亲爱的用户，欢迎加入！');
		// 切到 en-US 页签（非激活页签懒挂载，须先切）
		fireEvent.click(screen.getByText('英语 (en-US)'));
		fill('enTitle', 'Welcome');
		fill('enContent', 'Dear user, welcome!');
		clickModalOk();

		await waitFor(() => expect(cloneCalls()).toHaveLength(1));
		// AC-AB1-46：调用序 = 先 create 后 clone，且各恰一次
		expect(createCalls()).toHaveLength(1);
		expect(captured.indexOf(createCalls()[0])).toBeLessThan(captured.indexOf(cloneCalls()[0]));
		// 克隆用 create 响应的 template_id（wire snake → 响应拦截器 camel → 提取）
		expect(cloneCalls()[0].url).toContain('/templates/tpl-new-1/clone-to-locale');
		expect(cloneCalls()[0].method).toBe('post');
		// 体 = CloneTemplateToLocaleRequest{target_locale,title,content}（targetLocale 经请求拦截器转 snake）
		expect(Object.keys(cloneCalls()[0].body!).sort()).toEqual(['content', 'target_locale', 'title']);
		expect(cloneCalls()[0].body!.target_locale).toBe('en-US');
		expect(cloneCalls()[0].body!.title).toBe('Welcome');
		expect(cloneCalls()[0].body!.content).toBe('Dear user, welcome!');
		// 创建体仍为必填集（en 字段不上创建体）
		expect(Object.keys(createCalls()[0].body!).sort()).toEqual([
			'code',
			'content',
			'name',
			'subject',
			'type',
		]);
	});

	it('zod 先行：name 超限被 zod 拦截（antd 仅 required 放行），零请求发出', async () => {
		renderPage();
		await waitForListLoad();
		openCreateModal();

		fill('code', 'welcome_notification');
		fill('name', 'x'.repeat(200)); // antd 无长度规则 → 进入 onFinish 后由 zod 判失败
		fill('subject', '欢迎加入');
		fill('content', '正文');
		clickModalOk();

		await waitFor(() => expect(vi.mocked(message.error)).toHaveBeenCalled());
		expect(captured.filter((c) => c.method === 'post')).toHaveLength(0);
	});

	it('克隆到语言（A-155 行操作）：UI 存在，以真实 template_id 调 clone 端点且默认目标 en-US', async () => {
		listItems = [
			{
				template_id: 'tpl-1',
				name: '欢迎通知',
				type: 'system',
				subject: '欢迎加入',
				content: '正文',
				created_at: '2026-01-01T00:00:00Z',
			},
		];
		renderPage();
		fireEvent.click(await screen.findByText('克隆到语言'));

		const targetInput = document.querySelector('#targetLocale') as HTMLInputElement;
		expect(targetInput.value).toBe('en-US');
		fill('title', 'Welcome');
		fill('content', 'Body EN');
		clickModalOk();

		await waitFor(() => expect(cloneCalls()).toHaveLength(1));
		expect(cloneCalls()[0].url).toContain('/templates/tpl-1/clone-to-locale');
		expect(Object.keys(cloneCalls()[0].body!).sort()).toEqual(['content', 'target_locale', 'title']);
		expect(cloneCalls()[0].body!.target_locale).toBe('en-US');
		expect(cloneCalls()[0].body!.title).toBe('Welcome');
		expect(cloneCalls()[0].body!.content).toBe('Body EN');
	});
});
