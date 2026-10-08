// W1d（A-175 · A-176）：广播通知页回归锁 ——
//   A-175：全租户不可撤回群发——二次确认（modal.confirm 含内容预览）；取消零发送 / 确认单发
//          + 回执 toast 含接收人数与 broadcast ID（原点击即发、ID 随 toast 丢弃）
//   A-176：type 补 user 选项（后端 enum 第 5 值；下拉 option + 说明卡均可达）
// 断言口径 = modal.confirm 调用参数 + 最终 wire POST（adapter 最末环捕获）+ message.success 实参。
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent, cleanup, act, configure } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { apiClient } from '@autional/shared';
import BroadcastPage from '../broadcast/page';
import { message, modal } from '@/lib/antd-app';

vi.mock('@/lib/antd-app', () => ({
	message: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
	modal: { confirm: vi.fn() },
}));

// W1c 全量并发加固。
configure({ asyncUtilTimeout: 15000 });

const BROADCAST_URL = '/notification/api/v1/admin/notifications/broadcast';
const TS = '2026-10-06T00:00:00Z';

interface Captured {
	method: string;
	url: string;
	body?: Record<string, unknown>;
}

const captured: Captured[] = [];
let originalAdapter: unknown;

function ok(payload: unknown, config: any) {
	return { data: payload, status: 200, statusText: 'OK', headers: {}, config };
}

function installCaptureAdapter() {
	captured.length = 0;
	originalAdapter = apiClient.defaults.adapter;
	apiClient.defaults.adapter = (async (config: any) => {
		const url = String(config.url || '');
		const method = String(config.method || 'get').toLowerCase();
		let body: Record<string, unknown> | undefined;
		if (typeof config.data === 'string' && config.data.length > 0) {
			body = JSON.parse(config.data);
		} else if (config.data && typeof config.data === 'object') {
			body = config.data as Record<string, unknown>;
		}
		captured.push({ method, url, body });
		if (url === BROADCAST_URL) {
			return ok({ code: 0, message: 'ok', data: { recipients: 5, broadcast_id: 'bc-1' }, timestamp: TS }, config);
		}
		return ok({ code: 0, message: 'ok', data: {}, timestamp: TS }, config);
	}) as any;
}

function renderPage() {
	const queryClient = new QueryClient({
		defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
	});
	return render(
		<QueryClientProvider client={queryClient}>
			<BroadcastPage />
		</QueryClientProvider>,
	);
}

function fillForm() {
	fireEvent.change(document.querySelector('#title') as HTMLInputElement, {
		target: { value: '系统维护通知' },
	});
	fireEvent.change(document.querySelector('#content') as HTMLTextAreaElement, {
		target: { value: '今晚 22:00 起进行维护，请提前保存工作。' },
	});
}

function clickSend() {
	fireEvent.click(screen.getByRole('button', { name: /发送广播/ }));
}

const posts = () => captured.filter((c) => c.method === 'post');

describe('广播通知页（A-175/A-176）', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		installCaptureAdapter();
	});

	afterEach(() => {
		cleanup();
		apiClient.defaults.adapter = originalAdapter as any;
	});

	it('AC-B5-W1d-13：点击只弹二次确认（含标题/确认词），不调用 onOk 前零发送', async () => {
		renderPage();
		fillForm();
		clickSend();

		await waitFor(() => expect(vi.mocked(modal.confirm)).toHaveBeenCalledTimes(1));
		const opts = vi.mocked(modal.confirm).mock.calls[0][0] as {
			title: string;
			okText?: string;
			content?: unknown;
			onOk?: unknown;
		};
		expect(opts.title).toBe('确认发送全租户广播？');
		expect(opts.okText).toBe('发送广播');
		expect(opts.content).toBeTruthy();
		expect(typeof opts.onOk).toBe('function');
		// 取消（不触发 onOk）⇒ 零 POST
		expect(posts()).toHaveLength(0);
	});

	it('AC-B5-W1d-13：确认后单发（恰 1 次 POST，体=表单值）+ 回执 toast 含人数与 ID', { timeout: 20000 }, async () => {
		renderPage();
		fillForm();
		clickSend();

		await waitFor(() => expect(vi.mocked(modal.confirm)).toHaveBeenCalledTimes(1));
		const opts = vi.mocked(modal.confirm).mock.calls[0][0] as { onOk: () => Promise<void> };

		await act(async () => {
			await opts.onOk();
		});

		await waitFor(() => expect(posts()).toHaveLength(1));
		expect(posts()[0].url).toBe(BROADCAST_URL);
		expect(posts()[0].body).toMatchObject({
			title: '系统维护通知',
			type: 'system',
			content: '今晚 22:00 起进行维护，请提前保存工作。',
		});
		// A-175：回执含接受人数与 broadcast ID（原 ID 丢弃）
		expect(vi.mocked(message.success)).toHaveBeenCalledWith('广播已发送，接收人数: 5（ID: bc-1）');
	});

	it('AC-B5-W1d-14：type 下拉含 user 选项 + 说明卡呈现用户通知语义', async () => {
		renderPage();

		// 说明卡：用户通知条目（strong 标签 + desc 文案同 li）
		const userStrong = await screen.findByText('用户通知', { selector: 'strong' });
		expect(userStrong.closest('li')!.textContent).toContain('定向用户消息，用户可在通知中心查看');

		// 下拉展开：user option 可达（title 定位；旧实现 4 值缺 user）
		const selectContent = document.querySelector('.ant-select-content') as HTMLElement;
		expect(selectContent).toBeTruthy();
		fireEvent.mouseDown(selectContent);
		const option = await waitFor(() => {
			const el = document.querySelector('.ant-select-item-option[title="用户通知"]');
			expect(el).toBeTruthy();
			return el as HTMLElement;
		});
		expect(option).toBeTruthy();
	});
});
