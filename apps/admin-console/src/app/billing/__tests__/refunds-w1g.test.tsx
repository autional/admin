// W1g（A-407/A-408/A-409③④⑤⑥）AC-B5-W1g-08/09/10：退款审批页回归锁 ——
//   A-407：执行退款 wire 必填 `user_id`（ExecuteRefundRequest dto.go:619-630；旧空 body {} 必 400）
//   A-408：批准/拒绝二次确认（Popconfirm）——取消不发请求、确认才发（旧一键直发不可逆）
//   A-409④：金额 wire 全 CNY → ¥（A-292 $ 家族）
//   A-409⑥：状态筛选补 completed（旧 4 选项缺「已完成」）
// 断言口径 = 最终 wire 请求（adapter 捕获请求拦截器之后、snakeCase 之后）。
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent, cleanup, configure } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { apiClient } from '@autional/shared';
import BillingRefundsPage from '../refunds/page';

vi.mock('@/lib/antd-app', () => ({ message: { success: vi.fn(), error: vi.fn(), warning: vi.fn() } }));

configure({ asyncUtilTimeout: 15000 });

const REFUNDS_URL = '/billing/api/v1/admin/billing/refund-approvals';
const TS = '2026-10-06T00:00:00Z';
const PENDING_ID = 'rf_w1g_pending_01';
const APPROVED_ID = 'rf_w1g_approved_02';

interface CapturedCall {
	method: string;
	url: string;
	body?: Record<string, unknown>;
}

const captured: CapturedCall[] = [];
let originalAdapter: unknown;

// wire 形态（snake_case）——拦截器负责 camel 化，页面读 camel 键
const RAW_REFUNDS = [
	{
		id: PENDING_ID,
		tenant_id: 'tnt_w1g_rf01',
		invoice_number: 'INV-W1G-001',
		amount: '58',
		reason: '重复扣费',
		status: 'pending',
		requested_by: 'usr_req_01',
		created_at: TS,
	},
	{
		id: APPROVED_ID,
		tenant_id: 'tnt_w1g_rf02',
		invoice_number: 'INV-W1G-002',
		amount: '120',
		reason: '服务未交付',
		status: 'approved',
		requested_by: 'usr_req_02',
		approved_by: 'ops_01',
		created_at: TS,
	},
];

const listEnvelope = (items: unknown[]) => ({
	code: 0,
	message: 'success',
	items,
	total: items.length,
	pagination: { total: items.length, page: 1, page_size: 20, total_pages: 1, has_next: false },
	timestamp: TS,
});

const dataEnvelope = (data: unknown) => ({ code: 0, message: 'success', data, timestamp: TS });

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

		const data =
			url.includes(REFUNDS_URL) && method === 'get'
				? listEnvelope(RAW_REFUNDS)
				: dataEnvelope({});
		return { data, status: 200, statusText: 'OK', headers: {}, config };
	}) as any;
}

function renderPage() {
	const queryClient = new QueryClient({
		defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
	});
	return render(
		<QueryClientProvider client={queryClient}>
			<BillingRefundsPage />
		</QueryClientProvider>,
	);
}

/** antd v6：Select 触发区 = .ant-select-content（旧版 .ant-select-selector 已不存在）。 */
function selectContentByPlaceholder(placeholder: string): HTMLElement {
	const el = Array.from(
		document.querySelectorAll('.ant-select-content') as unknown as HTMLElement[],
	).find((s) => s.textContent?.includes(placeholder));
	expect(el).toBeTruthy();
	return el as HTMLElement;
}

/** Popconfirm 渲染于 body 传送门；按按钮文本定位（确定/取消）。
 *  注：antd Button 对两字中文文案自动插空格（'取 消'/'确 定'）→ 比较前去空白。 */
async function clickPopconfirmButton(label: string) {
	const btn = await waitFor(() => {
		const el = Array.from(document.querySelectorAll('.ant-popover button')).find(
			(b) => b.textContent?.replace(/\s+/g, '') === label,
		);
		expect(el).toBeTruthy();
		return el as HTMLElement;
	});
	fireEvent.click(btn);
}

describe('退款审批（A-407/A-408/A-409）', () => {
	beforeEach(() => {
		captured.length = 0;
		installCaptureAdapter();
	});

	afterEach(() => {
		cleanup();
		apiClient.defaults.adapter = originalAdapter as any;
	});

	it('AC-B5-W1g-10：金额 ¥ + 状态中文化（旧 $ + 英文原值 → 必红）', { timeout: 20000 }, async () => {
		renderPage();
		expect(await screen.findByText('¥58.00')).toBeTruthy();
		expect(await screen.findByText('¥120.00')).toBeTruthy();
		expect(screen.queryByText('$58.00')).toBeNull();
		// A-409③：状态标签单点映射（表格；旧裸显英文原值）
		expect(screen.getByText('待审批')).toBeTruthy();
		expect(screen.getByText('已批准')).toBeTruthy();
		expect(screen.queryByText('pending')).toBeNull();
	});

	it('AC-B5-W1g-10：状态筛选 5 选项含「已完成」（旧 4 选项缺 completed → 必红）', { timeout: 20000 }, async () => {
		renderPage();
		expect(await screen.findByText('¥58.00')).toBeTruthy();

		fireEvent.mouseDown(selectContentByPlaceholder('状态'));
		const completed = await waitFor(() => {
			const el = document.querySelector('.ant-select-item-option[title="已完成"]');
			expect(el).toBeTruthy();
			return el as HTMLElement;
		});
		expect(completed).toBeTruthy();
		expect(document.querySelector('.ant-select-item-option[title="已拒绝"]')).toBeTruthy();
		expect(document.querySelectorAll('.ant-select-item-option')).toHaveLength(5);
	});

	it('AC-B5-W1g-09：拒绝 → 二次确认取消 → 零请求（旧一键直发 → 必红）', { timeout: 20000 }, async () => {
		renderPage();
		expect(await screen.findByText('¥58.00')).toBeTruthy();

		fireEvent.click(screen.getByRole('button', { name: /拒绝/ }));
		expect(await screen.findByText('确认拒绝该退款申请？')).toBeTruthy();
		await clickPopconfirmButton('取消');

		await new Promise((r) => setTimeout(r, 60));
		expect(captured.filter((c) => c.method === 'post')).toHaveLength(0);
	});

	it('AC-B5-W1g-09：批准 → 二次确认确定 → POST /approve', { timeout: 20000 }, async () => {
		renderPage();
		expect(await screen.findByText('¥58.00')).toBeTruthy();

		fireEvent.click(screen.getByRole('button', { name: /批准/ }));
		expect(
			await screen.findByText('确认批准该退款申请？批准后将进入可执行打款状态'),
		).toBeTruthy();
		await clickPopconfirmButton('确定');

		await waitFor(() => expect(captured.some((c) => c.method === 'post')).toBe(true));
		const post = captured.find((c) => c.method === 'post')!;
		expect(post.url).toContain(`/refund-approval/${PENDING_ID}/approve`);
	});

	it('AC-B5-W1g-08：执行退款 wire 必填 user_id（旧空 body {} 必 400）', { timeout: 20000 }, async () => {
		renderPage();
		expect(await screen.findByText('¥120.00')).toBeTruthy();

		fireEvent.click(screen.getByRole('button', { name: /执行退款/ }));

		const input = await waitFor(() => {
			const el = document.querySelector('#userId') as HTMLInputElement;
			expect(el).toBeTruthy();
			return el;
		});
		fireEvent.change(input, { target: { value: 'usr_w1g_refund_01' } });
		const ok = screen.getByRole('button', { name: /^(OK|确\s*定|确定)$/ });
		fireEvent.click(ok);

		await waitFor(() => expect(captured.some((c) => c.method === 'post')).toBe(true));
		const post = captured.find((c) => c.method === 'post')!;
		expect(post.url).toContain(`/refund-approval/${APPROVED_ID}/execute`);
		expect(post.body).toEqual({ user_id: 'usr_w1g_refund_01' });
	});
});
