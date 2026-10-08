// TASK-AB1-19（fix-admin-b1-guard-contract / A-63 · A-66）：logs / status 契约回归锁。
//
//   AC-AB1-33：logs 页切页触发服务端请求（断言请求次数，非前端 slice）。
//   AC-AB1-34：status 页 summary 全部字段渲染（无 undefined/占位空）。
//
// 断言口径 = **最终 wire 请求 / wire 响应**（沿用 AB1-17/AB1-18 捕获器模式）：捕获器装在
// shared apiClient 的 axios adapter（请求拦截器之后最末环），adapter 回写 wire 形状
// （service-core 信封）响应，由响应拦截器解包 + 深 camel 化，与线上链路同构。
//
// logs（GET /identity/api/v1/auth/me/audit-logs，service-identity dto.AuditLogResponse 实读）：
//   ① 首屏渲染：snake 行经拦截器 camel 化后出表；
//   ② 请求参数：恰含 page/page_size（旧缺陷不发分页参数 → 后端默认 20 条截断）；
//   ③ 单次列表请求：无前端二次取数旁路；
//   ④ total=43 驱动分页器：第 2..5 页可达（旧缺陷前端 slice 假分页只有 1 页）；
//   ⑤ 切页：点击第 2 页发出 page=2&page_size=10 的真实服务端请求（非前端切片）。
//
// status（GET /status/api/v1/status/overview，service-status dto.OverviewResponse 实读，
// DataResponse 信封）：summary 五字段（overall_status/services_total/services_healthy/
// active_incidents/last_updated）全部渲染，无 undefined/占位空（旧缺陷按不存在的
// services[] 双解包 → 恒空）。

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router';
import type { ReactElement } from 'react';
import { apiClient } from '@autional/shared';
import LogsPage from '../logs/page';
import StatusPage from '../status/page';

interface CapturedCall {
	method: string;
	url: string;
	params?: Record<string, unknown>;
}

const LOGS_URL = '/identity/api/v1/auth/me/audit-logs';
const STATUS_URL = '/status/api/v1/status/overview';
const captured: CapturedCall[] = [];
let originalAdapter: unknown;

/** wire 形状（snake）审计日志行：字段与 dto.AuditLogResponse 实读一致，经响应拦截器 camel 化。 */
const RAW_LOGS = [
	{
		id: 'log-1',
		tenant_id: 't-1',
		user_id: 'u-1',
		action: 'LOGIN',
		resource: 'session',
		status: 'success',
		details: 'login success',
		created_at: '2026-10-01T10:00:00Z',
	},
	{
		id: 'log-2',
		tenant_id: 't-1',
		user_id: 'u-1',
		action: 'admin_list_keys',
		resource: 'api_key',
		status: 'success',
		details: 'list keys',
		created_at: '2026-10-02T10:00:00Z',
	},
];

/** service-core 扁平 ListResponse：拦截器只保留 items/total/pagination 并深 camel 化。 */
function logsEnvelope() {
	return {
		code: 0,
		message: 'success',
		items: RAW_LOGS,
		total: 43,
		pagination: { total: 43, page: 1, page_size: 10, total_pages: 5, has_next: true },
		timestamp: '2026-10-04T00:00:00Z',
	};
}

/** service-core DataResponse 信封：拦截器解包 data + 深 camel 化（dto.OverviewResponse 实读字段）。 */
function statusEnvelope() {
	return {
		code: 0,
		message: 'success',
		data: {
			overall_status: 'operational',
			services_total: 26,
			services_healthy: 25,
			active_incidents: 3,
			last_updated: '2026-10-04 12:30:00',
		},
		timestamp: '2026-10-04T00:00:00Z',
	};
}

function installCaptureAdapter() {
	originalAdapter = apiClient.defaults.adapter;
	apiClient.defaults.adapter = (async (config: any) => {
		const url = String(config.url || '');
		captured.push({
			method: String(config.method || 'get').toLowerCase(),
			url,
			params: config.params as Record<string, unknown> | undefined,
		});
		const payload = url.includes(STATUS_URL) ? statusEnvelope() : logsEnvelope();
		return { data: payload, status: 200, statusText: 'OK', headers: {}, config };
	}) as any;
}

function renderPage(ui: ReactElement) {
	const queryClient = new QueryClient({
		defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
	});
	return render(
		<QueryClientProvider client={queryClient}>
			<MemoryRouter>{ui}</MemoryRouter>
		</QueryClientProvider>,
	);
}

const logCalls = () => captured.filter((c) => c.url.includes(LOGS_URL));
const statusCalls = () => captured.filter((c) => c.url.includes(STATUS_URL));

describe('logs 页服务端分页契约（A-66）', () => {
	beforeEach(() => {
		captured.length = 0;
		installCaptureAdapter();
	});

	afterEach(() => {
		apiClient.defaults.adapter = originalAdapter as any;
	});

	it('AC-AB1-33：首屏请求带 page/page_size，total 驱动分页器，切页发出 page=2 服务端请求', async () => {
		renderPage(<LogsPage />);

		// ① 首屏渲染：snake 行经拦截器 camel 化后出表
		// W1b（A-69）：action 经 i18n 归一渲染（LOGIN → logs.action.login =「登录」）；
		// 未收录动作仍回退原值（admin_list_keys）
		expect(await screen.findByText('登录')).toBeTruthy();
		expect(screen.getByText('admin_list_keys')).toBeTruthy();

		// ② 请求参数：恰含 page/page_size（旧缺陷不传分页参数 → 后端默认截断）
		await waitFor(() => expect(logCalls().length).toBeGreaterThan(0));
		expect(logCalls()[0].params).toEqual({ page: 1, page_size: 10 });

		// ③ 单次列表请求：无前端二次取数旁路
		expect(logCalls()).toHaveLength(1);

		// ④ total=43（服务端）驱动分页器：第 2 页可达（旧缺陷前端 slice 假分页只有 1 页）
		expect(screen.getByTitle('2')).toBeTruthy();
		expect(screen.getByTitle('5')).toBeTruthy();

		// ⑤ 切页：点击第 2 页 → 发出 page=2&page_size=10 的真实服务端请求
		fireEvent.click(screen.getByTitle('2'));
		await waitFor(() => expect(logCalls().some((c) => c.params?.page === 2)).toBe(true));
		const page2 = logCalls().filter((c) => c.params?.page === 2);
		expect(page2[0].params!.page_size).toBe(10);
	});
});

describe('status 页 summary 契约（A-63）', () => {
	beforeEach(() => {
		captured.length = 0;
		installCaptureAdapter();
	});

	afterEach(() => {
		apiClient.defaults.adapter = originalAdapter as any;
	});

	it('AC-AB1-34：summary 五字段全部渲染，无 undefined/占位空', async () => {
		renderPage(<StatusPage />);

		// ① 请求端点正确
		await waitFor(() => expect(statusCalls().length).toBeGreaterThan(0));
		expect(statusCalls()[0].url).toContain(STATUS_URL);

		// ② overall_status → 中文状态（旧缺陷按 services[] 解包 → 恒空/Empty）
		expect(await screen.findByText('正常')).toBeTruthy();

		// ③ services_healthy / services_total 同卡渲染
		expect(screen.getByText('25 / 26')).toBeTruthy();

		// ④ active_incidents：标签 + 数值
		expect(screen.getByText('活跃事件')).toBeTruthy();
		expect(screen.getByText('3')).toBeTruthy();

		// ⑤ last_updated：标签 + 原值
		expect(screen.getByText('最近更新')).toBeTruthy();
		expect(screen.getByText('2026-10-04 12:30:00')).toBeTruthy();

		// ⑥ 无 undefined/占位空
		expect(screen.queryByText('undefined')).toBeNull();
		expect(screen.queryByText('-')).toBeNull();
	});
});
