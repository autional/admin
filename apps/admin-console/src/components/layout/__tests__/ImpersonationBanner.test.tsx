import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

vi.mock('@/lib/antd-app', () => ({
	message: { success: vi.fn(), error: vi.fn() },
}));

vi.mock('@autional/shared/generated/api', () => ({
	authMeStopImpersonationPost: vi.fn(),
}));

vi.mock('@autional/shared', async (importOriginal) => {
	const actual = await importOriginal<typeof import('@autional/shared')>();
	return {
		...actual,
		// 终止后的 /auth/me 补全：挂起即可（静默分支，用例不依赖其完成）
		apiClient: { get: vi.fn(() => new Promise(() => {})) },
	};
});

import { useAuthStore } from '@autional/shared';
import { authMeStopImpersonationPost } from '@autional/shared/generated/api';
import { message } from '@/lib/antd-app';
import { ImpersonationBanner } from '../ImpersonationBanner';

const NOW_S = Math.floor(Date.now() / 1000);

function makeToken(payload: Record<string, unknown>): string {
	// 真实 JWT 段是 base64url 无填充，btoa 的 '=' 填充须去掉（与 handoff 单测同款）
	return `h.${btoa(JSON.stringify(payload)).replace(/=+$/, '')}.s`;
}

const IMP_TOKEN = makeToken({
	user_id: 'user-42',
	tenant_id: 'tenant-1',
	type: 'access',
	iat: NOW_S,
	exp: NOW_S + 1800,
	custom: {
		is_imp: true,
		impersonated_by: 'admin-7',
		admin_name: 'Admin Seven',
		imp_id: 'imp-001',
		imp_reason: 'support ticket',
	},
});

const ADMIN_TOKEN = makeToken({
	user_id: 'admin-7',
	tenant_id: 'tenant-1',
	type: 'access',
	iat: NOW_S,
	exp: NOW_S + 1800,
	custom: { principal_type: 'human', entry_plane: 'api' },
});

const NORMAL_TOKEN = makeToken({ user_id: 'admin-7', tenant_id: 'tenant-1', exp: NOW_S + 1800 });

function setImpersonationState(): void {
	useAuthStore.setState({
		accessToken: IMP_TOKEN,
		refreshToken: null,
		isAuthenticated: true,
		user: {
			id: 'user-42',
			username: 'alice',
			email: 'alice@example.com',
			status: 'active',
			displayName: 'Alice Target',
		},
	});
}

function renderBanner() {
	const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
	const utils = render(
		<QueryClientProvider client={queryClient}>
			<ImpersonationBanner />
		</QueryClientProvider>,
	);
	return { queryClient, ...utils };
}

beforeEach(() => {
	vi.clearAllMocks();
	localStorage.clear();
	useAuthStore.getState().clearAuth();
});

describe('ImpersonationBanner', () => {
	it('模拟 token 在 store → 渲染横幅（目标用户/发起人/原因/终止按钮）', () => {
		setImpersonationState();
		renderBanner();

		expect(screen.getByText('正在以模拟身份操作')).toBeTruthy();
		expect(screen.getByText(/Alice Target/)).toBeTruthy();
		expect(screen.getByText(/Admin Seven/)).toBeTruthy();
		expect(screen.getByText(/support ticket/)).toBeTruthy();
		expect(screen.getByRole('button', { name: '终止模拟' })).toBeTruthy();
	});

	it('正常（非模拟）token → 不渲染横幅', () => {
		useAuthStore.setState({
			accessToken: NORMAL_TOKEN,
			refreshToken: 'rt',
			isAuthenticated: true,
			user: { id: 'admin-7', username: 'admin', email: 'admin@example.com', status: 'active' },
		});
		renderBanner();

		expect(screen.queryByText('正在以模拟身份操作')).toBeNull();
		expect(screen.queryByRole('button', { name: '终止模拟' })).toBeNull();
	});

	it('点终止（成功）→ store 换新 token 对、清查询缓存、message.success、横幅消失', async () => {
		setImpersonationState();
		const { queryClient } = renderBanner();
		const clearSpy = vi.spyOn(queryClient, 'clear');
		vi.mocked(authMeStopImpersonationPost).mockResolvedValueOnce({
			accessToken: ADMIN_TOKEN,
			refreshToken: 'admin-rt',
			expiresIn: 1800,
			tokenType: 'Bearer',
		});

		fireEvent.click(screen.getByRole('button', { name: '终止模拟' }));

		await waitFor(() => {
			expect(useAuthStore.getState().accessToken).toBe(ADMIN_TOKEN);
		});
		const state = useAuthStore.getState();
		expect(state.refreshToken).toBe('admin-rt');
		expect(state.isAuthenticated).toBe(true);
		expect(state.user?.id).toBe('admin-7');
		expect(clearSpy).toHaveBeenCalled();
		expect(message.success).toHaveBeenCalledWith('已退出模拟');
		// 新 token 非模拟 → 横幅自然消失
		await waitFor(() => {
			expect(screen.queryByText('正在以模拟身份操作')).toBeNull();
		});
	});

	it('点终止（失败）→ message.error、store 保持模拟 token、横幅仍在', async () => {
		setImpersonationState();
		renderBanner();
		vi.mocked(authMeStopImpersonationPost).mockRejectedValueOnce(new Error('boom'));

		fireEvent.click(screen.getByRole('button', { name: '终止模拟' }));

		await waitFor(() => {
			expect(message.error).toHaveBeenCalledWith('终止模拟失败，请重试');
		});
		expect(useAuthStore.getState().accessToken).toBe(IMP_TOKEN);
		expect(useAuthStore.getState().isAuthenticated).toBe(true);
		expect(screen.getByText('正在以模拟身份操作')).toBeTruthy();
	});
});
