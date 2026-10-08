// W1a · A-52（AC-B5-W1a-16）：api-keys 服务端分页/筛选 wire 契约锁。
//
// 旧实现：无参调用 getApiKeys()（后端默认 page_size=20 截断家族）、无筛选、分页纯客户端切片（翻页零请求）。
// 新契约：page/page_size 经 toPageParams 单点转 wire snake；status/environment/search 筛选透传；
// 翻页/筛选均发新请求且响应行上屏。
//
// 反假绿：
//   ① 旧代码无 page 参数 → 键集断言必红；
//   ② 旧代码点第 2 页零请求（客户端切片）→ 二次请求断言必红；
//   ③ 第 2 页响应不同行（key-p2）→ 旧代码收不到该行 → 渲染断言必红。

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent, cleanup } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { apiClient, useAuthStore } from '@autional/shared';
import ApiKeysPage from '../api-keys/page';

// antd v6 命令式 API 桩化（仓内既有模式）
vi.mock('@/lib/antd-app', () => ({
	message: { success: vi.fn(), error: vi.fn() },
}));

const KEYS_URL = '/identity/api/v1/auth/api-keys';

/** wire 形状（snake）行夹具 —— 拦截器链路会 camel 化。 */
function rawKeyRow(page: number) {
	return {
		id: `key-p${page}`,
		name: `page-${page} key`,
		scopes: ['read'],
		status: 'active',
		environment: 'live',
		usage_count: page,
		last_used_at: '2026-10-01T00:00:00Z',
		last_used_ip: '10.0.0.1',
		expires_at: null,
		created_at: '2026-10-01T00:00:00Z',
	};
}

interface Captured {
	url: string;
	method: string;
	params: any;
}

let captured: Captured[] = [];
let originalAdapter: unknown;

function ok(payload: unknown, config: any) {
	return { data: payload, status: 200, statusText: 'OK', headers: {}, config };
}

function installCaptureAdapter() {
	captured = [];
	originalAdapter = apiClient.defaults.adapter;
	apiClient.defaults.adapter = (async (config: any) => {
		const url = String(config.url || '');
		const ts = '2026-10-06T00:00:00Z';
		captured.push({ url, method: String(config.method || 'get').toLowerCase(), params: config.params });
		if (url === KEYS_URL) {
			// 服务端分页按请求 page 回不同行（total=42 → 5 页；第 2 页行与第 1 页不同）
			const page = Number(config.params?.page ?? 1);
			return ok({ code: 0, message: 'success', items: [rawKeyRow(page)], total: 42, timestamp: ts }, config);
		}
		return ok({ code: 0, message: 'success', items: [], total: 0, timestamp: ts }, config);
	}) as any;
}

function keysCalls() {
	return captured.filter((c) => c.url === KEYS_URL && c.method === 'get');
}

function resetAuthStore(): void {
	// 清空 token 防请求拦截器「预判式 Token 刷新」假阴性（仓内既有口径）
	useAuthStore.setState({
		user: null,
		accessToken: null,
		refreshToken: null,
		tenants: [],
		currentTenantId: null,
		permissions: [],
		isAuthenticated: false,
	});
}

function renderPage() {
	const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
	return render(
		<QueryClientProvider client={queryClient}>
			<ApiKeysPage />
		</QueryClientProvider>,
	);
}

/** 点 antd Pagination 第 N 页（li 类名稳定）。 */
function clickPage(n: number) {
	const item = document.querySelector(`.ant-pagination-item-${n}`) as HTMLElement;
	expect(item).toBeTruthy();
	fireEvent.click(item);
}

/** 打开筛选 Select（DOM 序：0=状态筛选，1=环境筛选）并点选 option。 */
async function selectFilterOption(index: number, optionTitle: string) {
	const contents = document.querySelectorAll('.ant-select-content');
	const target = contents[index] as HTMLElement | undefined;
	expect(target).toBeTruthy();
	fireEvent.mouseDown(target!);
	const option = await waitFor(() => {
		const el = document.querySelector(`.ant-select-item-option[title="${optionTitle}"]`);
		expect(el).toBeTruthy();
		return el as HTMLElement;
	});
	fireEvent.click(option);
}

describe('api-keys 服务端分页/筛选 wire 契约（A-52 · AC-B5-W1a-16）', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		resetAuthStore();
		installCaptureAdapter();
	});

	afterEach(() => {
		cleanup();
		apiClient.defaults.adapter = originalAdapter as any;
		resetAuthStore();
	});

	it(
		'首载 page/page_size=10 上 wire；翻页发新请求 page=2 且第 2 页行上屏',
		{ timeout: 20000 },
		async () => {
			renderPage();
			await waitFor(() => expect(keysCalls().length).toBe(1));

			// 首载键集恰为契约键（旧实现无 page → 必红）
			expect(keysCalls()[0].params).toEqual({ page: 1, page_size: 10 });
			expect(await screen.findByText('page-1 key')).toBeInTheDocument();

			clickPage(2);
			await waitFor(() => expect(keysCalls().length).toBe(2));
			expect(keysCalls()[1].params).toEqual({ page: 2, page_size: 10 });
			// 第 2 页行上屏（旧实现纯客户端切片收不到该行 → 必红）
			expect(await screen.findByText('page-2 key')).toBeInTheDocument();
		},
	);

	it('状态筛选上 wire：status=active 且 page 归 1', { timeout: 20000 }, async () => {
		renderPage();
		await waitFor(() => expect(keysCalls().length).toBe(1));
		await screen.findByText('page-1 key');

		await selectFilterOption(0, '活跃');
		await waitFor(() => expect(keysCalls().length).toBe(2));
		expect(keysCalls()[1].params).toEqual({ page: 1, page_size: 10, status: 'active' });
	});
});
