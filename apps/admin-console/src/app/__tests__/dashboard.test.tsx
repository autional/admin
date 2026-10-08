import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import DashboardPage from '../page';

vi.mock('@/hooks/use-users', () => ({
	useUsers: vi.fn(),
	useActiveSessions: vi.fn(),
}));

vi.mock('@/hooks/use-roles', () => ({
	useRoles: vi.fn(),
}));

vi.mock('@/hooks/use-audit-logs', () => ({
	useAuditLogs: vi.fn(),
}));

vi.mock('@/hooks/use-audit-alerts', () => ({
	useAlerts: vi.fn(),
}));

vi.mock('@/hooks/use-announcements', () => ({
	useAnnouncements: vi.fn(),
}));

vi.mock('@/hooks/use-dashboard-summary', () => ({
	useTenantSummary: vi.fn(),
}));

import { useUsers, useActiveSessions } from '@/hooks/use-users';
import { useRoles } from '@/hooks/use-roles';
import { useAuditLogs } from '@/hooks/use-audit-logs';
import { useAlerts } from '@/hooks/use-audit-alerts';
import { useAnnouncements } from '@/hooks/use-announcements';
import { useTenantSummary } from '@/hooks/use-dashboard-summary';

const mockedUseUsers = vi.mocked(useUsers);
const mockedUseActiveSessions = vi.mocked(useActiveSessions);
const mockedUseRoles = vi.mocked(useRoles);
const mockedUseAuditLogs = vi.mocked(useAuditLogs);
const mockedUseAlerts = vi.mocked(useAlerts);
const mockedUseAnnouncements = vi.mocked(useAnnouncements);
const mockedUseTenantSummary = vi.mocked(useTenantSummary);

function defaultQueryResult(overrides: Record<string, unknown> = {}) {
	return {
		data: undefined,
		isLoading: false,
		error: null,
		refetch: vi.fn(),
		...overrides,
	};
}

function createWrapper() {
	const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
	return function Wrapper({ children }: { children: React.ReactNode }) {
		return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
	};
}

function renderDashboard() {
	return render(<DashboardPage />, { wrapper: createWrapper() });
}

const forbidden = { response: { status: 403 } };
const serverError = { response: { status: 500 } };
const badRequest = { response: { status: 400 } };

describe('DashboardPage', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockedUseUsers.mockReturnValue(defaultQueryResult() as any);
		mockedUseActiveSessions.mockReturnValue(defaultQueryResult() as any);
		mockedUseRoles.mockReturnValue(defaultQueryResult() as any);
		mockedUseAuditLogs.mockReturnValue(defaultQueryResult() as any);
		mockedUseAlerts.mockReturnValue(defaultQueryResult() as any);
		mockedUseAnnouncements.mockReturnValue(defaultQueryResult({ data: { items: [] } }) as any);
		mockedUseTenantSummary.mockReturnValue({
			tenantName: 'Test',
			memberCount: 0,
			rolesCount: undefined,
			activeSessionsCount: 0,
			apiKeysCount: 0,
			secretsCount: 0,
			secretsState: 'ready',
			isLoading: false,
		} as any);
	});

	it('renders without crashing', () => {
		renderDashboard();
		expect(screen.getByText('仪表盘')).toBeInTheDocument();
	});

	it('shows 4 stat cards: total users, new users today, active sessions, role count', async () => {
		mockedUseUsers.mockReturnValue(defaultQueryResult({ data: [{ id: '1' }] }) as any);
		mockedUseActiveSessions.mockReturnValue(defaultQueryResult({ data: 5 }) as any);
		mockedUseRoles.mockReturnValue(defaultQueryResult({ data: { items: [], total: 3 } }) as any);

		renderDashboard();

		expect(screen.getByText('总用户数')).toBeInTheDocument();
		expect(screen.getByText('今日新增')).toBeInTheDocument();
		expect(screen.getAllByText('活跃会话').length).toBeGreaterThanOrEqual(1);
		expect(screen.getByText('角色数量')).toBeInTheDocument();
	});

	it('shows skeleton placeholders when data is loading', () => {
		mockedUseUsers.mockReturnValue(defaultQueryResult({ isLoading: true }) as any);
		mockedUseActiveSessions.mockReturnValue(defaultQueryResult({ isLoading: true }) as any);
		mockedUseRoles.mockReturnValue(defaultQueryResult({ isLoading: true }) as any);
		mockedUseAlerts.mockReturnValue(defaultQueryResult({ isLoading: true }) as any);

		renderDashboard();

		const skeletons = document.querySelectorAll('.ant-skeleton');
		expect(skeletons.length).toBeGreaterThan(0);
	});

	it('shows error banner when API fails with retry button', async () => {
		const mockRefetch = vi.fn();
		mockedUseUsers.mockReturnValue(
			defaultQueryResult({ error: new Error('fail'), refetch: mockRefetch }) as any,
		);

		renderDashboard();

		expect(screen.getByText('加载用户数据失败')).toBeInTheDocument();
		const retryBtn = screen.getByText('重试');
		expect(retryBtn).toBeInTheDocument();
	});

	it('error renders outside of stat Card container', async () => {
		const mockRefetch = vi.fn();
		mockedUseUsers.mockReturnValue(
			defaultQueryResult({ error: new Error('fail'), refetch: mockRefetch }) as any,
		);

		renderDashboard();

		const errorEl = screen.getByText('加载用户数据失败');
		const card = errorEl.closest('.ant-card');
		expect(card).toBeNull();
	});

	it('shows recent logins list when data available', async () => {
		const logins = [
			{
				id: '1',
				timestamp: '2026-05-20T10:00:00Z',
				operatorId: 'Alice',
				status: 200,
				ip: '1.2.3.4',
			},
		];
		mockedUseAuditLogs.mockReturnValue(defaultQueryResult({ data: { items: logins } }) as any);

		renderDashboard();

		expect(screen.getByText('最近登录')).toBeInTheDocument();
		expect(screen.getByText('Alice')).toBeInTheDocument();
	});

	it('shows "0" for stats when empty data returned', () => {
		mockedUseUsers.mockReturnValue(defaultQueryResult({ data: [] }) as any);
		mockedUseActiveSessions.mockReturnValue(defaultQueryResult({ data: 0 }) as any);
		mockedUseRoles.mockReturnValue(defaultQueryResult({ data: { items: [], total: 0 } }) as any);
		mockedUseAlerts.mockReturnValue(
			defaultQueryResult({ data: { items: [], pagination: { total: 0 } } }) as any,
		);

		renderDashboard();

		const zeros = screen.getAllByText('0');
		expect(zeros.length).toBeGreaterThanOrEqual(4);
	});

	// ---- AC-B4-W1-01-1/3：403 分支（无权限态 + 无必败重试）----
	it('roles 403：角色两卡呈无权限（不显 0），且无重试按钮', () => {
		mockedUseRoles.mockReturnValue(defaultQueryResult({ error: forbidden }) as any);

		renderDashboard();

		// 横幅 1 处 + 概览「角色」卡 + 「角色数量」卡（≥2 处「无权限访问」= 不显 0）
		expect(screen.getAllByText('无权限访问').length).toBeGreaterThanOrEqual(2);
		// 403 不出现必败重试按钮
		expect(screen.queryByText('重试')).toBeNull();
	});

	it('角色数量卡在 403 时不显示 0（假 0 回归锁）', () => {
		mockedUseRoles.mockReturnValue(
			defaultQueryResult({ error: forbidden, data: { items: [], total: 0 } }) as any,
		);

		renderDashboard();

		const roleCountCard = screen.getByText('角色数量').closest('.ant-card');
		expect(roleCountCard?.textContent).toContain('无权限访问');
		expect(roleCountCard?.textContent).not.toContain('0');
	});

	// ---- AC-B4-W1-01-2：公告 403/失败成态 ≠「暂无公告」；真空数组才空态 ----
	it('announcements 403：呈无权限态，非「暂无公告」', () => {
		mockedUseAnnouncements.mockReturnValue(defaultQueryResult({ error: forbidden }) as any);

		renderDashboard();

		expect(screen.getByText('无权限访问')).toBeInTheDocument();
		expect(screen.queryByText('暂无公告')).toBeNull();
	});

	it('announcements 500：呈失败态，非「暂无公告」', () => {
		mockedUseAnnouncements.mockReturnValue(defaultQueryResult({ error: serverError }) as any);

		renderDashboard();

		expect(screen.getByText('加载失败')).toBeInTheDocument();
		expect(screen.queryByText('暂无公告')).toBeNull();
	});

	it('announcements 真空数组：才呈「暂无公告」空态', () => {
		mockedUseAnnouncements.mockReturnValue(defaultQueryResult({ data: { items: [] } }) as any);

		renderDashboard();

		expect(screen.getByText('暂无公告')).toBeInTheDocument();
		expect(screen.queryByText('无权限访问')).toBeNull();
	});

	// ---- AC-B4-W1-01-3：来源文案 + retry iff retryable ----
	it('500（可重试）：来源文案 + 重试按钮；且不回落 0 或空态', () => {
		mockedUseUsers.mockReturnValue(
			defaultQueryResult({ error: serverError, data: { items: [], total: 0 } }) as any,
		);

		renderDashboard();

		expect(screen.getByText('加载用户数据失败')).toBeInTheDocument();
		expect(screen.getByText('重试')).toBeInTheDocument();
		// error 存在时「总用户数」卡不显示 0（error 绝不回落 empty/ready）
		const totalUsersCard = screen.getByText('总用户数').closest('.ant-card');
		expect(totalUsersCard?.textContent).toContain('加载失败');
	});

	it('400（不可重试）：来源文案但无重试按钮', () => {
		mockedUseUsers.mockReturnValue(defaultQueryResult({ error: badRequest }) as any);

		renderDashboard();

		expect(screen.getByText('加载用户数据失败')).toBeInTheDocument();
		expect(screen.queryByText('重试')).toBeNull();
	});

	// ---- 批 5 补修（F2）：待处理审计告警卡改真实源（告警列表 status=open 的 total）+ 三态 ----
	it('alerts 500：待处理审计告警卡呈失败态（不显 0）', () => {
		mockedUseAlerts.mockReturnValue(defaultQueryResult({ error: serverError }) as any);

		renderDashboard();

		const alertsCard = screen.getByText('待处理审计告警').closest('.ant-card');
		expect(alertsCard?.textContent).toContain('加载失败');
	});

	it('alerts 403：待处理审计告警卡呈无权限（不显 0）', () => {
		mockedUseAlerts.mockReturnValue(defaultQueryResult({ error: forbidden }) as any);

		renderDashboard();

		const alertsCard = screen.getByText('待处理审计告警').closest('.ant-card');
		expect(alertsCard?.textContent).toContain('无权限访问');
		expect(alertsCard?.textContent).not.toContain('0');
	});

	it('alerts ready：待处理审计告警卡显示真实 total（status=open 查询）', () => {
		mockedUseAlerts.mockReturnValue(
			defaultQueryResult({ data: { items: [], pagination: { total: 3 } } }) as any,
		);

		renderDashboard();

		const alertsCard = screen.getByText('待处理审计告警').closest('.ant-card');
		expect(alertsCard?.textContent).toContain('3');
		expect(mockedUseAlerts).toHaveBeenCalledWith({ status: 'open', page: 1, page_size: 1 });
	});

	// ---- W2-03（U426）：密钥卡三态（按 roles 模式），403 不显假 0（回归锁） ----
	it('secrets 403：密钥卡呈无权限（不显 0，假 0 回归锁）', () => {
		mockedUseTenantSummary.mockReturnValue({
			tenantName: 'Test',
			memberCount: 0,
			rolesCount: undefined,
			activeSessionsCount: 0,
			apiKeysCount: 0,
			secretsCount: undefined,
			secretsState: 'forbidden',
			isLoading: false,
		} as any);

		renderDashboard();

		const secretsStat = screen.getByText('密钥').closest('.ant-statistic');
		expect(secretsStat?.textContent).toContain('无权限访问');
		expect(secretsStat?.textContent).not.toContain('0');
	});

	it('secrets 500：密钥卡呈失败态（不显 0）', () => {
		mockedUseTenantSummary.mockReturnValue({
			tenantName: 'Test',
			memberCount: 0,
			rolesCount: undefined,
			activeSessionsCount: 0,
			apiKeysCount: 0,
			secretsCount: undefined,
			secretsState: 'error',
			isLoading: false,
		} as any);

		renderDashboard();

		const secretsStat = screen.getByText('密钥').closest('.ant-statistic');
		expect(secretsStat?.textContent).toContain('加载失败');
	});

	it('secrets loading：密钥卡呈占位（不显 0）', () => {
		mockedUseTenantSummary.mockReturnValue({
			tenantName: 'Test',
			memberCount: 0,
			rolesCount: undefined,
			activeSessionsCount: 0,
			apiKeysCount: 0,
			secretsCount: undefined,
			secretsState: 'loading',
			isLoading: false,
		} as any);

		renderDashboard();

		const secretsStat = screen.getByText('密钥').closest('.ant-statistic');
		expect(secretsStat?.textContent).toContain('…');
	});

	it('auditLogs error：最近登录卡成态，不回落「暂无登录记录」（伪空态回归锁）', () => {
		mockedUseAuditLogs.mockReturnValue(defaultQueryResult({ error: serverError }) as any);

		renderDashboard();

		expect(screen.queryByText('暂无登录记录')).toBeNull();
		expect(screen.getByText('加载失败')).toBeInTheDocument();
	});

	// ---- AC-B4-W1-01-4：page_size=50（ADM-009）；audit logs start_date/end_date = YYYY-MM-DD ----
	it('users 请求 pageSize=50；auditLogs 传 page_size 与 YYYY-MM-DD 日期（无 ISO/无 camel 键）', () => {
		renderDashboard();

		expect(mockedUseUsers).toHaveBeenCalledWith({ page: 1, pageSize: 50 });

		const params = mockedUseAuditLogs.mock.calls[0][0] as Record<string, unknown>;
		expect(params.page_size).toBe(10);
		expect(String(params.start_date)).toMatch(/^\d{4}-\d{2}-\d{2}$/);
		expect(String(params.end_date)).toMatch(/^\d{4}-\d{2}-\d{2}$/);
		expect(params.startDate).toBeUndefined();
		expect(params.endDate).toBeUndefined();
		expect(params.pageSize).toBeUndefined();
	});
});
