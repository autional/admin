// W1e-22（fix-admin-b5-polish / A-200）：审计日志页四处收口回归锁。
//
//   A-200①：tab 恒 "Autional 管理控制台"（无 usePageTitle）→ 挂载 '审计日志 — Autional'；
//   A-200②：操作人列裸 ULID（operator_id 直出）→ 经 useOwnerDisplay 解析成员显示名，未命中回退原值；
//   A-200③：耗时 0ms（后端零值 = 未记录耗时）→ 回落 '-'（旧形态「0ms」是伪数据）；
//   A-200④：验证链失败本地化 fallback（error-handler：传输层英文原文不得顶掉中文 fallback）。
//
// 断言口径 = 渲染输出 + 最终通知实参；穿真实拦截器（wire snake → camel 渲染）。

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router';
import { apiClient, useAuthStore } from '@autional/shared';
import { message } from '@/lib/antd-app';
import AuditLogsPage from '../page';

vi.mock('@/lib/antd-app', () => ({
	message: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
	modal: { confirm: vi.fn() },
}));

const TENANT = 'tenant-w1e';
const LOGS_URL = '/audit/api/v1/admin/audit/logs';
const MEMBERS_URL = `/tenant/api/v1/admin/tenants/${TENANT}/members`;
const VERIFY_URL = '/audit/api/v1/admin/audit/verifications';

const TS = '2026-10-04T00:00:00Z';
/** 已注册成员（operator_id 可解析）与未注册 ULID（回退原值）。 */
const MEMBER_ULID = '01J8ZQ4T5X6Y7Z8A9B0C1D2E3F';
const ORPHAN_ULID = '01J8ZQ4T5X6Y7Z8A9B0C1D9ZZ';

/** 日志行 wire（snake）：行 1 duration=0（未记录）、行 2 duration=42。 */
function logsEnvelope() {
	const rows = [
		{
			id: 'log-1',
			sequence: 101,
			timestamp: 1759536000000,
			operator_id: MEMBER_ULID,
			operator_type: 'user',
			action: 'login',
			module: 'identity',
			level: 'info',
			message: '登录成功',
			target_id: 'sess-1',
			target_type: 'session',
			status: 0,
			ip: '10.0.0.1',
			duration: 0,
		},
		{
			id: 'log-2',
			sequence: 102,
			timestamp: 1759536001000,
			operator_id: ORPHAN_ULID,
			operator_type: 'workload',
			action: 'export',
			module: 'audit',
			level: 'warning',
			message: '导出审计日志',
			target_id: 'job-9',
			target_type: 'export',
			status: 1,
			ip: '10.0.0.2',
			duration: 42,
		},
	];
	return { code: 0, message: 'success', items: rows, total: rows.length, timestamp: TS };
}

interface Captured {
	url: string;
	method: string;
}

let captured: Captured[] = [];
let originalAdapter: unknown;
let failVerify = false;

function ok(payload: unknown, config: any) {
	return { data: payload, status: 200, statusText: 'OK', headers: {}, config };
}

function installCaptureAdapter() {
	captured = [];
	failVerify = false;
	originalAdapter = apiClient.defaults.adapter;
	apiClient.defaults.adapter = (async (config: any) => {
		const url = String(config.url || '');
		const method = String(config.method || 'get').toLowerCase();
		captured.push({ url, method });
		if (failVerify && url === VERIFY_URL) {
			throw new Error('Request failed with status code 500');
		}
		if (url === LOGS_URL) return ok(logsEnvelope(), config);
		if (url === MEMBERS_URL) {
			return ok({
				code: 0,
				message: 'success',
				items: [{ user_id: MEMBER_ULID, username: '张三', email: 'zhangsan@example.com', role: 'member', status: 'active', joined_at: TS }],
				total: 1,
				timestamp: TS,
			}, config);
		}
		return ok({ code: 0, message: 'success', data: {}, items: [], total: 0, timestamp: TS }, config);
	}) as any;
}

function renderPage() {
	const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
	return render(
		<QueryClientProvider client={queryClient}>
			<MemoryRouter>
				<AuditLogsPage />
			</MemoryRouter>
		</QueryClientProvider>,
	);
}

describe('审计日志页 A-200 四项收口', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		installCaptureAdapter();
		useAuthStore.setState({ currentTenantId: TENANT });
	});

	afterEach(() => {
		apiClient.defaults.adapter = originalAdapter as any;
		useAuthStore.setState({ currentTenantId: null });
		window.localStorage.clear();
	});

	it('A-200①：document.title=审计日志 — Autional', async () => {
		renderPage();
		await waitFor(() => expect(document.title).toBe('审计日志 — Autional'));
	});

	it('A-200②：operatorId ULID → 成员显示名（负控：未命中回退原值）', async () => {
		renderPage();
		await waitFor(() => expect(captured.some((c) => c.url === LOGS_URL)).toBe(true));

		// 命中成员 → 显示名上屏
		expect(await screen.findByText('张三')).toBeInTheDocument();
		// 负控：未命中成员 → 原 ULID 原样展示（解析不吞值、不改写）
		expect(screen.getByText(ORPHAN_ULID)).toBeInTheDocument();
		// 命中行不再显示裸 ULID
		expect(screen.queryByText(MEMBER_ULID)).toBeNull();
	});

	it('A-200③：duration=0（未记录）→ 单元格 "-"；duration=42 → "42ms"', async () => {
		renderPage();
		await screen.findByText('张三');

		// 42ms 正例
		expect(screen.getByText('42ms')).toBeInTheDocument();
		// 0ms 旧形态零命中（哨兵回落 '-'）
		expect(screen.queryByText('0ms')).toBeNull();
		// 0 值行内出现 '-'（作用域收窄到该行，避免全表误判）
		const row = screen.getByText('登录成功').closest('tr') as HTMLElement;
		expect(within(row).getByText('-')).toBeInTheDocument();
	});

	it('A-200④：验证链传输层失败 → 中文 fallback（英文原文零透出）', async () => {
		failVerify = true;
		renderPage();
		await screen.findByText('张三');

		fireEvent.click(screen.getByText('验证审计链'));
		await waitFor(() => expect(captured.some((c) => c.url === VERIFY_URL && c.method === 'post')).toBe(true));

		await waitFor(() => expect(vi.mocked(message.error)).toHaveBeenCalledWith('验证请求失败'));
		expect(vi.mocked(message.error).mock.calls.map((c) => String(c[0]))).not.toContain(
			'Request failed with status code 500',
		);
	});
});
