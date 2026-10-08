// W1d（A-185 · A-186 · A-187）：通信模板页回归锁 ——
//   A-186：服务端分页 + 筛选接线（page/page_size/channel/is_active/keyword 上 wire；筛选变更回第 1 页）
//   A-185：template-stats 死取数删——零死请求（旧实现挂载即发 → 必红）
//   A-187：渠道列本地化 + 停用语义（DELETE 实为停用：文案/确认/toast）+ 克隆弹窗 en-US 走 i18n
// 断言口径 = 最终 wire 请求/响应（axios adapter 最末环捕获，与线上链路同构）。
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent, cleanup, configure } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { apiClient } from '@autional/shared';
import CommunicationTemplatesPage from '../page';
import { message } from '@/lib/antd-app';

vi.mock('@/lib/antd-app', () => ({
	message: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
	modal: { confirm: vi.fn() },
}));

// W1c 全量并发加固：78 文件并跑满载时首用例取数可超 waitFor 默认 1s 预算。
configure({ asyncUtilTimeout: 15000 });

const LIST_URL = '/communication/api/v1/admin/communication/templates';
const TS = '2026-10-06T00:00:00Z';

interface Captured {
	method: string;
	url: string;
	params?: Record<string, unknown>;
}

const captured: Captured[] = [];
let originalAdapter: unknown;

/** wire 形状（snake）行：第 1 行 sms（渠道本地化断言用），共 10 条（total=25 → 3 页）。 */
const RAW_TEMPLATES = Array.from({ length: 10 }, (_, i) => ({
	id: i === 0 ? 'tpl-sms-1' : `tpl-${i + 1}`,
	code: i === 0 ? 'sms_otp' : `tpl_code_${i + 1}`,
	name: i === 0 ? '短信验证码' : `模板${i + 1}`,
	channel: i === 0 ? 'sms' : 'email',
	locale: 'zh-CN',
	is_active: true,
	version: 1,
	updated_at: '2026-01-01T00:00:00Z',
}));

function ok(payload: unknown, config: any) {
	return { data: payload, status: 200, statusText: 'OK', headers: {}, config };
}

function installCaptureAdapter() {
	captured.length = 0;
	originalAdapter = apiClient.defaults.adapter;
	apiClient.defaults.adapter = (async (config: any) => {
		const url = String(config.url || '');
		const method = String(config.method || 'get').toLowerCase();
		captured.push({ method, url, params: config.params as Record<string, unknown> | undefined });
		if (method === 'get' && url === LIST_URL) {
			return ok(
				{
					code: 0,
					message: 'ok',
					items: RAW_TEMPLATES,
					total: 25,
					pagination: { total: 25, page: 1, page_size: 10, total_pages: 3, has_next: true },
					timestamp: TS,
				},
				config,
			);
		}
		if (method === 'delete') {
			return ok({ code: 0, message: 'ok', data: {}, timestamp: TS }, config);
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
			<CommunicationTemplatesPage />
		</QueryClientProvider>,
	);
}

const listCalls = () => captured.filter((c) => c.method === 'get' && c.url === LIST_URL);

/** antd v6：Select 触发区 = .ant-select-content；按占位文案定位目标下拉。 */
function selectByPlaceholder(placeholder: string): HTMLElement {
	const el = Array.from(document.querySelectorAll('.ant-select-content') as unknown as HTMLElement[]).find(
		(s) => s.textContent?.includes(placeholder),
	);
	expect(el).toBeTruthy();
	return el as HTMLElement;
}

async function pickOption(trigger: HTMLElement, label: string) {
	fireEvent.mouseDown(trigger);
	const option = await waitFor(() => {
		const el = document.querySelector(`.ant-select-item-option[title="${label}"]`);
		expect(el).toBeTruthy();
		return el as HTMLElement;
	});
	fireEvent.click(option);
}

describe('通信模板页（A-185/A-186/A-187）', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		installCaptureAdapter();
	});

	afterEach(() => {
		cleanup();
		apiClient.defaults.adapter = originalAdapter as any;
	});

	it('AC-B5-W1d-19：首屏分页参 + 翻页发 page=2（旧实现无参 → 后端默认页截断）', { timeout: 20000 }, async () => {
		renderPage();
		expect(await screen.findByText('短信验证码')).toBeTruthy();

		await waitFor(() => expect(listCalls().length).toBeGreaterThan(0));
		expect(listCalls()[0].params).toMatchObject({ page: 1, page_size: 10 });

		expect(screen.getByTitle('2')).toBeTruthy();
		fireEvent.click(screen.getByTitle('2'));
		await waitFor(() => expect(listCalls().some((c) => c.params?.page === 2)).toBe(true));
	});

	it('AC-B5-W1d-19：三筛选上 wire（channel / is_active / keyword；变更一律回第 1 页）', { timeout: 20000 }, async () => {
		renderPage();
		expect(await screen.findByText('短信验证码')).toBeTruthy();

		// 渠道筛选 → channel=sms
		await pickOption(selectByPlaceholder('按渠道筛选'), '短信');
		await waitFor(() => expect(listCalls().some((c) => c.params?.channel === 'sms')).toBe(true));
		expect(listCalls().find((c) => c.params?.channel === 'sms')!.params).toMatchObject({
			page: 1,
			page_size: 10,
		});

		// 状态筛选 → is_active=true
		await pickOption(selectByPlaceholder('按状态筛选'), '启用');
		await waitFor(() => expect(listCalls().some((c) => c.params?.is_active === true)).toBe(true));

		// 关键词 → keyword（回车触发搜索）
		const searchInput = screen.getByPlaceholderText('搜索编码/名称');
		fireEvent.change(searchInput, { target: { value: '验证码' } });
		fireEvent.keyDown(searchInput, { key: 'Enter', code: 'Enter', keyCode: 13 });
		await waitFor(() => expect(listCalls().some((c) => c.params?.keyword === '验证码')).toBe(true));
		const keywordCall = listCalls().find((c) => c.params?.keyword === '验证码')!;
		expect(keywordCall.params).toMatchObject({ page: 1, page_size: 10, channel: 'sms', is_active: true });
	});

	it('AC-B5-W1d-18：零死请求（template-stats 全流程零命中；旧实现挂载即发 → 必红）', { timeout: 20000 }, async () => {
		renderPage();
		expect(await screen.findByText('短信验证码')).toBeTruthy();

		// 全流程（分页 + 筛选）后仍零 template-stats 请求
		fireEvent.click(screen.getByTitle('2'));
		await waitFor(() => expect(listCalls().some((c) => c.params?.page === 2)).toBe(true));
		expect(captured.filter((c) => c.url.includes('template-stats'))).toHaveLength(0);
		// 本页全部取数 = templates 列表一条通道
		expect(captured.filter((c) => c.method === 'get').every((c) => c.url === LIST_URL)).toBe(true);
	});

	it('AC-B5-W1d-20：渠道列本地化（sms → 短信）+ 停用语义（文案/确认/DELETE/toast）', { timeout: 20000 }, async () => {
		renderPage();
		expect(await screen.findByText('短信验证码')).toBeTruthy();

		// A-187：渠道列走 i18n（旧实现 v.toUpperCase() 恒英文 SMS）
		const table = document.querySelector('.ant-table') as HTMLElement;
		expect(table.textContent).toContain('短信');
		expect(table.textContent).not.toContain('SMS');

		// A-187：行操作文案 = 停用（旧「删除」措辞零残留）
		expect(screen.queryByText('删除')).toBeNull();
		const deactivateButtons = screen.getAllByText('停用');
		expect(deactivateButtons).toHaveLength(10);

		// 确认标题 = 停用语义（可恢复提示）
		fireEvent.click(deactivateButtons[0]);
		expect(
			await screen.findByText('确认停用该模板？（停用后不再用于发送，可编辑恢复启用）'),
		).toBeTruthy();

		// 确认 → DELETE（后端实为 is_active=false 停用）+ toast「已停用」
		const confirmBtn = document.querySelector('.ant-popconfirm .ant-btn-primary') as HTMLElement;
		expect(confirmBtn).toBeTruthy();
		fireEvent.click(confirmBtn);
		await waitFor(() => expect(captured.some((c) => c.method === 'delete')).toBe(true));
		expect(captured.find((c) => c.method === 'delete')!.url).toBe(`${LIST_URL}/tpl-sms-1`);
		await waitFor(() => expect(vi.mocked(message.success)).toHaveBeenCalledWith('已停用'));
	});

	it('AC-B5-W1d-20：克隆弹窗——en-US 走 i18n 键 + 原样复制提示（旧硬编码英文串 → 键值可达）', { timeout: 20000 }, async () => {
		renderPage();
		expect(await screen.findByText('短信验证码')).toBeTruthy();

		fireEvent.click(screen.getAllByText('复制语言')[0]);
		expect(await screen.findByText('复制到其他语言')).toBeTruthy();
		// extra 提示：内容原样复制（不翻译）
		expect(screen.getByText('内容将原样复制（不翻译），可在目标语言下继续编辑')).toBeTruthy();

		// 目标语言下拉：en-US 选项可达（langEnUS i18n 键）
		const modalSelect = Array.from(document.querySelectorAll('.ant-select-content') as unknown as HTMLElement[]).find(
			(s) => s.closest('.ant-modal'),
		);
		expect(modalSelect).toBeTruthy();
		fireEvent.mouseDown(modalSelect!);
		const option = await waitFor(() => {
			const el = document.querySelector('.ant-select-item-option[title="英语 (en-US)"]');
			expect(el).toBeTruthy();
			return el as HTMLElement;
		});
		expect(option).toBeTruthy();
	});
});
