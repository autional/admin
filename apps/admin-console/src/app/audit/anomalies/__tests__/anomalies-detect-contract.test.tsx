// TASK-AB2-20（fix-admin-b2-security-forensics / A-206+A-207f · AC-B2-033/034）：异常检测页契约回归锁。
//
// A-206（RC-B2-09）：检测请求 body 旧恒为 {}（timeRange 状态初值 undefined + 条件省略），
//   而后端 DetectAnomaliesRequest.TimeRange binding:"required"（service-audit dto.go:847-849，
//   白名单 {1h,24h,7d,30d}）→ 默认点「立即运行检测」必 400。
//   修：timeRange 状态默认 '24h'；检测 payload 恒含 timeRange（清了筛选也回落 24h）。
// A-207f（RC-B2-10）：列表/检测失败与「暂无数据」空态混同（旧实现 PageError 与空表并存渲染）；
//   403（后端租户守卫 TASK-AB2-01 语义：tenant isolation required）无专用文案。
//   修：错误态与空态互斥渲染；403 → 专用权限/隔离文案（列表 + 检测两条通道）。
//
// 反假绿：
//   ① detect wire 断言穿真实 apiClient 请求拦截器（camel 书面写 → snake 上 wire），
//      解析 config.data JSON 断言 time_range === '24h' 且为 string（旧实现 {} 直发 → 必炸）；
//   ② 状态默认 '24h' 经列表首请求锁定（旧实现 filter 无默认 → 无 time_range 键 → 必炸）；
//   ③ 列表 403 负控：专用文案可见；表格（空态载体）整体不得渲染、其可见空态描述
//      （.ant-empty-description）不含 No data/暂无数据、通用失败文案不得顶替
//      （旧实现 PageError 与空表并存 → 表格空态描述 'No data' 必现 → 必炸；
//      注：antd Empty 的 SVG <title> 恒含 locale 空态词，不能用裸文本查询判定空态）；
//   ④ 列表 500：通用失败文案可见 + 同上空态缺席（旧实现空表仍在 → 必炸）；
//   ⑤ detect 403：message.error 收到专用文案（旧实现收到回落文案「检测失败」→ 必炸）、
//      success 未调、列表不因失败重拉（负控）；
//   ⑥ detect 500：通用回落文案仍走 handleApiError（防 403 分支劫持全部失败，负控）。

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router';
import { apiClient, useAuthStore } from '@autional/shared';
import { message } from '@/lib/antd-app';
import AuditAnomaliesPage from '../page';

// antd v6 命令式 API 由 AntdAppProvider 的 StaticsBridge 赋值（export let），测试不经 Provider 时为
// undefined——错误路径 message.error 会炸在 undefined 上而吞掉断言（生产由路由层 Provider 保证）。
// 按仓内既有模式桩化（audit-logs/role-activations 同款），使错误分支可被真实驱动。
vi.mock('@/lib/antd-app', () => ({
	message: { success: vi.fn(), error: vi.fn() },
	modal: { confirm: vi.fn() },
}));

const TENANT = 'tenant-b2x';
const ANOMALIES_URL = '/audit/api/v1/admin/audit/anomalies';
const DETECT_URL = '/audit/api/v1/admin/audit/anomalies/detect';
const FORBIDDEN_TEXT = '访问被拒绝：缺少租户上下文或权限不足';
const LOAD_ERROR_TEXT = '加载异常事件失败';
const DETECT_FAILED_TEXT = '检测失败';
const DETECT_SUCCESS_TEXT = '异常检测已完成';

// wire 形状（snake）列表行（service-audit AnomalyResponse 夹具）。
const ANOMALY = {
	id: 'anom-b2-01',
	severity: 'high',
	type: 'brute_force',
	description: '异常夹具（AC-B2-033）',
	status: 'open',
	user_id: 'user-b2',
	detected_at: 1759536000000,
};

interface Captured {
	url: string;
	method: string;
	params: any;
	data: any;
}

let captured: Captured[] = [];
let originalAdapter: unknown;
let failListStatus: number | null = null;
let failDetectStatus: number | null = null;

/** axios 形状的 HTTP 错误（穿响应拦截器：非 401/404 → 原样 reject）。message 留空 → 键链回落 fallback。 */
function httpError(status: number, config: any) {
	const err: any = new Error('');
	err.response = { status, data: { code: `${status}00000` }, headers: {}, config };
	err.config = config;
	return err;
}

function ok(payload: unknown, config: any) {
	return { data: payload, status: 200, statusText: 'OK', headers: {}, config };
}

function installCaptureAdapter() {
	captured = [];
	failListStatus = null;
	failDetectStatus = null;
	originalAdapter = apiClient.defaults.adapter;
	apiClient.defaults.adapter = (async (config: any) => {
		const url = String(config.url || '');
		captured.push({
			url,
			method: String(config.method || 'get').toLowerCase(),
			params: config.params,
			data: config.data,
		});
		const ts = '2026-10-04T00:00:00Z';
		if (url.endsWith('/anomalies/detect')) {
			if (failDetectStatus) throw httpError(failDetectStatus, config);
			return ok({ code: 0, message: 'success', data: { task_id: 'detect-1' }, timestamp: ts }, config);
		}
		if (url === ANOMALIES_URL) {
			if (failListStatus) throw httpError(failListStatus, config);
			return ok(
				{
					code: 0,
					message: 'success',
					items: [ANOMALY],
					total: 1,
					pagination: { page: 1, page_size: 20, total: 1 },
					timestamp: ts,
				},
				config,
			);
		}
		if (url.includes('/sod-config')) {
			// SoD 模式（useIsAuditRestricted 依赖）：single → 不受限（与角色解耦，测试确定性）。
			return ok(
				{
					code: 0,
					message: 'success',
					data: { tenant_id: TENANT, sod_mode: 'single', updated_at: ts },
					timestamp: ts,
				},
				config,
			);
		}
		return ok({ code: 0, message: 'success', items: [], total: 0, timestamp: ts }, config);
	}) as any;
}

function listRequests() {
	return captured.filter((c) => c.url === ANOMALIES_URL);
}

function detectRequests() {
	return captured.filter((c) => c.url === DETECT_URL);
}

/** 用户可见的空态描述文案（antd Table 空态照 .ant-empty-description；
 *  Empty 的 SVG <title> 恒含 locale 空态词，不能用裸文本查询判定空态）。 */
function emptyDescriptions(): string[] {
	return Array.from(document.querySelectorAll('.ant-empty-description')).map(
		(el) => el.textContent || '',
	);
}

function renderPage() {
	const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
	return render(
		<QueryClientProvider client={queryClient}>
			<MemoryRouter>
				<AuditAnomaliesPage />
			</MemoryRouter>
		</QueryClientProvider>,
	);
}

describe('异常检测页契约（A-206 / A-207f · AC-B2-033/034）', () => {
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

	it('A-206：默认列表与检测请求均恒含 time_range=24h（wire 断言）；检测成功 → 成功提示 + 列表重拉', async () => {
		renderPage();

		await waitFor(() => expect(listRequests().length).toBeGreaterThan(0));
		// 实施要点 1（状态默认 '24h'）经列表首请求锁定：旧实现 undefined → 无 time_range 键（必炸）
		expect(listRequests()[0].params.time_range).toBe('24h');

		fireEvent.click(screen.getByText('立即运行检测'));
		await waitFor(() => expect(detectRequests().length).toBe(1));

		// 判别核心：旧实现恒发 {} → time_range 缺失（A-206 的 400 根因）；JSON 体经拦截器 snake 化
		const body = JSON.parse(detectRequests()[0].data);
		expect(body.time_range).toBe('24h');
		expect(typeof body.time_range).toBe('string');

		await waitFor(() => expect(vi.mocked(message.success)).toHaveBeenCalledWith(DETECT_SUCCESS_TEXT));
		// 检测成功 → 列表重拉（显式 refetch；invalidateQueries 同目的，至少 +1 次）
		await waitFor(() => expect(listRequests().length).toBeGreaterThan(1));
		expect(vi.mocked(message.error)).not.toHaveBeenCalled();
	});

	it('A-207f：列表 403 → 专用权限/隔离文案；空态与通用失败文案均不出现（错误态 ≠ 空态）', async () => {
		failListStatus = 403;
		renderPage();

		expect(await screen.findByText(FORBIDDEN_TEXT)).toBeInTheDocument();
		// 旧实现：PageError 与空表并存渲染 → 表格空态必现（错误被「暂无数据」顶替）
		expect(document.querySelector('.ant-table')).toBeNull();
		expect(emptyDescriptions()).not.toContain('No data');
		expect(emptyDescriptions()).not.toContain('暂无数据');
		// 403 走专用文案，通用失败文案不得顶替
		expect(screen.queryByText(LOAD_ERROR_TEXT)).toBeNull();
	});

	it('A-207f：列表 500 → 通用失败文案可见且空态文案缺席（错误态 ≠ 空态）', async () => {
		failListStatus = 500;
		renderPage();

		expect(await screen.findByText(LOAD_ERROR_TEXT)).toBeInTheDocument();
		// 旧实现：空表仍在 → 表格空态必现（必炸）
		expect(document.querySelector('.ant-table')).toBeNull();
		expect(emptyDescriptions()).not.toContain('No data');
		expect(emptyDescriptions()).not.toContain('暂无数据');
		expect(screen.queryByText(FORBIDDEN_TEXT)).toBeNull();
	});

	it('A-207f：detect 403 → 专用文案 toast；success 未调；列表不因失败重拉（负控）', async () => {
		renderPage();
		await waitFor(() => expect(listRequests().length).toBeGreaterThan(0));

		failDetectStatus = 403;
		fireEvent.click(screen.getByText('立即运行检测'));

		// 旧实现：handleApiError 回落「检测失败」→ 专用文案断言必炸
		await waitFor(() => expect(vi.mocked(message.error)).toHaveBeenCalledWith(FORBIDDEN_TEXT));
		expect(vi.mocked(message.success)).not.toHaveBeenCalled();
		// 负控：失败不得触发列表重拉（onSuccess/refetch 均不应发生）
		expect(listRequests().length).toBe(1);
	});

	it('A-207f：detect 500 → 通用回落文案仍走 handleApiError（防 403 分支劫持全部失败，负控）', async () => {
		renderPage();
		await waitFor(() => expect(listRequests().length).toBeGreaterThan(0));

		failDetectStatus = 500;
		fireEvent.click(screen.getByText('立即运行检测'));

		await waitFor(() => expect(vi.mocked(message.error)).toHaveBeenCalledWith(DETECT_FAILED_TEXT));
		expect(vi.mocked(message.success)).not.toHaveBeenCalled();
	});
});
