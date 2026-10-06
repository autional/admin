// TASK-AB1-17（fix-admin-b1-guard-contract / A-05 · A-10 · H008）：users 列表分页契约回归锁。
//
//   AC-AB1-31：users 列表在 mock adapter 返回 snake 原始数据下渲染首屏（经真实拦截器转 camel），
//              请求参数带 `page_size`。
//
// 断言口径 = **最终 wire 请求**：捕获器装在 shared apiClient 的 axios adapter（请求拦截器之后最末环），
// 跑真实链路 page → useUsers → generated api → 拦截器 → adapter；adapter 回写 wire 形状（snake）
// 响应，由响应拦截器深 camel 化 + 解包信封，与线上链路同构。
//   ① 首屏渲染：snake 原始行（created_at / must_change_password）经拦截器转 camel 后正常出表；
//   ② 请求参数：恰含 page/page_size（旧缺陷发 limit 被后端忽略 → 此处判别）；
//   ③ 单次列表请求：无独立 total 二次请求旁路（H008 反模式删除）；
//   ④ total 驱动分页器：total=42 时第 2 页按钮存在（服务端 total 生效）。

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router';
import { apiClient } from '@autional/shared';
import UsersPage from '../page';

interface CapturedCall {
	method: string;
	url: string;
	params?: Record<string, unknown>;
}

const USERS_URL = '/identity/api/v1/admin/users';
const captured: CapturedCall[] = [];
let originalAdapter: unknown;

/** wire 形状（snake）原始数据：经响应拦截器转 camel。 */
const RAW_USERS = [
	{
		id: 'u-1',
		username: 'alice',
		email: 'alice@test.com',
		status: 'active',
		created_at: '2026-01-01T00:00:00Z',
		must_change_password: true,
	},
	{
		id: 'u-2',
		username: 'bob',
		email: 'bob@test.com',
		status: 'locked',
		created_at: '2026-02-01T00:00:00Z',
		must_change_password: false,
		password_changed_at: '2026-03-01T00:00:00Z',
	},
];

function installCaptureAdapter() {
	originalAdapter = apiClient.defaults.adapter;
	apiClient.defaults.adapter = (async (config: any) => {
		captured.push({
			method: String(config.method || 'get').toLowerCase(),
			url: String(config.url || ''),
			params: config.params as Record<string, unknown> | undefined,
		});
		const data = {
			code: 0,
			message: 'ok',
			data: { items: RAW_USERS, total: 42 },
		};
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
				<UsersPage />
			</MemoryRouter>
		</QueryClientProvider>,
	);
}

const listCalls = () => captured.filter((c) => c.url.includes(USERS_URL));

describe('users 列表分页契约（A-05/A-10 · H008）', () => {
	beforeEach(() => {
		captured.length = 0;
		installCaptureAdapter();
	});

	afterEach(() => {
		apiClient.defaults.adapter = originalAdapter as any;
	});

	it('AC-AB1-31：snake 原始数据经真实拦截器渲染首屏，且请求参数带 page_size（无 limit 键）', async () => {
		renderPage();

		// ① 首屏渲染：snake 行经拦截器 camel 化后按契约 camel 键读取出表
		expect(await screen.findByText('alice')).toBeTruthy();
		expect(screen.getByText('bob')).toBeTruthy();
		expect(screen.getByText('alice@test.com')).toBeTruthy();
		expect(screen.getByText('已锁定')).toBeTruthy();
		// 密码状态按行判别：alice（must_change_password: true）→「需修改」★1；
		// bob（false + password_changed_at）→「正常」——snake 直读残留时两行都会错误地变「需修改」。
		expect(screen.getAllByText('需修改')).toHaveLength(1);

		// ② 请求参数：page/page_size 单点；旧参数名（limit）零残留
		await waitFor(() => expect(listCalls().length).toBeGreaterThan(0));
		const params = listCalls()[0].params!;
		expect(params.page).toBe(1);
		expect(params.page_size).toBe(10);
		expect(params).not.toHaveProperty('limit');

		// ③ 单次列表请求：无独立 total 二次请求旁路
		expect(listCalls()).toHaveLength(1);

		// ④ total=42（服务端）驱动分页器
		expect(screen.getByTitle('2')).toBeTruthy();
	});

	it('搜索触发服务端请求并回到第 1 页（请求参数含 search + page_size）', async () => {
		renderPage();
		expect(await screen.findByText('alice')).toBeTruthy();

		const searchInput = screen.getByPlaceholderText('搜索用户名或邮箱');
		fireEvent.change(searchInput, { target: { value: 'ali' } });

		// 300ms 防抖后发出带 search 的服务端请求
		await waitFor(() => expect(listCalls().some((c) => c.params?.search === 'ali')).toBe(true));
		const hit = listCalls().filter((c) => c.params?.search === 'ali');
		expect(hit).toHaveLength(1);
		expect(hit[0].params!.page).toBe(1);
		expect(hit[0].params!.page_size).toBe(10);
	});
});
