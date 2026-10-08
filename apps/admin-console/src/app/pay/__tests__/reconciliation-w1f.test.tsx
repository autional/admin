// W1f-31（A-349/A-351）回归锁 —— 对账管理（/pay/reconciliation）：
//   A-349：①四卡口径 = 当前筛选范围内历史累计行数（非「当前状况」）⇒ 页面累计注记上屏；
//          ②「执行对账」后端无幂等（重复执行对同一支付重复 INSERT）⇒ 在途双击恰 1 发 POST；
//          ③删除 UI 补位（DELETE 端点 router.go:135 早已存在、零 UI 入口）⇒ Popconfirm 取消 0 发 / 确认恰 1 发。
//   A-351①：usePageTitle 接线（旧 tab 恒「Autional 管理控制台」）；④从未对账 vs 筛选无果空态区分
//          （②locale / ③后端历史无分页上限残余登记于 w1f-record）。
// 断言口径 = 最终 wire 请求参数/次数（adapter 捕获，请求拦截器之后）+ 渲染文案。
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent, cleanup, configure } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { apiClient } from '@autional/shared';
import { message } from '@/lib/antd-app';
import PayReconciliationPage from '../reconciliation/page';

vi.mock('@/lib/antd-app', () => ({
	message: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
	modal: { confirm: vi.fn() },
}));

vi.mock('@autional/shared', async (importOriginal) => ({
	...(await importOriginal<typeof import('@autional/shared')>()),
	useCurrentTenantId: () => 'tnt_w1f_recon01',
}));

configure({ asyncUtilTimeout: 15000 });

const TS = '2026-10-06T00:00:00Z';

const HISTORY_URL = '/pay/api/v1/admin/payments/reconciliation/history';
const RUN_URL = '/pay/api/v1/admin/payments/reconciliation';
const deleteUrl = (id: string) => `/pay/api/v1/admin/payments/reconciliation/${id}`;

interface CapturedCall {
	method: string;
	url: string;
	params?: Record<string, unknown>;
}

const captured: CapturedCall[] = [];
let originalAdapter: unknown;
let emptyHistory = false;
let deferRun = false;
let releaseRun: (() => void) | null = null;

const RAW_RECORDS = [
	{
		id: 'recon_w1f_01',
		channel: 'wechat',
		gateway_ref: 'gw_r1',
		gateway_amount: '100',
		internal_ref: 'in_r1',
		internal_amount: '100',
		diff_amount: '0',
		status: 'matched',
		reconciled_at: TS,
	},
	{
		id: 'recon_w1f_02',
		channel: 'alipay',
		gateway_ref: 'gw_r2',
		gateway_amount: '200',
		internal_ref: 'in_r2',
		internal_amount: '200',
		diff_amount: '0',
		status: 'matched',
		reconciled_at: TS,
	},
];

function installAdapter() {
	originalAdapter = apiClient.defaults.adapter;
	apiClient.defaults.adapter = (async (config: any) => {
		const method = String(config.method || 'get').toLowerCase();
		const url = String(config.url || '');
		captured.push({ method, url, params: config.params });

		if (method === 'get' && url === HISTORY_URL) {
			return {
				data: { code: 0, message: 'success', data: emptyHistory ? [] : RAW_RECORDS, timestamp: TS },
				status: 200,
				statusText: 'OK',
				headers: {},
				config,
			};
		}
		if (method === 'post' && url === RUN_URL) {
			if (deferRun) {
				await new Promise<void>((resolve) => {
					releaseRun = resolve;
				});
			}
			return {
				data: {
					code: 0,
					message: 'success',
					data: { items: 1, matched: 1, mismatch: 0, total: 1 },
					timestamp: TS,
				},
				status: 200,
				statusText: 'OK',
				headers: {},
				config,
			};
		}
		if (method === 'delete' && url.startsWith('/pay/api/v1/admin/payments/reconciliation/')) {
			return {
				data: { code: 0, message: 'success' },
				status: 200,
				statusText: 'OK',
				headers: {},
				config,
			};
		}
		return {
			data: { code: 0, message: 'success', data: {}, timestamp: TS },
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
			<PayReconciliationPage />
		</QueryClientProvider>,
	);
}

/** 可见 Popconfirm（关闭后停留 DOM 的旧实例带 ant-popover-hidden，须排除）。 */
function visiblePopconfirm(): HTMLElement | null {
	return document.querySelector('.ant-popconfirm:not(.ant-popover-hidden)') as HTMLElement | null;
}

/** Popconfirm 按钮按文本定位（antd 对两字中文自动插空格 '确 定' → 比较前去空白）。 */
async function clickPopconfirmButton(label: string) {
	const btn = await waitFor(() => {
		const el = Array.from(
			document.querySelectorAll('.ant-popconfirm:not(.ant-popover-hidden) button'),
		).find((b) => b.textContent?.replace(/\s+/g, '') === label);
		expect(el).toBeTruthy();
		return el as HTMLElement;
	});
	fireEvent.click(btn);
}

/** antd v6：Select 触发区 = .ant-select-content（旧版 .ant-select-selector 已不存在）。 */
function selectContentByPlaceholder(placeholder: string): HTMLElement {
	const el = Array.from(
		document.querySelectorAll('.ant-select-content') as unknown as HTMLElement[],
	).find((s) => s.textContent?.includes(placeholder));
	expect(el).toBeTruthy();
	return el as HTMLElement;
}

describe('对账管理（A-349/A-351）', () => {
	beforeEach(() => {
		captured.length = 0;
		emptyHistory = false;
		deferRun = false;
		releaseRun = null;
		installAdapter();
	});

	afterEach(() => {
		cleanup();
		apiClient.defaults.adapter = originalAdapter as any;
	});

	it(
		'AC-B5-W1f-26/28：A-349 删除守卫（取消 0 发 / 确认恰 1 发）+ 累计注记 + A-351① 标题',
		{ timeout: 20000 },
		async () => {
			renderPage();
			expect(await screen.findByText('recon_w1f_01')).toBeTruthy();

			// A-349①：四卡口径注记（旧四卡读作「当前状况」实为历年累计行数）
			expect(
				screen.getByText('统计为当前筛选范围内的历史累计记录数（含重复对账行）'),
			).toBeTruthy();
			// A-351①：tab 标题接线
			await waitFor(() => expect(document.title).toContain('对账管理'));

			const deletes = () => captured.filter((c) => c.method === 'delete');
			const row1 = document.querySelector('tr[data-row-key="recon_w1f_01"]') as HTMLElement;
			expect(row1).toBeTruthy();
			const delBtn = Array.from(row1.querySelectorAll('button')).find(
				(b) => b.textContent?.replace(/\s+/g, '') === '删除',
			);
			expect(delBtn).toBeTruthy();

			// 打开 → 取消：零 DELETE
			fireEvent.click(delBtn as HTMLButtonElement);
			await waitFor(() => {
				expect(visiblePopconfirm()?.textContent).toContain('确定删除此对账记录？');
			});
			await clickPopconfirmButton('取消');
			await new Promise((r) => setTimeout(r, 100));
			expect(deletes().length).toBe(0);

			// 打开 → 确认：恰 1 发 DELETE（旧零 UI 入口 ⇒ 必红）
			fireEvent.click(delBtn as HTMLButtonElement);
			await waitFor(() => {
				expect(visiblePopconfirm()?.textContent).toContain('确定删除此对账记录？');
			});
			await clickPopconfirmButton('确定');
			await waitFor(() => {
				expect(deletes().length).toBe(1);
			});
			expect(deletes()[0].url).toBe(deleteUrl('recon_w1f_01'));
			await waitFor(() => {
				expect(message.success).toHaveBeenCalled();
			});
		},
	);

	it(
		'AC-B5-W1f-26：A-349 执行对账在途双击恰 1 发 POST',
		{ timeout: 20000 },
		async () => {
			deferRun = true;
			renderPage();
			expect(await screen.findByText('recon_w1f_01')).toBeTruthy();

			const runBtn = Array.from(document.querySelectorAll('button')).find(
				(b) => b.textContent?.replace(/\s+/g, '') === '执行对账',
			);
			expect(runBtn).toBeTruthy();

			const posts = () => captured.filter((c) => c.method === 'post' && c.url === RUN_URL);
			// 在途双击（后端无幂等 ⇒ 第二发即重复行）
			fireEvent.click(runBtn as HTMLButtonElement);
			fireEvent.click(runBtn as HTMLButtonElement);
			await waitFor(() => {
				expect(posts().length).toBe(1);
			});
			// 留一拍复核（若第二击穿透，此处已变 2）
			await new Promise((r) => setTimeout(r, 80));
			expect(posts().length).toBe(1);

			// 放行在途请求收尾
			releaseRun?.();
			await waitFor(() => {
				expect(posts().length).toBe(1);
			});
		},
	);

	it(
		'AC-B5-W1f-28：A-351④ 从未对账 vs 筛选无果空态区分 + 筛选参数上行',
		{ timeout: 20000 },
		async () => {
			emptyHistory = true;
			renderPage();

			// 从未对账（无筛选）——旧实现与筛选无果同为「暂无数据」
			expect(await screen.findByText('尚未执行过对账')).toBeTruthy();

			// 选渠道筛选 → 无果空态切换
			fireEvent.mouseDown(selectContentByPlaceholder('渠道'));
			const option = await waitFor(() => {
				const el = document.querySelector('.ant-select-item-option[title="微信"]');
				expect(el).toBeTruthy();
				return el as HTMLElement;
			});
			fireEvent.click(option);

			expect(await screen.findByText('当前筛选条件下无对账记录')).toBeTruthy();
			expect(screen.queryByText('尚未执行过对账')).toBeNull();
			await waitFor(() => {
				const calls = captured.filter((c) => c.method === 'get' && c.url === HISTORY_URL);
				expect(calls[calls.length - 1].params).toMatchObject({ channel: 'wechat' });
			});
		},
	);
});
