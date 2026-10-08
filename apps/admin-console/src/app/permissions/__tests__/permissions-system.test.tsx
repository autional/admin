// W1a · A-16（AC-B5-W1a-04）：系统内置权限删除守卫回归锁。
//
// 旧缺陷（审计 A-16）：系统权限行含可点「删除」按钮（无 is_system 判定）；
// category 'app' 无中文映射（裸英文直出）。
// 新契约：isSystem 行渲染「系统内置」Tag + 删除按钮禁用 + handleDelete 双保险早退；
// category 走 i18n 映射（app → 应用）。
//
// 说明：wire 预留 —— 后端 PermissionResponse 当前无 is_system 字段（rbac dto 无该字段，
// 见 W1a 记录「偏差登记」）；本测试以 fixture 注入 isSystem 锁定前端渲染与守卫行为。

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import PermissionsPage from '../page';
import { modal } from '@/lib/antd-app';
import {
	usePermissions,
	useCreatePermission,
	useUpdatePermission,
	useDeletePermission,
} from '@/hooks/use-permissions';

vi.mock('@/lib/antd-app', () => ({
	message: { success: vi.fn(), error: vi.fn() },
	modal: { confirm: vi.fn() },
}));

vi.mock('@/hooks/use-permissions', () => ({
	usePermissions: vi.fn(),
	useCreatePermission: vi.fn(),
	useUpdatePermission: vi.fn(),
	useDeletePermission: vi.fn(),
}));

const SYS_ROW = {
	id: 'p-sys',
	code: 'sys.admin',
	name: '系统管理',
	description: '系统内置权限',
	category: 'system',
	isSystem: true,
};

const APP_ROW = {
	id: 'p-app',
	code: 'app.read',
	name: '应用读取',
	description: '普通权限',
	category: 'app',
	isSystem: false,
};

function renderPage() {
	const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
	return render(
		<QueryClientProvider client={queryClient}>
			<PermissionsPage />
		</QueryClientProvider>,
	);
}

function rowOf(text: string): HTMLElement {
	const rows = Array.from(document.querySelectorAll('tbody tr'));
	const row = rows.find((r) => r.textContent?.includes(text));
	expect(row, `未找到包含「${text}」的行`).toBeTruthy();
	return row as HTMLElement;
}

describe('permissions 系统权限守卫（A-16 · AC-B5-W1a-04）', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.mocked(usePermissions).mockReturnValue({
			data: { items: [SYS_ROW, APP_ROW], total: 2 },
			isLoading: false,
			error: null,
			refetch: vi.fn(),
		} as unknown as ReturnType<typeof usePermissions>);
		vi.mocked(useCreatePermission).mockReturnValue({
			mutateAsync: vi.fn(),
		} as unknown as ReturnType<typeof useCreatePermission>);
		vi.mocked(useUpdatePermission).mockReturnValue({
			mutateAsync: vi.fn(),
		} as unknown as ReturnType<typeof useUpdatePermission>);
		vi.mocked(useDeletePermission).mockReturnValue({
			mutateAsync: vi.fn(),
		} as unknown as ReturnType<typeof useDeletePermission>);
	});

	it('系统行渲染「系统内置」Tag；category 映射中文（app → 应用）', () => {
		renderPage();
		expect(screen.getByText('系统内置')).toBeInTheDocument();
		expect(screen.getByText('应用')).toBeInTheDocument();
		expect(screen.getByText('系统')).toBeInTheDocument();
	});

	it('系统行删除按钮禁用，且点击不弹确认（守卫拒删）', () => {
		renderPage();
		const delBtn = within(rowOf('系统管理')).getByRole('button', { name: '删除' });
		expect(delBtn).toBeDisabled();

		fireEvent.click(delBtn);
		expect(modal.confirm).not.toHaveBeenCalled();
	});

	it('非系统行删除按钮可点，点击弹出确认（功能未被误伤）', () => {
		renderPage();
		const delBtn = within(rowOf('应用读取')).getByRole('button', { name: '删除' });
		expect(delBtn).not.toBeDisabled();

		fireEvent.click(delBtn);
		expect(modal.confirm).toHaveBeenCalledTimes(1);
	});
});
