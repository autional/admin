import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
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

// antd v6 静态 message 移入 App.useApp()，`@/lib/antd-app` 的 export let 在 Provider 挂载前为
// undefined —— 测试无 Provider，保存路径 message.success/error 会抛 TypeError（unhandled rejection）。
vi.mock('@/lib/antd-app', () => ({
	message: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
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
const mockedUseUpdateOAuthClient = vi.mocked(useUpdateOAuthClient);
const mockedUseDeleteOAuthClient = vi.mocked(useDeleteOAuthClient);
const mockedUseOAuthClientSecrets = vi.mocked(useOAuthClientSecrets);
const mockedUseCreateOAuthClientSecret = vi.mocked(useCreateOAuthClientSecret);
const mockedUseOAuthClientStats = vi.mocked(useOAuthClientStats);

// wire 真形（拦截器 camel 化后的键：name/redirectUris/postLogoutRedirectUris——A-45/A-46）
const mockClients = [
	{
		id: '1',
		clientId: 'client-001',
		name: '测试应用',
		redirectUris: ['https://example.com/callback'],
		postLogoutRedirectUris: ['https://example.com/', 'https://alt.example.com/'],
		grantTypes: ['authorization_code'],
		status: 'active',
		createdAt: '2026-01-01T00:00:00Z',
	},
	{
		id: '2',
		clientId: 'client-002',
		name: 'ERP 系统',
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
		mockedUseUpdateOAuthClient.mockReturnValue({ mutateAsync: vi.fn(), isPending: false } as any);
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

	// === Editor wire alignment (A-45/A-46 + post_logout 字段) ===
	it('edit modal prefills name + post-logout URIs from wire keys (A-45/A-46)', async () => {
		renderPage();
		fireEvent.click(screen.getAllByRole('button', { name: '编辑' })[0]);
		// 回显读 wire `name`（非 clientName）；post_logout 换行预填
		expect(await screen.findByDisplayValue('测试应用')).toBeTruthy();
		expect(screen.getByDisplayValue('https://example.com/callback')).toBeTruthy();
		// DTL 默认 normalizer 只作用 DOM 侧（display-value.js → matches.js:36-42：节点值
		// collapseWhitespace 后与**原始**期望串 === 比较 → `\n` 永不命中）。normalizer 透传
		// = 双侧保持原文，精确锁定换行预填。
		expect(
			screen.getByDisplayValue('https://example.com/\nhttps://alt.example.com/', {
				normalizer: (text) => text,
			}),
		).toBeTruthy();
	});

	it('save sends wire-aligned payload (name + URI arrays split by newline)', async () => {
		const updateSpy = vi.fn().mockResolvedValue({});
		mockedUseUpdateOAuthClient.mockReturnValue({ mutateAsync: updateSpy, isPending: false } as any);
		renderPage();
		fireEvent.click(screen.getAllByRole('button', { name: '编辑' })[0]);
		fireEvent.click(await screen.findByRole('button', { name: 'OK' }));
		await waitFor(() =>
			expect(updateSpy).toHaveBeenCalledWith({
				id: 'client-001',
				data: {
					name: '测试应用',
					alias: '',
					redirectUris: ['https://example.com/callback'],
					postLogoutRedirectUris: ['https://example.com/', 'https://alt.example.com/'],
					grantTypes: ['authorization_code'],
					website: '',
					logoUrl: '',
				},
			}),
		);
	});

	it('edit modal prefills website/logo from wire keys (展示元信息)', async () => {
		mockedUseOAuthClients.mockReturnValue({
			data: [
				{
					...mockClients[0],
					website: 'https://novel.example.com',
					logoUrl: 'https://novel.example.com/logo.png',
				},
			],
			isLoading: false,
			error: null,
			refetch: vi.fn(),
		} as any);

		renderPage();
		fireEvent.click(screen.getAllByRole('button', { name: '编辑' })[0]);

		expect(await screen.findByDisplayValue('https://novel.example.com')).toBeTruthy();
		expect(screen.getByDisplayValue('https://novel.example.com/logo.png')).toBeTruthy();
	});

	it('save sends trimmed website/logoUrl (用户门户消费的展示元信息)', async () => {
		const updateSpy = vi.fn().mockResolvedValue({});
		mockedUseUpdateOAuthClient.mockReturnValue({ mutateAsync: updateSpy, isPending: false } as any);
		mockedUseOAuthClients.mockReturnValue({
			data: [
				{
					...mockClients[0],
					website: 'https://novel.example.com',
					logoUrl: 'https://novel.example.com/logo.png',
					alias: '小说',
				},
			],
			isLoading: false,
			error: null,
			refetch: vi.fn(),
		} as any);

		renderPage();
		fireEvent.click(screen.getAllByRole('button', { name: '编辑' })[0]);
		// 前后空格应被 trim（服务端按 varchar(255) 存，空白会污染展示）
		fireEvent.change(await screen.findByDisplayValue('https://novel.example.com'), {
			target: { value: '  https://novel.example.com  ' },
		});
		fireEvent.change(screen.getByDisplayValue('https://novel.example.com/logo.png'), {
			target: { value: ' https://novel.example.com/logo.png ' },
		});
		fireEvent.change(screen.getByDisplayValue('小说'), {
			target: { value: '  小说  ' },
		});
		fireEvent.click(screen.getByRole('button', { name: 'OK' }));

		await waitFor(() =>
			expect(updateSpy).toHaveBeenCalledWith(
				expect.objectContaining({
					id: 'client-001',
					data: expect.objectContaining({
						website: 'https://novel.example.com',
						logoUrl: 'https://novel.example.com/logo.png',
						alias: '小说',
					}),
				}),
			),
		);
	});

	it('detail drawer shows website/logo (and - when empty)', async () => {
		mockedUseOAuthClients.mockReturnValue({
			data: [
				{
					...mockClients[0],
					website: 'https://novel.example.com',
					logoUrl: 'https://novel.example.com/logo.png',
				},
				mockClients[1], // 无 website/logo → 回退 '-'
			],
			isLoading: false,
			error: null,
			refetch: vi.fn(),
		} as any);

		renderPage();

		fireEvent.click(screen.getAllByText('详情')[0]);
		expect(await screen.findByText('应用官网')).toBeInTheDocument();
		expect(screen.getByText('https://novel.example.com')).toBeInTheDocument();
		expect(screen.getByText('https://novel.example.com/logo.png')).toBeInTheDocument();

		// 空值回退：第二条（无元信息）→ 两处 '-'
		fireEvent.click(screen.getAllByText('详情')[1]);
		await waitFor(() => {
			expect(screen.getAllByText('-').length).toBeGreaterThanOrEqual(2);
		});
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
