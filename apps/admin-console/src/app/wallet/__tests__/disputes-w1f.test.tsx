// W1f-32（A-374④/A-375①）回归锁 —— 争议处理（/wallet/disputes）：
//   A-375①：状态筛选控件（旧无）⇒ 选中即上行 wire ?status=... + queryKey 含 status（缓存键可分辨）。
//   A-374④：服务端分页（旧零参 + 本地 10/页伪全量）⇒ page/page_size 上行 + 服务端 total 驱动页数。
//   A-374③：usePageTitle 接线（旧 tab 恒「Autional 管理控制台」）。
// 断言口径 = 最终 wire 请求参数/次数（adapter 捕获，请求拦截器之后）+ queryCache 键 + document.title。
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent, cleanup, configure } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { apiClient } from '@autional/shared';
import WalletDisputesPage from '../disputes/page';

vi.mock('@/lib/antd-app', () => ({
	message: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
	modal: { confirm: vi.fn() },
}));

vi.mock('@autional/shared', async (importOriginal) => ({
	...(await importOriginal<typeof import('@autional/shared')>()),
	useCurrentTenantId: () => 'tnt_w1f_dispute01',
}));

configure({ asyncUtilTimeout: 15000 });

const TS = '2026-10-06T00:00:00Z';
const TENANT = 'tnt_w1f_dispute01';
const DISPUTES_URL = `/wallet/api/v1/admin/wallets/tenants/${TENANT}/disputes`;

interface CapturedCall {
	method: string;
	url: string;
	params?: Record<string, unknown>;
}

const captured: CapturedCall[] = [];
let originalAdapter: unknown;

const RAW_DISPUTES = Array.from({ length: 10 }, (_, i) => ({
	id: `dsp_w1f_${String(i + 1).padStart(2, '0')}`,
	transaction_id: `tx_w1f_${i + 1}`,
	user_id: `u_w1f_${i + 1}`,
	reason: 'amount mismatch',
	status: i === 0 ? 'pending' : 'resolved',
	created_at: TS,
}));

function installAdapter() {
	originalAdapter = apiClient.defaults.adapter;
	apiClient.defaults.adapter = (async (config: any) => {
		const method = String(config.method || 'get').toLowerCase();
		const url = String(config.url || '');
		captured.push({ method, url, params: config.params });

		if (method === 'get' && url === DISPUTES_URL) {
			return {
				data: {
					code: 0,
					message: 'success',
					items: RAW_DISPUTES,
					total: 25,
					pagination: {
						total: 25,
						page: Number(config.params?.page ?? 1),
						page_size: 10,
						total_pages: 3,
						has_next: true,
					},
					timestamp: TS,
				},
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

let queryClient: QueryClient;

function renderPage() {
	queryClient = new QueryClient({
		defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
	});
	return render(
		<QueryClientProvider client={queryClient}>
			<WalletDisputesPage />
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

describe('争议处理（A-374④/A-375①）', () => {
	beforeEach(() => {
		captured.length = 0;
		installAdapter();
	});

	afterEach(() => {
		cleanup();
		apiClient.defaults.adapter = originalAdapter as any;
	});

	it(
		'AC-B5-W1f-34/35：A-374④ page/page_size 上行 + total=25 驱动 3 页 + A-374③ 标题',
		{ timeout: 20000 },
		async () => {
			renderPage();
			expect(await screen.findByText('dsp_w1f_01')).toBeTruthy();

			// A-374④：首拉 wire page=1 & page_size=10（旧零参上行 ⇒ 必红）
			await waitFor(() => {
				const calls = captured.filter((c) => c.method === 'get' && c.url === DISPUTES_URL);
				expect(calls.length).toBeGreaterThanOrEqual(1);
				expect(calls[0].params).toMatchObject({ page: 1, page_size: 10 });
			});

			// A-374③：tab 标题接线（旧恒「Autional 管理控制台」）
			await waitFor(() => expect(document.title).toContain('争议处理'));

			// 服务端 total=25 被消费：旧本地分页 total=items.length=10 → 只有 1 页
			await waitFor(() => {
				expect(document.querySelector('.ant-pagination-item[title="3"]')).toBeTruthy();
			});

			// 翻页 → 第二次请求带 page=2（受控分页上行）
			const page2 = document.querySelector('.ant-pagination-item[title="2"]') as HTMLElement;
			expect(page2).toBeTruthy();
			fireEvent.click(page2);
			await waitFor(() => {
				const calls = captured.filter((c) => c.method === 'get' && c.url === DISPUTES_URL);
				expect(calls.length).toBeGreaterThanOrEqual(2);
				expect(calls[calls.length - 1].params).toMatchObject({ page: 2, page_size: 10 });
			});
		},
	);

	it(
		'AC-B5-W1f-35：A-375① 状态筛选上行 wire ?status=pending + queryKey 含 status + 页回 1',
		{ timeout: 20000 },
		async () => {
			renderPage();
			expect(await screen.findByText('dsp_w1f_01')).toBeTruthy();

			// 先翻到第 2 页（验证筛选会把页码回 1）
			await waitFor(() => {
				expect(document.querySelector('.ant-pagination-item[title="2"]')).toBeTruthy();
			});
			fireEvent.click(document.querySelector('.ant-pagination-item[title="2"]') as HTMLElement);
			await waitFor(() => {
				const calls = captured.filter((c) => c.method === 'get' && c.url === DISPUTES_URL);
				expect(calls[calls.length - 1].params).toMatchObject({ page: 2 });
			});

			// A-375①：筛选控件（旧无）→ 选「待处理」
			fireEvent.mouseDown(selectContentByPlaceholder('争议状态'));
			const option = await waitFor(() => {
				const el = document.querySelector('.ant-select-item-option[title="待处理"]');
				expect(el).toBeTruthy();
				return el as HTMLElement;
			});
			fireEvent.click(option);

			// wire：status 上行 + page 回 1（旧实现零筛选控件 ⇒ 必红）
			await waitFor(() => {
				const calls = captured.filter((c) => c.method === 'get' && c.url === DISPUTES_URL);
				expect(calls[calls.length - 1].params).toMatchObject({
					status: 'pending',
					page: 1,
					page_size: 10,
				});
			});

			// queryKey 含 status（缓存键可分辨；旧 queryKey 仅 tenantId 前缀）
			const keys = queryClient.getQueryCache().getAll().map((q) => JSON.stringify(q.queryKey));
			expect(keys.some((k) => k.includes('"status":"pending"'))).toBe(true);
		},
	);
});
