import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { I18nextProvider } from 'react-i18next';
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import zhCN from '@/i18n/locales/zh-CN.json';
import OAuthClientsPage from '../oauth-clients/page';

i18n.use(initReactI18next).init({
	resources: { 'zh-CN': { translation: zhCN } },
	lng: 'zh-CN',
	fallbackLng: 'zh-CN',
	interpolation: { escapeValue: false },
	react: { useSuspense: false },
});

vi.mock('@/hooks/use-oauth-clients', () => ({
	useOAuthClients: vi.fn(),
	useOAuthClient: vi.fn(),
	useCreateOAuthClient: vi.fn(),
	useUpdateOAuthClient: vi.fn(),
	useDeleteOAuthClient: vi.fn(),
	useRotateOAuthClientSecret: vi.fn(),
	useOAuthClientSecrets: vi.fn(),
	useCreateOAuthClientSecret: vi.fn(),
	useDeleteOAuthClientSecret: vi.fn(),
	useDeactivateOAuthClientSecret: vi.fn(),
	useOAuthClientStats: vi.fn().mockReturnValue({ data: {} }),
}));

import {
	useOAuthClients,
	useCreateOAuthClient,
	useDeleteOAuthClient,
	useOAuthClientSecrets,
	useCreateOAuthClientSecret,
	useOAuthClientStats,
	useDeactivateOAuthClientSecret,
	useUpdateOAuthClient,
	useRotateOAuthClientSecret,
} from '@/hooks/use-oauth-clients';

const mockedUseOAuthClients = vi.mocked(useOAuthClients);
const mockedUseCreateOAuthClient = vi.mocked(useCreateOAuthClient);
const mockedUseDeleteOAuthClient = vi.mocked(useDeleteOAuthClient);
const mockedUseOAuthClientSecrets = vi.mocked(useOAuthClientSecrets);
const mockedUseCreateOAuthClientSecret = vi.mocked(useCreateOAuthClientSecret);
const mockedUseOAuthClientStats = vi.mocked(useOAuthClientStats);

const mockClients = [
	{
		id: '1',
		clientId: 'client-001',
		clientName: '测试应用',
		redirectUris: ['https://example.com/callback'],
		grantTypes: ['authorization_code'],
		status: 'active',
		createdAt: '2026-01-01T00:00:00Z',
	},
	{
		id: '2',
		clientId: 'client-002',
		clientName: 'ERP 系统',
		redirectUris: ['https://erp.example.com/callback'],
		grantTypes: ['client_credentials'],
		status: 'active',
		createdAt: '2026-01-02T00:00:00Z',
	},
];

const mockSecrets = [
	{ id: 's1', secretId: 'secret-1', status: 'active', createdAt: '2026-01-01T00:00:00Z' },
];

function renderPage() {
	const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
	return render(
		<QueryClientProvider client={queryClient}>
			<I18nextProvider i18n={i18n}>
				<OAuthClientsPage />
			</I18nextProvider>
		</QueryClientProvider>,
	);
}

describe('OAuthClientsPage', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockedUseOAuthClients.mockReturnValue({
			data: mockClients,
			isLoading: false,
			error: null,
			refetch: vi.fn(),
		} as any);
		mockedUseCreateOAuthClient.mockReturnValue({ mutateAsync: vi.fn(), isPending: false } as any);
		mockedUseDeleteOAuthClient.mockReturnValue({ mutateAsync: vi.fn() } as any);
		mockedUseOAuthClientSecrets.mockReturnValue({ data: mockSecrets, isLoading: false } as any);
		mockedUseCreateOAuthClientSecret.mockReturnValue({ mutateAsync: vi.fn() } as any);
		mockedUseOAuthClientStats.mockReturnValue({ data: {} } as any);
	});

	// === Button Tests ===
	it('renders title', () => {
		renderPage();
		expect(screen.getByText('OAuth 客户端')).toBeTruthy();
	});

	it('renders create button', () => {
		renderPage();
		expect(screen.getByText('创建 OAuth 客户端')).toBeTruthy();
	});

	// === Table / Data Binding Tests ===
	it('renders table with client names', () => {
		renderPage();
		expect(screen.getByText('测试应用')).toBeTruthy();
		expect(screen.getByText('ERP 系统')).toBeTruthy();
	});

	it('shows clientId in table', () => {
		renderPage();
		expect(screen.getByText(/client-001/)).toBeTruthy();
	});

	it('renders action buttons per row', () => {
		renderPage();
		expect(screen.getAllByText('管理密钥').length).toBe(2);
		expect(screen.getAllByText('详情').length).toBe(2);
	});

	it('icon-only buttons expose accessible names (A-47)', () => {
		renderPage();
		// 行内 icon-only 按钮（复制/编辑/删除）须有可访问名
		expect(screen.getAllByRole('button', { name: '复制客户端 ID' }).length).toBe(2);
		expect(screen.getAllByRole('button', { name: '编辑' }).length).toBe(2);
		expect(screen.getAllByRole('button', { name: '删除' }).length).toBe(2);
	});

	it('status renders localized label (A-48)', () => {
		renderPage();
		// oauthClients.status.active 中文映射（非裸英文 active）
		expect(screen.getAllByText('启用').length).toBe(2);
	});

	it('detail drawer uses standalone redirect label (A-48)', async () => {
		renderPage();
		fireEvent.click(screen.getAllByText('详情')[0]);
		// 详情标签 = 回调地址（独立键 oauthClients.detailRedirectUris，非表单文案「回调地址（每行一个）」）
		expect(await screen.findByText('回调地址')).toBeInTheDocument();
		expect(screen.queryByText('回调地址（每行一个）')).toBeNull();
	});

	it('shows empty state when no clients', () => {
		mockedUseOAuthClients.mockReturnValue({
			data: [],
			isLoading: false,
			error: null,
			refetch: vi.fn(),
		} as any);
		renderPage();
		expect(screen.queryByText('测试应用')).toBeNull();
	});
});
