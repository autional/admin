// TASK-AB2-17（fix-admin-b2-security-forensics / A-141f · AC-B2-028）：角色激活页「激活记录」语义回归锁。
//
// 背景（ADR-B2-03）：PIM approve 端点为假成功桩（后端创建即 Active，无审批流），TASK-AB2-16 已整体
// 移除后端 approve 路由/handler/DTO。本页随之改「激活记录」语义：
//   ① 无批准入口：无「批准」按钮、无「待审批」筛选、无批准模态分支（断言不可达）；
//   ② 状态列三态：active / revoked / expired 映射完整，未知状态兜底原值（wire 枚举见
//      service-share/micro-share/pim/role_activation.go:12-16 三常量）；
//   ③ 标题文案「激活记录」与语义一致。
// 反假绿：mock 面为 useRoleActivations + useRevokeActivation（模块无 approve 导出 —— 页面若回接
// approve 调用将在本用例渲染即炸）；筛选下拉为「打开后」断言（正控 已撤销 选项出现，防「下拉未渲染」型假绿）。

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router';
import RoleActivationsPage from '../page';

vi.mock('@/hooks/use-role-activations', () => ({
	useRoleActivations: vi.fn(),
	useRevokeActivation: vi.fn(),
}));

vi.mock('@/lib/antd-app', () => ({
	message: { success: vi.fn(), error: vi.fn() },
}));

vi.mock('@/lib/error-handler', () => ({
	handleApiError: vi.fn(),
}));

import { useRoleActivations, useRevokeActivation } from '@/hooks/use-role-activations';

const mockedUseRoleActivations = vi.mocked(useRoleActivations);
const mockedUseRevokeActivation = vi.mocked(useRevokeActivation);

function queryResult(overrides: Record<string, unknown> = {}) {
	return {
		data: [],
		isLoading: false,
		error: null,
		refetch: vi.fn(),
		...overrides,
	};
}

function mutationResult(overrides: Record<string, unknown> = {}) {
	return {
		mutateAsync: vi.fn().mockResolvedValue({}),
		isPending: false,
		...overrides,
	};
}

function makeRow(id: string, status: string) {
	return {
		id,
		tenantId: 'tenant-1',
		userId: 'user-000000000000000001',
		roleId: 'role-000000000000000001',
		status,
		justification: '临时提权处理工单',
		activatedAt: '2026-10-04T01:00:00Z',
		expireAt: '2026-10-04T02:00:00Z',
		revokedAt: '',
		createdAt: '2026-10-04T01:00:00Z',
	};
}

// 三态实值 + 未知状态探针（pending 为已裁撤语义：后端枚举无此值，仅防存量脏数据兜底）
const ROWS = [
	makeRow('ra-1', 'active'),
	makeRow('ra-2', 'revoked'),
	makeRow('ra-3', 'expired'),
	makeRow('ra-4', 'pending'),
];

function renderPage() {
	const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
	return render(
		<QueryClientProvider client={queryClient}>
			<MemoryRouter>
				<RoleActivationsPage />
			</MemoryRouter>
		</QueryClientProvider>,
	);
}

describe('角色激活页「激活记录」语义（A-141f / AC-B2-028）', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		// W1c-23（A-144 连带面）：hook 返回形状收口为服务端分页 {items,total}（旧裸数组）；
		// 本用例五条断言语义零改动，仅 mock 形状适配。
		mockedUseRoleActivations.mockReturnValue(
			queryResult({ data: { items: ROWS, total: ROWS.length } }) as any,
		);
		mockedUseRevokeActivation.mockReturnValue(mutationResult() as any);
	});

	it('标题为「激活记录」语义（旧「角色激活审批」已裁决撤除）', () => {
		renderPage();

		expect(screen.getByText('激活记录')).toBeInTheDocument();
		expect(screen.queryByText('角色激活审批')).toBeNull();
	});

	it('状态列三态映射完整：active/revoked/expired 均出中文标签', () => {
		renderPage();

		expect(screen.getByText('已激活')).toBeInTheDocument();
		expect(screen.getByText('已撤销')).toBeInTheDocument();
		expect(screen.getByText('已过期')).toBeInTheDocument();
	});

	it('无批准入口：任意状态行不出现「批准」按钮与「待审批」标签', () => {
		renderPage();

		// 旧缺陷：pending 行渲染「批准」按钮 + 「待审批」标签（假成功桩端点已删，入口必须不可达）
		expect(screen.queryByText('批准')).toBeNull();
		expect(screen.queryByText('待审批')).toBeNull();
		// 未知状态兜底：原值透出（映射缺失不吞行）
		expect(screen.getByText('pending')).toBeInTheDocument();
	});

	it('筛选下拉无「待审批」选项，且保留三态选项（打开后断言 + 正控）', async () => {
		renderPage();

		// 页内存在多个 combobox（分页器含页大小选择器），按筛选器当前值「全部」定位专属选择器；
		// antd v6 DOM：.ant-select > .ant-select-content(title=当前值)；mousedown 展开（官方测试同法）
		const filterSelect = screen.getByText('全部').closest('.ant-select') as HTMLElement;
		fireEvent.mouseDown(filterSelect);
		await waitFor(() => expect(document.querySelector('.ant-select-dropdown')).toBeTruthy());
		const dropdown = document.querySelector('.ant-select-dropdown') as HTMLElement;

		// 正控：下拉确已渲染（防「未打开即全空」型假绿）
		expect(within(dropdown).getByText('已撤销')).toBeInTheDocument();
		expect(within(dropdown).getByText('已激活')).toBeInTheDocument();
		expect(within(dropdown).getByText('已过期')).toBeInTheDocument();
		// 旧缺陷：待审批选项在册（已裁撤）
		expect(within(dropdown).queryByText('待审批')).toBeNull();
	});

	it('撤销操作保留：active 行可撤销，模态标题为「撤销角色激活」', async () => {
		const user = userEvent.setup();
		renderPage();

		await user.click(screen.getByText('撤销'));

		expect(await screen.findByText('撤销角色激活')).toBeInTheDocument();
	});
});
