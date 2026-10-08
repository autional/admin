// W1b（A-89 · A-90 · A-92 · A-93）：devices 列表波修复回归锁 ——
//   A-90：服务端分页接线（fetchDevices 发 page/page_size；切页发 page=2 请求；total 驱动分页器）
//         + 状态列（unpaired/active/transferring 此前不可见）+ 状态筛选（status 参数上 wire）
//   A-89：owner 显示名（owner_principal_id → 成员 username；principal 缺失回退 owner_id）
//   A-92：subtype 文案键 = wire 值原样（smart_home → 「智能家居」；smartHome/iot 幽灵键零可达）
//   A-93：h1 统一「IoT 设备」（旧英文 Devices）
// 断言口径 = 最终 wire 请求/响应（axios adapter 最末环捕获 + snake 行回写，与线上链路同构）。
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router';
import { apiClient } from '@autional/shared';
import DevicesPage from '../page';

vi.mock('@/lib/antd-app', () => ({
	message: { success: vi.fn(), error: vi.fn() },
}));

// A-89：owner 解析数据源单点桩 —— principal 命中成员返回 username（tenantId 空 → 页面自身 hook 不发请求）
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

const IOTS_URL = '/identity/api/v1/admin/iots';
const captured: CapturedCall[] = [];
let originalAdapter: unknown;

/** wire 形状（snake）行：行 1 有 owner_principal_id（→ alice），行 2 仅 owner_id（回退展示）。 */
const RAW_DEVICES = [
	{
		identity_id: 'dev-1',
		name: 'living-room-hub',
		workload_subtype: 'smart_home',
		status: 'active',
		owner_principal_id: 'u-1',
		owner_id: 'tenant-x',
		hardware_id: 'HW-001',
		firmware_ver: '1.2.0',
		created_at: '2026-01-05T00:00:00Z',
	},
	{
		identity_id: 'dev-2',
		name: 'garage-sensor',
		workload_subtype: 'sensor',
		status: 'transferring',
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
		const data = {
			code: 0,
			message: 'success',
			items: RAW_DEVICES,
			total: 43,
			pagination: { total: 43, page: 1, page_size: 10, total_pages: 5, has_next: true },
			timestamp: '2026-10-06T00:00:00Z',
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
			<MemoryRouter>{<DevicesPage />}</MemoryRouter>
		</QueryClientProvider>,
	);
}

const getCalls = () => captured.filter((c) => c.method === 'get' && c.url.includes(IOTS_URL));

describe('devices 列表（A-89/A-90/A-92/A-93）', () => {
	beforeEach(() => {
		captured.length = 0;
		vi.clearAllMocks();
		installCaptureAdapter();
	});

	afterEach(() => {
		apiClient.defaults.adapter = originalAdapter as any;
	});

	it('AC-B5-W1b-90/89/92/93：分页参数上 wire + 状态列 + owner 解析回退链 + 标题/词表统一', { timeout: 20000 }, async () => {
		renderPage();

		// A-93：h1 中文（旧实现「Devices」）
		expect(await screen.findByText('living-room-hub')).toBeTruthy();
		expect(screen.getByText('IoT 设备')).toBeTruthy();

		// A-90：状态列（旧实现无该列 → unpaired/active/transferring 全不可见）
		expect(screen.getByText('活跃')).toBeTruthy();
		expect(screen.getByText('迁移中')).toBeTruthy();

		// A-92：subtype 键名对齐 wire 值（smart_home → 智能家居；幽灵键 smartHome/iot 不得回退原值）
		expect(screen.getByText('智能家居')).toBeTruthy();
		expect(screen.queryByText('smart_home')).toBeNull();
		expect(screen.queryByText('sensor')).toBeNull();

		// A-89：principal 命中 → username；未命中（行 2 无 principal）→ 回退 owner_id
		expect(screen.getByText('alice')).toBeTruthy();
		expect(screen.getByText('owner-001')).toBeTruthy();

		// A-90：首屏请求 = page/page_size（旧实现无参 → 后端默认 20 条截断）
		await waitFor(() => expect(getCalls().length).toBeGreaterThan(0));
		expect(getCalls()[0].params).toMatchObject({ page: 1, page_size: 10 });

		// A-90：total=43 → 分页器第 2/5 页可达；切页发出 page=2 服务端请求
		expect(screen.getByTitle('2')).toBeTruthy();
		expect(screen.getByTitle('5')).toBeTruthy();
		fireEvent.click(screen.getByTitle('2'));
		await waitFor(() => expect(getCalls().some((c) => c.params?.page === 2)).toBe(true));
	});

	it('AC-B5-W1b-90：状态筛选上 wire（status=unpaired）+ page 重置 1', { timeout: 20000 }, async () => {
		renderPage();
		expect(await screen.findByText('living-room-hub')).toBeTruthy();

		// 打开 Select → 选「未配对」→ 请求带 status=unpaired 且 page 重置 1
		const selectContent = document.querySelector('.ant-select-content') as HTMLElement;
		expect(selectContent).toBeTruthy();
		fireEvent.mouseDown(selectContent);
		const option = await waitFor(() => {
			const el = document.querySelector('.ant-select-item-option[title="未配对"]');
			expect(el).toBeTruthy();
			return el as HTMLElement;
		});
		fireEvent.click(option);
		await waitFor(() => expect(getCalls().some((c) => c.params?.status === 'unpaired')).toBe(true));
		const filtered = getCalls().find((c) => c.params?.status === 'unpaired')!;
		expect(filtered.params).toMatchObject({ page: 1, page_size: 10 });
	});
});
