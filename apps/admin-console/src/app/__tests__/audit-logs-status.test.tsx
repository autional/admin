// A-197 回归锁：审计日志「结果」列 / 详情抽屉的双管道语义。
//
// 事件管道 status∈{0=成功,1=失败}（audit types AuditStatusSuccess/Failed）；
// 请求管道 status 为 HTTP 码（2xx=成功，≥400=失败）；其余数值（如 3xx）原样展示。
// 与 service-audit statusClassOr / security 门户 renderStatusTag 口径逐字一致。
//
// 旧缺陷（v>=200 && v<400）：status=0 的成功事件全部标红「失败」。
// 判别性断言：成功=2（0/200）、失败=2（1/401）、302 原样（旧实现会把 302 记成功、0 记失败）。

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router';
import { apiClient } from '@autional/shared';
import AuditLogsPage from '../audit-logs/page';

const LOGS_URL = '/audit/api/v1/admin/audit/logs';

let originalAdapter: unknown;

/** wire 形状（snake）行：status 覆盖事件管道（0/1）+ 请求管道（200/401）+ 未知（302）。 */
const ROWS = [
	{ id: 'log-0', action: 'event_success_row', status: 0 },
	{ id: 'log-200', action: 'http_200_row', status: 200 },
	{ id: 'log-1', action: 'event_failed_row', status: 1 },
	{ id: 'log-401', action: 'http_401_row', status: 401 },
	{ id: 'log-302', action: 'http_302_row', status: 302 },
].map((r) => ({
	...r,
	tenant_id: 't-1',
	operator_id: 'u-1',
	module: 'auth',
	level: 'info',
	message: `desc_${r.action}`,
	target_type: 'session',
	target_id: '',
	ip: '10.0.0.1',
	duration: 0,
	sequence: 1,
	timestamp: 1759536000000,
}));

function logsEnvelope() {
	return {
		code: 0,
		message: 'success',
		items: ROWS,
		total: ROWS.length,
		pagination: { total: ROWS.length, page: 1, page_size: 20, total_pages: 1, has_next: false },
		timestamp: '2026-10-04T00:00:00Z',
	};
}

function installCaptureAdapter() {
	originalAdapter = apiClient.defaults.adapter;
	apiClient.defaults.adapter = (async (config: any) => {
		const url = String(config.url || '');
		const payload = url.includes(LOGS_URL)
			? logsEnvelope()
			: { code: 0, message: 'success', items: [], total: 0, timestamp: '2026-10-04T00:00:00Z' };
		return { data: payload, status: 200, statusText: 'OK', headers: {}, config };
	}) as any;
}

function renderPage() {
	const queryClient = new QueryClient({
		defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
	});
	return render(
		<QueryClientProvider client={queryClient}>
			<MemoryRouter>
				<AuditLogsPage />
			</MemoryRouter>
		</QueryClientProvider>,
	);
}

describe('audit-logs 结果列双管道语义（A-197）', () => {
	beforeEach(() => {
		installCaptureAdapter();
	});

	afterEach(() => {
		apiClient.defaults.adapter = originalAdapter as any;
	});

	it('表格：0/200 显成功，1/401 显失败，302 原样展示不猜语义', async () => {
		renderPage();

		// 首屏渲染（snake 行经拦截器 camel 化后出表）
		expect(await screen.findByText('event_success_row')).toBeTruthy();

		// 判别性计数：旧实现（2xx/3xx=成功）会得到 成功=2(200,302)/失败=3(0,1,401)。
		expect(screen.getAllByText('成功')).toHaveLength(2); // status 0 + 200
		expect(screen.getAllByText('失败')).toHaveLength(2); // status 1 + 401
		expect(screen.getByText('302')).toBeTruthy(); // 未覆盖数值原样
	});

	it('详情抽屉：与表格共用同一判定点（302 行抽屉内亦原样，不落成功/失败）', async () => {
		renderPage();

		const row = (await screen.findByText('http_302_row')).closest('tr');
		expect(row).toBeTruthy();
		// 正则匹配：AntD 按钮图标的 aria-label（eye）会并入可访问名，精确串匹配不到。
		within(row as HTMLElement).getByRole('button', { name: /查看详情/ }).click();

		// 抽屉打开后，'302' 出现两处：表格行 + 抽屉结果行（旧实现抽屉会渲染「失败」标签）。
		// 抽屉经 antd portal 异步上屏，慢环境下给足等待窗口（默认 1s 会闪断）。
		await waitFor(() => expect(screen.getAllByText('302')).toHaveLength(2), { timeout: 5000 });
		expect(screen.getAllByText('失败')).toHaveLength(2); // 仍只有 1/401 两处，302 未误落失败
	});
});
