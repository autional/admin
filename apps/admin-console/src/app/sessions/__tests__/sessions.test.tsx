import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import SessionsPage from '../page';

vi.mock('@/lib/antd-app', () => ({
	message: { success: vi.fn(), error: vi.fn() },
}));

vi.mock('@/hooks/use-sessions', () => ({
	useSessions: vi.fn(),
	useActiveSessionCount: vi.fn(),
	useDeleteSession: vi.fn(),
}));

import { useSessions, useActiveSessionCount, useDeleteSession } from '@/hooks/use-sessions';

const mockedUseSessions = vi.mocked(useSessions);
const mockedUseActiveSessionCount = vi.mocked(useActiveSessionCount);
const mockedUseDeleteSession = vi.mocked(useDeleteSession);

const forbidden = { response: { status: 403 } };
const serverError = { response: { status: 500 } };

describe('SessionsPage（AC-B4-W1-02：active count 403/500 成态，不显 0）', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockedUseSessions.mockReturnValue({
			data: [],
			isLoading: false,
			error: null,
			refetch: vi.fn(),
		} as any);
		mockedUseActiveSessionCount.mockReturnValue({
			data: undefined,
			isLoading: false,
			error: null,
			refetch: vi.fn(),
		} as any);
		mockedUseDeleteSession.mockReturnValue({ mutateAsync: vi.fn() } as any);
	});

	it('active count 403：统计卡呈无权限，不显 0', () => {
		mockedUseActiveSessionCount.mockReturnValue({
			data: undefined,
			isLoading: false,
			error: forbidden,
			refetch: vi.fn(),
		} as any);

		render(<SessionsPage />);

		const card = screen.getByText('活跃会话').closest('.ant-card');
		expect(card?.textContent).toContain('无权限访问');
		expect(card?.textContent).not.toContain('0');
	});

	it('active count 500：统计卡呈失败态，不显 0', () => {
		mockedUseActiveSessionCount.mockReturnValue({
			data: undefined,
			isLoading: false,
			error: serverError,
			refetch: vi.fn(),
		} as any);

		render(<SessionsPage />);

		const card = screen.getByText('活跃会话').closest('.ant-card');
		expect(card?.textContent).toContain('加载失败');
		expect(card?.textContent).not.toContain('0');
	});

	it('active count 就绪：显示真实数值与带计数标签', () => {
		mockedUseActiveSessionCount.mockReturnValue({
			data: 7,
			isLoading: false,
			error: null,
			refetch: vi.fn(),
		} as any);

		render(<SessionsPage />);

		const card = screen.getByText('当前活跃 7 个会话').closest('.ant-card');
		expect(card?.textContent).toContain('7');
	});

	it('会话列表 500：来源文案 + 重试按钮', () => {
		mockedUseSessions.mockReturnValue({
			data: [],
			isLoading: false,
			error: serverError,
			refetch: vi.fn(),
		} as any);

		render(<SessionsPage />);

		expect(screen.getByText('加载会话列表失败')).toBeInTheDocument();
		expect(screen.getByText('重试')).toBeInTheDocument();
	});

	it('会话列表 403：无权限态 + 无重试按钮', () => {
		mockedUseSessions.mockReturnValue({
			data: [],
			isLoading: false,
			error: forbidden,
			refetch: vi.fn(),
		} as any);

		render(<SessionsPage />);

		expect(screen.getByText('无权限访问')).toBeInTheDocument();
		expect(screen.queryByText('重试')).toBeNull();
	});
});
