// TASK-AB2-21（fix-admin-b2-security-forensics / A-215f · AC-B2-035/036）：保留页归档契约回归锁。
//
// A-215（RC-B2-07 / H009）：`handleArchiveNow` 旧发 `{ before: Date.now() }`（13 位毫秒），
//   后端 `time.Unix(before,0)` 按秒解释（stats_service_impl.go:133-135）→ 截止 ≈ 公元 58000 年
//   → 本租户全量审计日志被导出+删除；且按钮直连 onClick 零二次确认。
//   修（ADR-B2-10 / ADR-B2-04）：before = `dayjs().unix()` 10 位秒；Popconfirm 先出影响面
//   （条数 = `adminAuditLogs({ end_time: before, page_size: 1 })` 的 total，取数失败 → 「无法预估」+ 警告仍在）。
//
// 反假绿：
//   ① wire 断言穿真实 apiClient 拦截器（书面即 snake 契约键 → 拦截器幂等直过）：条数与归档均为 number、
//      10 位、落在点击时刻 [t0,t1] 区间内（旧实现 13 位毫秒 → 正则必炸）；
//   ② 条数与归档 before **同值**（ADR-B2-04 同口径）——防"两处各算一次"漂移；
//   ③ 负控：Popconfirm 确认前零归档请求（旧实现点击即发 → 必炸）；
//   ④ 取消路径：弹层确已打开（条数可见）后点取消 → 零归档请求（防「根本没打开」假绿）；
//   ⑤ 取数失败：显示「无法预估条数」+ 不可逆警告仍在，确认仍发归档（不回退为无确认）；
//   ⑥ 归档成功 → message.success（响应 archivedCount 链路）。

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router';
import dayjs from 'dayjs';
import { apiClient } from '@autional/shared';
import { message } from '@/lib/antd-app';
import RetentionPolicyPage from '../page';

// antd v6 命令式 API 由 AntdAppProvider 的 StaticsBridge 赋值（export let），测试不经 Provider 时为
// undefined——归档成功/失败路径的 message 会炸在 undefined 上（生产由路由层 Provider 保证）。
// 按仓内既有模式桩化（audit-logs / role-activations 同款）。
vi.mock('@/lib/antd-app', () => ({
	message: { success: vi.fn(), error: vi.fn() },
	modal: { confirm: vi.fn() },
}));

const TENANT = 'tenant-b2x';
const POLICY_URL = '/audit/api/v1/admin/audit/retention-policy';
const STATUS_URL = '/audit/api/v1/admin/audit/archive/status';
const ARCHIVE_URL = '/audit/api/v1/admin/audit/archive';
const LOGS_URL = '/audit/api/v1/admin/audit/logs';
const COUNT = 42;
const TS = '2026-10-04T00:00:00Z';

const COUNT_TEXT = `将归档 ${COUNT} 条审计日志`;
const UNKNOWN_TEXT = '无法预估条数';
const WARNING_TEXT = '导出后删除源记录，不可逆';
const OK_TEXT = '确认归档';
// antd v6 Button 对「恰好两个汉字」自动插空格（autoInsertSpace；生产 ConfigProvider 未关 ⇒ 线上同为
// 「取 消」四字假象不成立）——裸文本查询 `getByText('取消')` 必炸。按仓内既有模式（agents-contract
// `clickModalOk`）以 role+regex 容忍空档。
const CANCEL_TEXT_RE = /^取\s*消$/;

interface Captured {
	url: string;
	method: string;
	params: any;
	data: any;
}

let captured: Captured[] = [];
let originalAdapter: unknown;
let failCount = false;

function ok(payload: unknown, config: any) {
	return { data: payload, status: 200, statusText: 'OK', headers: {}, config };
}

function httpError(status: number, config: any) {
	const err: any = new Error('');
	err.response = { status, data: { code: `${status}00000` }, headers: {}, config };
	err.config = config;
	return err;
}

function installCaptureAdapter() {
	captured = [];
	failCount = false;
	originalAdapter = apiClient.defaults.adapter;
	apiClient.defaults.adapter = (async (config: any) => {
		const url = String(config.url || '');
		captured.push({
			url,
			method: String(config.method || 'get').toLowerCase(),
			params: config.params,
			data: config.data,
		});
		if (url === POLICY_URL) {
			return ok(
				{
					code: 0,
					message: 'success',
					data: {
						tenant_id: TENANT,
						days: 90,
						enabled: true,
						archive_to: 'minio',
						bucket: 'audit-archive',
					},
					timestamp: TS,
				},
				config,
			);
		}
		if (url === STATUS_URL) {
			return ok(
				{
					code: 0,
					message: 'success',
					data: { enabled: true, days: 90, bucket: 'audit-archive', last_archive: 1759536000000 },
					timestamp: TS,
				},
				config,
			);
		}
		if (url === ARCHIVE_URL) {
			return ok(
				{ code: 0, message: 'success', data: { archived_count: 7, tenant_id: TENANT }, timestamp: TS },
				config,
			);
		}
		if (url === LOGS_URL) {
			if (failCount) throw httpError(500, config);
			return ok({ code: 0, message: 'success', items: [], total: COUNT, timestamp: TS }, config);
		}
		return ok({ code: 0, message: 'success', items: [], total: 0, timestamp: TS }, config);
	}) as any;
}

function logRequests() {
	return captured.filter((c) => c.url === LOGS_URL);
}

function archivePosts() {
	return captured.filter((c) => c.url === ARCHIVE_URL && c.method === 'post');
}

function renderPage() {
	const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
	return render(
		<QueryClientProvider client={queryClient}>
			<MemoryRouter>
				<RetentionPolicyPage />
			</MemoryRouter>
		</QueryClientProvider>,
	);
}

/** 打开 Popconfirm（等待影响面条数上屏，证明弹层已开）。 */
async function openArchivePopconfirm(expected = COUNT_TEXT) {
	fireEvent.click(await screen.findByText('立即归档'));
	expect(await screen.findByText(expected)).toBeInTheDocument();
}

describe('保留页归档契约（A-215f · AC-B2-035/036）', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		installCaptureAdapter();
	});

	afterEach(() => {
		apiClient.defaults.adapter = originalAdapter as any;
		window.localStorage.clear();
	});

	it('AC-B2-035/036：Popconfirm 出条数（= 列表 total）与警告；确认前零归档请求；确认才发且 before 为同值 10 位秒', async () => {
		renderPage();

		const t0 = dayjs().unix();
		await openArchivePopconfirm();
		const t1 = dayjs().unix();
		expect(screen.getByText(WARNING_TEXT)).toBeInTheDocument();

		// 条数取数 wire：列表 total（page_size=1；end_time 为 10 位秒且在点击时刻区间内）
		const countReq = logRequests().at(-1) as Captured;
		expect(countReq.params.page_size).toBe(1);
		const countBefore = countReq.params.end_time;
		expect(typeof countBefore).toBe('number');
		expect(String(countBefore)).toMatch(/^\d{10}$/); // 旧实现 13 位毫秒 → 必炸
		expect(countBefore).toBeGreaterThanOrEqual(t0);
		expect(countBefore).toBeLessThanOrEqual(t1);

		// 负控：确认前零归档请求（旧实现点击即发 → 必炸）
		expect(archivePosts().length).toBe(0);

		fireEvent.click(screen.getByText(OK_TEXT));

		await waitFor(() => expect(archivePosts().length).toBe(1));
		const body = JSON.parse(archivePosts()[0].data);
		expect(typeof body.before).toBe('number');
		expect(String(body.before)).toMatch(/^\d{10}$/);
		expect(body.before).toBe(countBefore); // ADR-B2-04：影响面与归档同口径（同值）

		 // 归档成功链路（响应 archivedCount → toast）
		await waitFor(() => expect(vi.mocked(message.success)).toHaveBeenCalled());
	});

	it('AC-B2-036：取消 → 零归档请求（弹层确已打开后取消）', async () => {
		renderPage();
		await openArchivePopconfirm();

		fireEvent.click(screen.getByRole('button', { name: CANCEL_TEXT_RE }));

		// 负控：条数请求确实发生过（防「根本没打开」型假绿）；取消后归档仍为零
		expect(logRequests().length).toBeGreaterThan(0);
		expect(archivePosts().length).toBe(0);
	});

	it('AC-B2-036：条数取数失败 → 「无法预估条数」+ 警告仍在；确认仍发归档（不回退为无确认）', async () => {
		failCount = true;
		renderPage();
		await openArchivePopconfirm(UNKNOWN_TEXT);
		expect(screen.getByText(WARNING_TEXT)).toBeInTheDocument();

		fireEvent.click(screen.getByText(OK_TEXT));

		await waitFor(() => expect(archivePosts().length).toBe(1));
		const body = JSON.parse(archivePosts()[0].data);
		expect(String(body.before)).toMatch(/^\d{10}$/);
	});
});
