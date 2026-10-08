// W1b（A-76 · A-77 · A-78 · A-80）：agents 列表波修复回归锁 ——
//   A-76：服务端分页接线（fetchAgents 发 page/page_size；切页发 page=2 请求；total 驱动分页器）
//   A-77：删除→吊销 文案（Popconfirm 双文案）+ 状态筛选（status=revoked 参数上 wire）
//   A-78：owner 显示名（owner_principal_id → 成员 username；principal 缺失回退 owner_id）
//   A-80：h1 统一为「智能体管理」（与侧边栏/面包屑同词）
// 断言口径 = 最终 wire 请求/响应（axios adapter 最末环捕获 + snake 行回写，与线上链路同构）。
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router';
import { apiClient } from '@autional/shared';
import AgentsPage from '../page';
import { message } from '@/lib/antd-app';

vi.mock('@/lib/antd-app', () => ({
	message: { success: vi.fn(), error: vi.fn() },
}));

// A-78：owner 解析数据源单点桩 —— principal 命中成员返回 username（teamId 空 → 页面自身 hook 不发请求）
vi.mock('@/hooks/use-members', () => ({
	useMembers: () => ({
		data: [
			{ userId: 'u-1', username: 'alice', email: 'alice@example.com', role: 'member', status: 'active', joinedAt: '' },
		],
	}),
	useInviteMember: () => ({ mutateAsync: vi.fn() }),
	useUpdateMember: () => ({ mutateAsync: vi.fn() }),
	useRemoveMember: () => ({ mutateAsync: vi.fn() }),
}));

interface CapturedCall {
	method: string;
	url: string;
	params?: Record<string, unknown>;
}

const AGENTS_URL = '/identity/api/v1/admin/agents';
const captured: CapturedCall[] = [];
let originalAdapter: unknown;

/** wire 形状（snake）行：行 1 有 owner_principal_id（→ alice），行 2 仅 owner_id（回退展示）。 */
const RAW_AGENTS = [
	{
		identity_id: 'agt-1',
		name: 'alice-bot',
		workload_subtype: 'agent',
		status: 'active',
		owner_principal_id: 'u-1',
		owner_id: 'tenant-x',
		created_at: '2026-01-05T00:00:00Z',
	},
	{
		identity_id: 'agt-2',
		name: 'bob-bot',
		workload_subtype: 'service_account',
		status: 'revoked',
		owner_id: 'owner-001',
		created_at: '2026-01-06T00:00:00Z',
	},
];

function installCaptureAdapter() {
	originalAdapter = apiClient.defaults.adapter;
	apiClient.defaults.adapter = (async (config: any) => {
		const method = String(config.method || 'get').toLowerCase();
		const url = String(config.url || '');
		captured.push({ method, url, params: config.params as Record<string, unknown> | undefined });

		let data: unknown;
		if (method === 'delete') {
			data = { code: 0, message: 'success', data: {}, timestamp: '2026-10-05T00:00:00Z' };
		} else {
			data = {
				code: 0,
				message: 'success',
				items: RAW_AGENTS,
				total: 43,
				pagination: { total: 43, page: 1, page_size: 10, total_pages: 5, has_next: true },
				timestamp: '2026-10-05T00:00:00Z',
			};
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
			<MemoryRouter>{<AgentsPage />}</MemoryRouter>
		</QueryClientProvider>,
	);
}

const getCalls = () => captured.filter((c) => c.method === 'get' && c.url.includes(AGENTS_URL));

describe('agents 列表（A-76/A-77/A-78/A-80）', () => {
	beforeEach(() => {
		captured.length = 0;
		vi.clearAllMocks();
		installCaptureAdapter();
	});

	afterEach(() => {
		apiClient.defaults.adapter = originalAdapter as any;
	});

	it('AC-B5-W1b-76/78/80：分页参数上 wire + owner 解析回退链 + 标题统一', { timeout: 20000 }, async () => {
		renderPage();

		// A-80：h1 中文统一（旧「AI Agents」英文）
		expect(await screen.findByText('alice-bot')).toBeTruthy();
		expect(screen.getByText('智能体管理')).toBeTruthy();

		// A-78：principal 命中 → username；未命中（行 2 无 principal）→ 回退 owner_id
		expect(screen.getByText('alice')).toBeTruthy();
		expect(screen.getByText('owner-001')).toBeTruthy();

		// A-76：首屏请求 = tenant_id + page/page_size（旧实现无参 → 后端默认 20 条截断）
		await waitFor(() => expect(getCalls().length).toBeGreaterThan(0));
		expect(getCalls()[0].params).toMatchObject({ page: 1, page_size: 10 });

		// A-76：total=43 → 分页器第 2/5 页可达；切页发出 page=2 服务端请求
		expect(screen.getByTitle('2')).toBeTruthy();
		expect(screen.getByTitle('5')).toBeTruthy();
		fireEvent.click(screen.getByTitle('2'));
		await waitFor(() => expect(getCalls().some((c) => c.params?.page === 2)).toBe(true));
	});

	it('AC-B5-W1b-77：状态筛选上 wire（status=revoked）+ 行操作文案=吊销（删除措辞零残留）', { timeout: 20000 }, async () => {
		renderPage();
		expect(await screen.findByText('alice-bot')).toBeTruthy();

		// 删除措辞不得残留（A-77）
		expect(screen.queryByText('删除')).toBeNull();

		// 行操作按钮 = 吊销（每行一枚）
		expect(screen.getAllByText('吊销').length).toBe(2);

		// 状态筛选：打开 Select → 选「已吊销」→ 请求带 status=revoked 且 page 重置 1
		const selectContent = document.querySelector('.ant-select-content') as HTMLElement;
		expect(selectContent).toBeTruthy();
		fireEvent.mouseDown(selectContent);
		const option = await waitFor(() => {
			const el = document.querySelector('.ant-select-item-option[title="已吊销"]');
			expect(el).toBeTruthy();
			return el as HTMLElement;
		});
		fireEvent.click(option);
		await waitFor(() => expect(getCalls().some((c) => c.params?.status === 'revoked')).toBe(true));
		const filtered = getCalls().find((c) => c.params?.status === 'revoked')!;
		expect(filtered.params).toMatchObject({ page: 1, page_size: 10 });
	});

	it('AC-B5-W1b-77：Popconfirm 措辞=吊销语义（确认标题+说明）且确认后发 DELETE', { timeout: 20000 }, async () => {
		renderPage();
		expect(await screen.findByText('alice-bot')).toBeTruthy();

		fireEvent.click(screen.getAllByText('吊销')[0]);
		expect(await screen.findByText('确认吊销该 Agent？')).toBeTruthy();
		expect(screen.getByText('吊销后该 Agent 将无法使用。')).toBeTruthy();

		const confirmBtn = document.querySelector('.ant-popconfirm .ant-btn-primary') as HTMLElement;
		expect(confirmBtn).toBeTruthy();
		fireEvent.click(confirmBtn);

		await waitFor(() => expect(captured.some((c) => c.method === 'delete')).toBe(true));
		const del = captured.find((c) => c.method === 'delete')!;
		expect(del.url).toContain('/identity/api/v1/admin/agents/agt-1');
		await waitFor(() => expect(message.success).toHaveBeenCalled());
	});
});
