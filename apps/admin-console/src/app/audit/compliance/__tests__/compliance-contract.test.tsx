// TASK-AB2-22（fix-admin-b2-security-forensics / A-220 · AC-B2-037/038）：合规审计页路径单源锁 + 三态分离。
//
// A-220（RC-B2-11 / H010）：api-paths 两常量与后端注册路由漂移（旧值 cross-border-transfers /
//   role-action-mappings vs router.go:146/153 的 `/compliance/cross-border`、`/compliance/role-actions`）
//   → 两 Tab 404；且 CrudTab 失败仅瞬时 toast → 「暂无数据」空表 = 失败伪装空态（DOM 无从区分）。
//   修：①ui/packages/shared/src/constants/api-paths.ts 两常量修正（单源；白名单唯一 ui 文件）；
//   ②CrudTab 增 error state（失败 ≠ 空态：PageError + 重试，替换 toast 后空表）。
//
// 阶段 A 判绿口径（重要，防误读）：admin-console 消费的是**已发布** @autional/shared（注册表包，
//   非工作区链接）——阶段 A wire 断言锁定真实不变量「页面请求 = 单源常量」（防页面字面写死漂移）；
//   「常量 = 后端真路径」由 ui 源修正保证，Stage B 发布 bump 后本断言即传递等价于真路径，
//   并由 dev 实测两 Tab 200 闭合（plan §14 发布序列已列该步骤）。
//
// 反假绿：
//   ① 跨境传输/角色-动作两 Tab 点开捕获 GET wire === API_PATHS.AUDIT.<对应常量>（非字面量）；
//   ② 成功行上屏（personal-data / auditor）证明数据真实到达（非空表误判）；
//   ③ 失败注入（404）→ PageError「加载数据失败」可见，且激活 pane 内 .ant-table 缺席、
//      「暂无数据」缺席（旧实现同场景 = 隐藏 toast + 空表 → 必红）；
//   ④ 点「重试」→ 请求重发（GET 计数 2）→ 数据行上屏（错误态 → 数据态转换实证）。
//   注：Tabs 已挂载的隐藏 pane 恒留 DOM（PIA 空表及其「暂无数据」始终在场），判别性断言
//   必须以激活 pane（[role="tabpanel"][aria-hidden="false"]）作用域收窄，否则隐藏 pane 会污染全局查询。

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, within, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { apiClient, API_PATHS } from '@autional/shared';
import CompliancePage from '../page';

vi.mock('@/lib/antd-app', () => ({
	message: { success: vi.fn(), error: vi.fn() },
	modal: { confirm: vi.fn() },
}));

const TS = '2026-10-04T00:00:00Z';
const CROSS_BORDER_URL = API_PATHS.AUDIT.ADMIN_COMPLIANCE_CROSS_BORDER;
const ROLE_ACTIONS_URL = API_PATHS.AUDIT.ADMIN_COMPLIANCE_ROLE_ACTIONS;

interface Captured {
	url: string;
	method: string;
}

let captured: Captured[] = [];
let originalAdapter: unknown;
let failCrossBorder = false;

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
	failCrossBorder = false;
	originalAdapter = apiClient.defaults.adapter;
	apiClient.defaults.adapter = (async (config: any) => {
		const url = String(config.url || '');
		captured.push({ url, method: String(config.method || 'get').toLowerCase() });
		if (url === ROLE_ACTIONS_URL) {
			// 真后端形状 = map[string][]string（GetRoleActionMappings）→ 页面折叠为行（A-221/TASK-23）
			return ok(
				{
					code: 0,
					message: 'success',
					data: { auditor: ['read'] },
					timestamp: TS,
				},
				config,
			);
		}
		if (url === CROSS_BORDER_URL) {
			if (failCrossBorder) throw httpError(404, config);
			// 真后端形状 = CrossBorderTransferRecord（dto.go:1460-1469，snake）
			return ok(
				{
					code: 0,
					message: 'success',
					data: [
						{
							id: 'cb-1',
							data_type: 'personal-data',
							from_country: 'CN',
							to_country: 'SG',
							purpose: 'backup',
							safeguard: 'SCC',
							tenant_id: 'tenant-b2x',
							created_at: TS,
						},
					],
					timestamp: TS,
				},
				config,
			);
		}
		// 其余 Tab（初始 PIA 等）：空列表 200
		return ok({ code: 0, message: 'success', data: [], timestamp: TS }, config);
	}) as any;
}

/** 当前激活 pane（Tabs 隐藏 pane 恒挂载于 DOM，判别断言必须作用域收窄）。
 *  选择器用语义属性而非类名：antd v6 的 pane 由 @rc-component/tabs 渲染为
 *  role="tabpanel" + aria-hidden={!active}（类名 `ant-tabs-content*` 属实现细节）。 */
function activePane(): HTMLElement {
	const el = document.querySelector('[role="tabpanel"][aria-hidden="false"]');
	expect(el).not.toBeNull();
	return el as HTMLElement;
}

function crossBorderGets() {
	return captured.filter((c) => c.url === CROSS_BORDER_URL && c.method === 'get');
}

function renderPage() {
	return render(
		<MemoryRouter>
			<CompliancePage />
		</MemoryRouter>,
	);
}

describe('合规审计页路径契约 + 三态分离（A-220 · AC-B2-037/038）', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		installCaptureAdapter();
	});

	afterEach(() => {
		apiClient.defaults.adapter = originalAdapter as any;
	});

	it('AC-B2-037：跨境传输/角色-动作两 Tab 的 GET wire === 单源常量（API_PATHS）；成功行上屏', async () => {
		renderPage();

		fireEvent.click(await screen.findByText('跨境传输'));
		expect(await screen.findByText('personal-data')).toBeInTheDocument();

		fireEvent.click(screen.getByText('角色-动作'));
		expect(await screen.findByText('auditor')).toBeInTheDocument();

		// 单源锁：页面必须请求常量本身（页面若字面写死路径即漂移；常量的真路径修正见
		// ui api-paths.ts——cross-border / role-actions，与 router.go:146/153 对齐）
		const gets = captured.filter((c) => c.method === 'get').map((c) => c.url);
		expect(gets).toContain(CROSS_BORDER_URL);
		expect(gets).toContain(ROLE_ACTIONS_URL);
	});

	it('AC-B2-038：跨境 Tab 404 → 错误态可见（激活 pane 内空表/「暂无数据」缺席）→ 重试恢复数据态', async () => {
		failCrossBorder = true;
		renderPage();

		fireEvent.click(await screen.findByText('跨境传输'));

		// 错误态：PageError 呈现；激活 pane 内无空表、无「暂无数据」（旧实现此场景 = 空表
		// +「暂无数据」伪装 → 必红）
		expect(await screen.findByText('加载数据失败')).toBeInTheDocument();
		expect(activePane().querySelector('.ant-table')).toBeNull();
		expect(within(activePane()).queryByText('暂无数据')).toBeNull();

		// 三态 → 数据态：点「重试」（两字 CJK 按钮被 antd autoInsertSpace 插空格 → role+regex）
		failCrossBorder = false;
		fireEvent.click(screen.getByRole('button', { name: /^重\s*试$/ }));

		expect(await screen.findByText('personal-data')).toBeInTheDocument();
		expect(activePane().querySelector('.ant-table')).not.toBeNull();
		expect(crossBorderGets().length).toBe(2);
	});
});
