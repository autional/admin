// W1e-24（fix-admin-b5-polish / A-211 + A-212 + A-213 + A-214）：异常检测页四处收口回归锁。
//
//   A-211：指派空输入静默 return → warning 提示 + 确定按钮禁用（空/纯空白）；
//   A-212：① 评论作者 authorName 恒空 → 成员表按 authorId 解析显示名；
//          ② 提交后 currentRecord 不更新（须关重开才可见）→ 接口返回更新后实体回写抽屉；
//          ③ TextArea 无 maxLength → 2000（后端上限同源）+ 计数；
//   A-213：severity/type/status 列英文原值 → 词表本地化（wire snake 值经 OPTIONS 词表按值取标签，
//          未收录回退原值）；detectedAt ISO UTC → 按 i18n.language 本地化；嵌套 Modal 关闭按钮 a11y 名「关闭」；
//   A-214：tab 恒 "Autional 管理控制台" → '异常检测 — Autional'；login_sessions 完整数据补齐渲染。
//
// 断言口径 = 渲染输出 + 最终通知实参；穿真实拦截器（wire snake → camel 渲染）。
// message.warning 在本页被 A-211 消费 —— mock 必须含 warning。

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router';
import { apiClient, useAuthStore } from '@autional/shared';
import { message } from '@/lib/antd-app';
import AuditAnomaliesPage from '../page';

vi.mock('@/lib/antd-app', () => ({
	message: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
	modal: { confirm: vi.fn() },
}));

const TENANT = 'tenant-w1e-anom';
const ANOMALIES_URL = '/audit/api/v1/admin/audit/anomalies';
const ANOMALY_ID = 'anom-w1e-01';
const COMMENT_URL = `${ANOMALIES_URL}/${ANOMALY_ID}/comment`;
const TIMELINE_URL = `${ANOMALIES_URL}/${ANOMALY_ID}/timeline`;
const MEMBERS_URL = `/tenant/api/v1/admin/tenants/${TENANT}/members`;
const TS = '2026-10-04T00:00:00Z';
const DETECTED_AT_MS = 1759536000000;
const MEMBER_ULID = '01J8ZQ4T5X6Y7Z8A9B0C1D2E3F';
const COMMENT_CONTENT = '已确认存在异常登录，转入调查';

/** 列表行 wire（snake）：severity=high / type=brute_force / status=open（词表全量可解析）。 */
function anomalyRow(overrides: Record<string, unknown> = {}) {
	return {
		id: ANOMALY_ID,
		severity: 'high',
		type: 'brute_force',
		description: '异常描述（W1e）',
		status: 'open',
		user_id: 'user-w1e',
		detected_at: DETECTED_AT_MS,
		comments: [],
		...overrides,
	};
}

function listEnvelope() {
	return {
		code: 0,
		message: 'success',
		items: [anomalyRow()],
		total: 1,
		pagination: { page: 1, page_size: 20, total: 1 },
		timestamp: TS,
	};
}

/** 评论 POST 响应：整条更新后的异常（含新评论；author_name 恒空 = 后端真形状）。 */
function commentedEnvelope() {
	return {
		code: 0,
		message: 'success',
		data: anomalyRow({
			comments: [
				{
					author_id: MEMBER_ULID,
					author_name: '',
					content: COMMENT_CONTENT,
					created_at: DETECTED_AT_MS,
				},
			],
		}),
		timestamp: TS,
	};
}

/** timeline 响应：login_sessions 完整行（fingerprint/UA/event_count/first_seen/last_seen）。 */
function timelineEnvelope() {
	return {
		code: 0,
		message: 'success',
		data: {
			anomaly: anomalyRow(),
			context: { total_events: 3, unique_devices: 1, unique_ips: 1, time_span_seconds: 600 },
			login_sessions: [
				{
					fingerprint: 'fp-abc-123',
					ip: '10.0.0.9',
					user_agent: 'Mozilla/5.0 Test Agent',
					event_count: 5,
					first_seen: DETECTED_AT_MS,
					last_seen: DETECTED_AT_MS,
				},
			],
			events: [],
		},
		timestamp: TS,
	};
}

interface Captured {
	url: string;
	method: string;
	data?: unknown;
}

let captured: Captured[] = [];
let originalAdapter: unknown;

function ok(payload: unknown, config: any) {
	return { data: payload, status: 200, statusText: 'OK', headers: {}, config };
}

function installCaptureAdapter() {
	captured = [];
	originalAdapter = apiClient.defaults.adapter;
	apiClient.defaults.adapter = (async (config: any) => {
		const url = String(config.url || '');
		const method = String(config.method || 'get').toLowerCase();
		captured.push({ url, method, data: config.data });
		if (url === COMMENT_URL) return ok(commentedEnvelope(), config);
		if (url === TIMELINE_URL) return ok(timelineEnvelope(), config);
		if (url === ANOMALIES_URL) return ok(listEnvelope(), config);
		if (url === MEMBERS_URL) {
			return ok(
				{
					code: 0,
					message: 'success',
					items: [
						{
							user_id: MEMBER_ULID,
							username: '李四',
							email: 'lisi@example.com',
							role: 'member',
							status: 'active',
							joined_at: TS,
						},
					],
					total: 1,
					timestamp: TS,
				},
				config,
			);
		}
		if (url.includes('/sod-config')) {
			return ok(
				{
					code: 0,
					message: 'success',
					data: { tenant_id: TENANT, sod_mode: 'single', updated_at: TS },
					timestamp: TS,
				},
				config,
			);
		}
		return ok({ code: 0, message: 'success', items: [], total: 0, timestamp: TS }, config);
	}) as any;
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

/** Modal 确定按钮（无 ConfigProvider → antd 默认 en locale = OK；兼容 zh 文案）。 */
function modalOkButton(): HTMLElement {
	return screen.getByRole('button', { name: /^(OK|确\s*定|确定)$/ }) as HTMLElement;
}

describe('异常检测页 A-211/A-212/A-213/A-214 收口', () => {
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

	it('A-214①：document.title=异常检测 — Autional（术语与菜单/面包屑对齐）', async () => {
		renderPage();
		await waitFor(() => expect(document.title).toBe('异常检测 — Autional'));
	});

	it('A-213：severity/type/status 词表本地化 + detectedAt 本地化（英文/snake/ISO 零命中）', async () => {
		renderPage();
		await screen.findByText('异常描述（W1e）');

		// 词表：high→高 / brute_force→暴力破解 / open→待处理（wire snake 值经 OPTIONS 按值取标签）
		expect(screen.getByText('高')).toBeInTheDocument();
		expect(screen.getByText('暴力破解')).toBeInTheDocument();
		expect(screen.getByText('待处理')).toBeInTheDocument();
		// 旧形态零命中：英文 severity / snake type / 英文 status
		expect(screen.queryByText('high')).toBeNull();
		expect(screen.queryByText('brute_force')).toBeNull();
		expect(screen.queryByText('open')).toBeNull();

		// detectedAt（毫秒）→ toLocaleString(i18n.language)；ISO 原文零命中
		expect(screen.getByText(new Date(DETECTED_AT_MS).toLocaleString('zh-CN'))).toBeInTheDocument();
		expect(screen.queryByText(String(DETECTED_AT_MS))).toBeNull();
	});

	it('A-211：指派空输入 → warning + 确定禁用 + 零请求；嵌套 Modal 关闭按钮 a11y 名=「关闭」', async () => {
		renderPage();
		await screen.findByText('异常描述（W1e）');

		fireEvent.click(screen.getByText(/^指\s*派$/));

		const okBtn = await waitFor(() => modalOkButton());
		expect(okBtn.hasAttribute('disabled')).toBe(true);

		const input = screen.getByPlaceholderText('例如 analyst-001') as HTMLInputElement;
		fireEvent.keyDown(input, { key: 'Enter', code: 'Enter', keyCode: 13 });
		await waitFor(() =>
			expect(vi.mocked(message.warning)).toHaveBeenCalledWith('请输入处理人名称或 ID'),
		);
		// 负控：空输入不发请求（assign 全页零 POST）
		expect(captured.filter((c) => c.method === 'post')).toHaveLength(0);

		// A-213 家族：嵌套 Modal 关闭按钮本地化（旧形态 aria-label="Close"）
		expect(screen.getByRole('button', { name: '关闭' })).toBeInTheDocument();
		expect(screen.queryByRole('button', { name: 'Close' })).toBeNull();
	});

	it('A-212：评论 maxLength=2000 + 提交回写抽屉（新评论即时可见 + 作者显示名解析）', async () => {
		renderPage();
		await screen.findByText('异常描述（W1e）');

		// 开抽屉
		fireEvent.click(screen.getByText(/^详\s*情$/));
		expect(await screen.findByText('调查评论')).toBeInTheDocument();
		// 首态：无评论 → 空态提示
		expect(screen.getByText('暂无评论')).toBeInTheDocument();

		// maxLength 同源后端 2000（旧形态无上限，超限即 400）
		const textarea = screen.getByPlaceholderText('添加调查评论…') as HTMLTextAreaElement;
		expect(textarea.getAttribute('maxlength')).toBe('2000');

		fireEvent.change(textarea, { target: { value: COMMENT_CONTENT } });
		const submitBtn = screen.getByRole('button', { name: /^提\s*交$/ });
		fireEvent.click(submitBtn);

		// 回写：新评论即时可见（旧实现仅 refetch 列表 → 须关重开才可见）
		await waitFor(() => expect(captured.some((c) => c.url === COMMENT_URL && c.method === 'post')).toBe(true));
		expect(await screen.findByText(COMMENT_CONTENT)).toBeInTheDocument();
		// 作者 ULID → 成员显示名（authorName 恒空 → 成员表按 authorId 解析）
		expect(screen.getByText(/李四/)).toBeInTheDocument();
		// 回写后空态退场
		expect(screen.queryByText('暂无评论')).toBeNull();
		// wire 体：content 书面写（拦截器 snake 化；此键后端同形）
		const call = captured.find((c) => c.url === COMMENT_URL) as Captured;
		expect(JSON.parse(String(call.data)).content).toBe(COMMENT_CONTENT);
	});

	it('A-214②：login_sessions 完整数据补齐渲染（指纹/UA/事件数/首末见）', async () => {
		renderPage();
		await screen.findByText('异常描述（W1e）');

		fireEvent.click(screen.getByText(/^详\s*情$/));
		await waitFor(() => expect(captured.some((c) => c.url === TIMELINE_URL)).toBe(true));

		// 会话区块标题 + 行内容（旧实现 login_sessions 零渲染 → 全炸）
		const heading = await screen.findByText('登录会话');
		expect(heading).toBeInTheDocument();
		const block = heading.parentElement as HTMLElement;
		const scope = within(block);
		expect(scope.getByText('fp-abc-123')).toBeInTheDocument();
		expect(scope.getByText(/Mozilla\/5\.0 Test Agent/)).toBeInTheDocument();
		// event_count=5 → 「5 次」模板（同节点拼接首末见文本 → 正则子串匹配）
		expect(scope.getByText(/5 次/)).toBeInTheDocument();
		// first_seen – last_seen 本地化（同值 → 双联文本）
		expect(
			scope.getAllByText(new RegExp(new Date(DETECTED_AT_MS).toLocaleString('zh-CN').replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))).length,
		).toBeGreaterThan(0);
	});
});
