import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import UsagePage from '../page';

vi.mock('@autional/shared', async (importOriginal) => {
	const actual = await importOriginal<typeof import('@autional/shared')>();
	return { ...actual, useCurrentTenantIdOr: () => 'tenant-1' };
});

vi.mock('@/lib/api.generated', () => ({
	getUsageTimeline: vi.fn(),
	getUsageEndpoints: vi.fn(),
}));

import { getUsageTimeline, getUsageEndpoints } from '@/lib/api.generated';

const mockedTimeline = vi.mocked(getUsageTimeline);
const mockedEndpoints = vi.mocked(getUsageEndpoints);

function renderUsage() {
	const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
	return render(
		<QueryClientProvider client={queryClient}>
			<UsagePage />
		</QueryClientProvider>,
	);
}

describe('UsagePage（AC-B4-W1-03：命名包裹键 + days + 失败态）', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockedTimeline.mockResolvedValue({ timeline: [] } as any);
		mockedEndpoints.mockResolvedValue({ endpoints: [] } as any);
	});

	it('wire 命名键：timeline.timeline/apiRequests + endpoints.endpoints/requestCount 渲染', async () => {
		mockedTimeline.mockResolvedValue({
			tenantId: 'tenant-1',
			days: 7,
			timeline: [{ date: '2026-10-01', apiRequests: 3, users: 1 }],
		} as any);
		mockedEndpoints.mockResolvedValue({
			tenantId: 'tenant-1',
			endpoints: [{ endpoint: '/api/v1/ping', requestCount: 5, errorCount: 0 }],
		} as any);

		renderUsage();

		// .timeline 行渲染（此前取 .items 恒空）
		expect(await screen.findByText('2026-10-01')).toBeInTheDocument();
		// 总请求 = sum(api_requests) = 3
		const totalCard = screen.getByText('总请求数').closest('.ant-card');
		expect(totalCard?.textContent).toContain('3');
		// .endpoints 行渲染
		expect(await screen.findByText('/api/v1/ping')).toBeInTheDocument();
		expect(screen.getByText('5')).toBeInTheDocument();
	});

	it('endpoints 失败：成态（≠「暂无用量数据」）+ 来源文案 + 重试', async () => {
		mockedTimeline.mockResolvedValue({ timeline: [{ date: '2026-10-01', apiRequests: 1 }] } as any);
		mockedEndpoints.mockRejectedValue({ response: { status: 500 } });

		renderUsage();

		expect(await screen.findByText('加载端点用量失败')).toBeInTheDocument();
		const endpointsCard = screen.getByText('热门端点').closest('.ant-card');
		expect(endpointsCard?.textContent).toContain('加载失败');
		expect(endpointsCard?.textContent).not.toContain('暂无用量数据');
		expect(screen.getByText('重试')).toBeInTheDocument();
	});

	it('timeline 403 无权限：无重试按钮；卡片不显「暂无用量数据」伪装', async () => {
		mockedTimeline.mockRejectedValue({ response: { status: 403 } });
		mockedEndpoints.mockResolvedValue({ endpoints: [] } as any);

		renderUsage();

		// 403 多处成态（顶部横幅 + 总请求数卡 + 趋势卡）→ findAll 并断言 ≥2，防「唯一匹配」误解
		expect((await screen.findAllByText('无权限访问')).length).toBeGreaterThanOrEqual(2);
		const timelineCard = screen.getByText('用量趋势').closest('.ant-card');
		expect(timelineCard?.textContent).toContain('无权限访问');
		expect(screen.queryByText('重试')).toBeNull();
	});

	it('endpoints 查询带 { days }（A-57：切窗重新取数）', async () => {
		renderUsage();

		await waitFor(() => {
			expect(mockedEndpoints).toHaveBeenCalledWith('tenant-1', { days: 7 });
		});
		expect(mockedTimeline).toHaveBeenCalledWith('tenant-1', { days: 7 });
	});
});
