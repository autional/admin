// W1a · A-37（AC-B5-W1a-10）：LDAP 健康区块三态回归锁。
//
// 背景：未配置 LDAP 时后端返回 503（ErrCodeLDAPNotConfigured=61001801），
// 旧页面在失败时整个区块静默消失（用户无从知晓是「未配置」还是「加载失败」）。
// 新契约：未配置（503/61001801）→ 中性「未配置」块；其他错误 → 失败块；有健康数据 → 列表。

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import IdentityProvidersPage from '../page';

vi.mock('@/lib/antd-app', () => ({
	message: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
	modal: { confirm: vi.fn() },
}));

vi.mock('@/hooks/use-identity-providers', () => ({
	useIdentityProviders: vi.fn(),
	useCreateIdentityProvider: vi.fn(),
	useUpdateIdentityProvider: vi.fn(),
	useDeleteIdentityProvider: vi.fn(),
	useTestIdentityProvider: vi.fn(),
	useLdapHealth: vi.fn(),
	useTestLdapConnection: vi.fn(),
}));

import { useIdentityProviders, useLdapHealth } from '@/hooks/use-identity-providers';

function mockBaseHooks(ldapHealthReturn: Record<string, unknown>) {
	vi.mocked(useIdentityProviders).mockReturnValue({
		data: [],
		isLoading: false,
		error: null,
		refetch: vi.fn(),
	} as unknown as ReturnType<typeof useIdentityProviders>);
	vi.mocked(useLdapHealth).mockReturnValue(
		ldapHealthReturn as unknown as ReturnType<typeof useLdapHealth>,
	);
}

function renderPage() {
	const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
	return render(
		<QueryClientProvider client={queryClient}>
			<IdentityProvidersPage />
		</QueryClientProvider>,
	);
}

describe('identity-providers LDAP 健康三态（A-37 · AC-B5-W1a-10）', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('未配置（503 / 61001801）→ 中性「未配置」块（不是失败块）', () => {
		mockBaseHooks({
			data: [],
			isLoading: false,
			error: { response: { status: 503, data: { code: 61001801 } } },
		});
		renderPage();

		expect(screen.getByText('当前未配置 LDAP 目录')).toBeInTheDocument();
		expect(screen.queryByText('LDAP 健康状态加载失败')).toBeNull();
	});

	it('错误码命中（status 200 但 code=61001801）→ 同样判未配置', () => {
		mockBaseHooks({
			data: [],
			isLoading: false,
			error: { response: { status: 200, data: { code: 61001801 } } },
		});
		renderPage();

		expect(screen.getByText('当前未配置 LDAP 目录')).toBeInTheDocument();
	});

	it('其他错误（500）→ 失败块（区分于未配置）', () => {
		mockBaseHooks({
			data: [],
			isLoading: false,
			error: { response: { status: 500, data: { code: 500000 } } },
		});
		renderPage();

		expect(screen.getByText('LDAP 健康状态加载失败')).toBeInTheDocument();
		expect(screen.queryByText('当前未配置 LDAP 目录')).toBeNull();
	});

	it('加载中 → 区块不渲染（无闪烁空块）', () => {
		mockBaseHooks({ data: [], isLoading: true, error: null });
		renderPage();

		expect(screen.queryByText('当前未配置 LDAP 目录')).toBeNull();
		expect(screen.queryByText('LDAP 健康状态加载失败')).toBeNull();
	});

	it('有健康数据 → 渲染目录健康列表', () => {
		mockBaseHooks({
			data: [{ directoryName: 'corp-ldap', healthy: true }],
			isLoading: false,
			error: null,
		});
		renderPage();

		expect(screen.getByText('LDAP 目录健康状态')).toBeInTheDocument();
		expect(screen.getByText('corp-ldap')).toBeInTheDocument();
	});
});
