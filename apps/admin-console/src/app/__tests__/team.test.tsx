import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { I18nextProvider } from 'react-i18next';
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import zhCN from '@/i18n/locales/zh-CN.json';
import TeamPage from '../team/page';

i18n.use(initReactI18next).init({
	resources: { 'zh-CN': { translation: zhCN } },
	lng: 'zh-CN',
	fallbackLng: 'zh-CN',
	interpolation: { escapeValue: false },
	react: { useSuspense: false },
});

vi.mock('@/lib/api.generated', () => ({
	getMembers: vi.fn(),
	inviteMember: vi.fn(),
	removeMember: vi.fn(),
}));

vi.mock('@autional/shared', async (importOriginal) => ({ ...(await importOriginal<typeof import('@autional/shared')>()), useCurrentTenantIdOr: vi.fn().mockReturnValue('test-tenant') }));

import { getMembers } from '@/lib/api.generated';

const mockedGetMembers = vi.mocked(getMembers);

const mockMembers = [
	{ id: 'u1', email: 'admin@example.com', name: '管理员', role: 'admin', status: 'active' },
	{ id: 'u2', email: 'dev@example.com', name: '开发者', role: 'member', status: 'active' },
	{ id: 'u3', email: 'pending@example.com', name: '待审批', role: 'viewer', status: 'pending' },
];

function renderPage() {
	const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
	return render(
		<QueryClientProvider client={queryClient}>
			<I18nextProvider i18n={i18n}>
				<TeamPage />
			</I18nextProvider>
		</QueryClientProvider>,
	);
}

describe('TeamPage', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockedGetMembers.mockResolvedValue({ data: mockMembers } as any);
	});

	// === Button Tests ===
	it('renders title', async () => {
		renderPage();
		await waitFor(() => expect(screen.getByText('团队成员')).toBeTruthy());
	});

	it('renders invite button', async () => {
		renderPage();
		await waitFor(() => expect(screen.getByText('邀请成员')).toBeTruthy());
	});

	// === Table Tests ===
	it('renders member emails', async () => {
		renderPage();
		await waitFor(() => {
			expect(screen.getByText('admin@example.com')).toBeTruthy();
			expect(screen.getByText('dev@example.com')).toBeTruthy();
			expect(screen.getByText('pending@example.com')).toBeTruthy();
		});
	});

	it('displays member names', async () => {
		renderPage();
		await waitFor(() => {
			expect(screen.getByText('管理员')).toBeTruthy();
			expect(screen.getByText('开发者')).toBeTruthy();
			expect(screen.getByText('待审批')).toBeTruthy();
		});
	});

	it('shows remove button per row', async () => {
		renderPage();
		await waitFor(() => {
			expect(screen.getAllByText('移除').length).toBe(3);
		});
	});
});
