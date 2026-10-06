// TASK-AB2-24（fix-admin-b2-security-forensics / A-222 · AC-B2-042 + A-223 · AC-B2-043）：
// 合规实体只读化（死按钮清零）+ breach/cleanup 表单与列逐个对齐 DTO。
//
// A-222（RC-B2-11）：后端合规实体**有意无 PUT/DELETE**（router.go:199-211 REDLINE「合规文档追加版本，
//   不原地修改 / 不可物理删除」+ check-audit-immutability.py P0），前端 CrudTab 每行无条件渲染编辑/删除
//   → 点击必「更新失败/删除失败」死按钮。修：CrudTab 整体删去编辑/删除代码路径（零 PUT/DELETE 调用），
//   6 个 CRUD Tab 仅保留创建+刷新，并附「追加留痕」说明（appendOnlyHint）。
// A-223（RC-B2-11）：breach 旧表单 {title, description, severity, affectedData, reportedTo, status} vs
//   `CreateBreachNotificationRequest{title* required, description, severity* required, affected_users int64}`
//   （dto.go:1350-1355）⇒ 后三字段被 Go 静默丢弃（假成功），且响应 BreachNotificationResponse
//   （dto.go:1439-1447）无 status/reportedTo ⇒ 两列恒空；cleanup 旧表单 {recordType, targetId, reason,
//   method, recordsDeleted, status} vs `CreateCleanupRecordRequest{record_type* required, count, period}`
//   （dto.go:1410-1414）⇒ 多数字段丢弃 + 缺 count/period 输入口，响应 CleanupRecordResponse
//   （dto.go:1485-1492）无 targetId/method/status ⇒ 三列恒空。修：表单/列/提交体逐键对齐。
//
// 反假绿：
//   ① 只读化断言以「有行」为前提——桩为 6 个 CRUD 端点各产 1 行（旧实现行内恒有编辑/删除按钮 → 必红）；
//      同断言「创建」按钮仍在（防过度只读化的反向控制）；
//   ② 全页零 PUT/DELETE wire（含全交互过程）；
//   ③ breach/cleanup wire **逐键全等**（旧表单键集必不等 → 必红）+ 缺必填负控（零 POST + 内联错误）；
//   ④ 创建成功 → 列表重取 → 新行上屏且 affected_users/count/period 真值渲染（旧列无这些键 → 恒空 → 必红）。
//
// 注：判别性查询一律经 activePane()（[role="tabpanel"][aria-hidden="false"]）收窄——Tabs 隐藏 pane
//   恒挂载（各 pane 各有一枚「创建」按钮、各有一份 appendOnlyHint 文案）。

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, within, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router';
import { apiClient, API_PATHS } from '@autional/shared';
import { message } from '@/lib/antd-app';
import CompliancePage from '../page';

vi.mock('@/lib/antd-app', () => ({
	message: { success: vi.fn(), error: vi.fn() },
	modal: { confirm: vi.fn() },
}));

const TS = '2026-10-04T00:00:00Z';
const PIAS_URL = API_PATHS.AUDIT.ADMIN_COMPLIANCE_PIAS;
const BREACHES_URL = API_PATHS.AUDIT.ADMIN_COMPLIANCE_BREACHES;
const DATA_CLASS_URL = API_PATHS.AUDIT.ADMIN_COMPLIANCE_DATA_CLASS;
const CROSS_BORDER_URL = API_PATHS.AUDIT.ADMIN_COMPLIANCE_CROSS_BORDER;
const AI_URL = API_PATHS.AUDIT.ADMIN_COMPLIANCE_AI_DECISIONS;
const CLEANUP_URL = API_PATHS.AUDIT.ADMIN_COMPLIANCE_CLEANUP;

interface Captured {
	url: string;
	method: string;
	data?: string;
}

let captured: Captured[] = [];
let originalAdapter: unknown;
const rows: Record<string, any[]> = {};

function ok(payload: unknown, config: any) {
	return { data: payload, status: 200, statusText: 'OK', headers: {}, config };
}

/** 6 个 CRUD 端点各预置 1 行（只读化判别的必要前提：无行则旧实现也无按钮可渲染）。 */
function seedRows() {
	rows[PIAS_URL] = [{ id: 'pia-1', name: 'PIA Row', data_types: ['email'], purpose: 'p', risk_level: 'low', tenant_id: 't', created_at: TS }];
	rows[BREACHES_URL] = [{ id: 'br-1', title: 'Breach Row', severity: 'high', affected_users: 12, tenant_id: 't', created_at: TS }];
	rows[DATA_CLASS_URL] = [{ id: 'dc-1', data_set_name: 'DataClass Row', tiers: 'PII/Confidential', tenant_id: 't', created_at: TS }];
	rows[CROSS_BORDER_URL] = [{ id: 'cb-1', data_type: 'CB Row', from_country: 'CN', to_country: 'SG', tenant_id: 't', created_at: TS }];
	rows[AI_URL] = [{ id: 'ai-1', model_name: 'm', decision_type: 'AI Row', reviewed: false, tenant_id: 't', created_at: TS }];
	rows[CLEANUP_URL] = [{ id: 'cln-1', record_type: 'Cleanup Row', count: 5, period: '2024-01-01~2024-06-30', tenant_id: 't', created_at: TS }];
}

function installCaptureAdapter(seed: boolean) {
	captured = [];
	for (const url of [PIAS_URL, BREACHES_URL, DATA_CLASS_URL, CROSS_BORDER_URL, AI_URL, CLEANUP_URL]) rows[url] = [];
	if (seed) seedRows();
	originalAdapter = apiClient.defaults.adapter;
	apiClient.defaults.adapter = (async (config: any) => {
		const url = String(config.url || '');
		const method = String(config.method || 'get').toLowerCase();
		captured.push({ url, method, data: config.data });
		if (url in rows) {
			if (method === 'post') {
				rows[url] = [{ id: 'created-1', ...JSON.parse(config.data), tenant_id: 'tenant-b2x', created_at: TS }];
			}
			return ok({ code: 0, message: 'success', data: rows[url], timestamp: TS }, config);
		}
		return ok({ code: 0, message: 'success', data: [], timestamp: TS }, config);
	}) as any;
}

function posts(url: string) {
	return captured.filter((c) => c.url === url && c.method === 'post');
}

/** 当前激活 pane（Tabs 隐藏 pane 恒挂载于 DOM，判别断言必须作用域收窄）。 */
function activePane(): HTMLElement {
	const el = document.querySelector('[role="tabpanel"][aria-hidden="false"]');
	expect(el).not.toBeNull();
	return el as HTMLElement;
}

/** antd v6 Button 对「恰好两个汉字」自动插空格 → 以 textContent 正则容忍空档。 */
function findButtonByText(re: RegExp, root: () => HTMLElement): HTMLElement {
	const el = (Array.from(root().querySelectorAll('button')) as HTMLElement[]).find((b) =>
		re.test((b.textContent || '').trim()),
	);
	expect(el).toBeTruthy();
	return el as HTMLElement;
}

/** 激活 pane 内全部「编辑/删除」按钮（A-222 判别器：必须恒为空数组）。 */
function editDeleteButtons(): HTMLElement[] {
	return (Array.from(activePane().querySelectorAll('button')) as HTMLElement[]).filter((b) =>
		/^(编\s*辑|删\s*除)$/.test((b.textContent || '').trim()),
	);
}

function renderPage() {
	const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
	return render(
		<QueryClientProvider client={queryClient}>
			<MemoryRouter>
				<CompliancePage />
			</MemoryRouter>
		</QueryClientProvider>,
	);
}

async function switchTab(label: string) {
	fireEvent.click(screen.getByText(label));
	activePane();
}

async function openCreate() {
	const btn = await waitFor(() => findButtonByText(/^创\s*建$/, activePane));
	fireEvent.click(btn);
	await screen.findByRole('button', { name: /^(OK|确\s*定|确定)$/ });
}

function clickModalOk() {
	fireEvent.click(screen.getByRole('button', { name: /^(OK|确\s*定|确定)$/ }));
}

function formErrorCount() {
	return document.querySelectorAll('.ant-form-item-explain-error').length;
}

describe('合规实体只读化 + breach/cleanup DTO 对齐（A-222/A-223 · AC-B2-042/043）', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	afterEach(() => {
		apiClient.defaults.adapter = originalAdapter as any;
	});

	it('AC-B2-042：六 CRUD Tab 有数据行时零编辑/删除按钮（创建按钮仍在的反向控制）→ 全页零 PUT/DELETE', async () => {
		installCaptureAdapter(true);
		renderPage();

		const cases: Array<[string | null, string]> = [
			[null, 'PIA Row'], // 默认激活 Tab
			['违规事件', 'Breach Row'],
			['数据分类', 'DataClass Row'],
			['跨境传输', 'CB Row'],
			['AI 决策', 'AI Row'],
			['清理记录', 'Cleanup Row'],
		];
		for (const [tab, rowText] of cases) {
			if (tab) await switchTab(tab);
			// 行上屏是判别前提（旧实现：行内恒渲染 编辑+删除 两枚按钮 → 必红）
			expect(await within(activePane()).findByText(rowText)).toBeInTheDocument();
			expect(editDeleteButtons()).toEqual([]);
			// 反向控制：不得过度只读化——创建按钮仍在
			expect(findButtonByText(/^创\s*建$/, activePane)).toBeTruthy();
		}

		// 留痕说明（A-222「预留只读说明」；仅 CRUD Tab 显示）
		expect(
			within(activePane()).getByText('合规记录按审计留痕追加保存，仅支持新增，不支持修改或删除。'),
		).toBeInTheDocument();

		// 全交互过程零 PUT/DELETE wire（红线：后端无此路由，前端不得再发）
		expect(captured.filter((c) => c.method === 'put' || c.method === 'delete')).toEqual([]);
	});

	it('AC-B2-043 breach：缺 title → 内联错误 + 零 POST（负控）；补齐后 wire 逐键 = CreateBreachNotificationRequest → 行上屏', async () => {
		installCaptureAdapter(false);
		renderPage();
		await switchTab('违规事件');
		await openCreate();

		// 负控：title 必填 → 内联错误 + 零 POST
		clickModalOk();
		await waitFor(() => expect(formErrorCount()).toBeGreaterThan(0));
		expect(posts(BREACHES_URL).length).toBe(0);

		fireEvent.change(document.querySelector('#title')!, { target: { value: 'Unauthorized Access' } });
		fireEvent.change(document.querySelector('#description')!, { target: { value: 'Suspicious API access patterns' } });
		fireEvent.change(document.querySelector('#affectedUsers')!, { target: { value: '150' } });
		clickModalOk();

		await waitFor(() => expect(posts(BREACHES_URL).length).toBe(1));
		const body = JSON.parse(posts(BREACHES_URL)[0].data!);
		// 全键集断言（旧表单 affectedData/reportedTo/status → 丢弃字段键集必不等 → 必红）
		expect(Object.keys(body).sort()).toEqual(['affected_users', 'description', 'severity', 'title']);
		expect(body.title).toBe('Unauthorized Access');
		expect(body.description).toBe('Suspicious API access patterns');
		expect(body.severity).toBe('medium'); // 表单初始值（DTO 枚举 low/medium/high/critical）
		expect(body.affected_users).toBe(150); // int64 真数值（旧表单无此字段）

		// 创建成功 → 列表重取 → 新行上屏；affected_users 列真值渲染（旧列无此键 → 恒空 → 必红）
		expect(await screen.findByText('Unauthorized Access')).toBeInTheDocument();
		expect(within(activePane()).getByText('150')).toBeInTheDocument();
		expect(vi.mocked(message.success)).toHaveBeenCalled();
	});

	it('AC-B2-043 cleanup：缺 recordType → 内联错误 + 零 POST（负控）；补齐后 wire 逐键（count 数值 + period 字符串）→ 行上屏', async () => {
		installCaptureAdapter(false);
		renderPage();
		await switchTab('清理记录');
		await openCreate();

		// 负控：recordType 必填 → 内联错误 + 零 POST
		clickModalOk();
		await waitFor(() => expect(formErrorCount()).toBeGreaterThan(0));
		expect(posts(CLEANUP_URL).length).toBe(0);

		fireEvent.change(document.querySelector('#recordType')!, { target: { value: 'retention_cleanup' } });
		fireEvent.change(document.querySelector('#count')!, { target: { value: '5000' } });
		fireEvent.change(document.querySelector('#period')!, { target: { value: '2024-01-01~2024-06-30' } });
		clickModalOk();

		await waitFor(() => expect(posts(CLEANUP_URL).length).toBe(1));
		const body = JSON.parse(posts(CLEANUP_URL)[0].data!);
		// 全键集断言（旧表单 targetId/reason/method/recordsDeleted/status → 键集必不等 → 必红）
		expect(Object.keys(body).sort()).toEqual(['count', 'period', 'record_type']);
		expect(body.record_type).toBe('retention_cleanup');
		expect(body.count).toBe(5000); // 新输入口（旧表单无 count）
		expect(body.period).toBe('2024-01-01~2024-06-30'); // 新输入口（旧表单无 period）

		// 新行上屏 + count/period 列真值渲染（旧列无这些键 → 恒空 → 必红）
		expect(await screen.findByText('retention_cleanup')).toBeInTheDocument();
		expect(within(activePane()).getByText('5000')).toBeInTheDocument();
		expect(within(activePane()).getByText('2024-01-01~2024-06-30')).toBeInTheDocument();
	});
});
