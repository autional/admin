// TASK-AB2-23（fix-admin-b2-security-forensics / A-221 · AC-B2-039/040/041）：合规审计页
// 三表单对齐 DTO + 折叠变换契约锁。
//
// A-221（RC-B2-11 / H011）：PIA/数据分类/AI 决策三 Tab 表单字段与后端 DTO 完全不同源——
//   PIA 旧表单 {title*, dataScope, risks, mitigation, status} vs `CreatePIARequest{name* required,
//   description, data_types[], purpose, risk_level}`（dto.go:1333-1339）⇒ 缺 name 必 400；
//   数据分类旧表单缺 data_set_name*/tiers* 双必填（dto.go:1369-1373）；AI 旧表单缺
//   decision_id*/model* 且 input/output 发字符串而后端为 object（dto.go:749-756）⇒ 提交即 400。
//   修：①表单字段逐项对齐 DTO；②input/output/data_types 走 JSON textarea + parse 校验
//   （ADR-B2-07，非法 JSON 内联报错且阻止提交）；③提交体经 prepareSubmit 构造——键名
//   camel→snake 由已发布 @autional/shared（rc.21）apiClient 请求拦截器承担，wire 断言穿
//   真实拦截器，故断言的是 snake 键 + 真形状（防"页面字面写 snake 键"漂移的反向锁）。
//   A-221 折叠：role-actions 响应 map[string][]string → 行 [{role, actions[]}]；cross-border
//   列对齐 from_country/to_country/purpose/safeguard；sod 列 roles_a/roles_b 数组 join（A-224：
//   旧 dataIndex roleA/roleB 单数键 → 真实数据两列恒空）+ enabled（旧实现零展示）；响应无
//   created_at → 死列删除。
//
// 反假绿：
//   ① 三表单 wire payload **逐键**断言（Object.keys 全等 = DTO 键集；旧表单键集必不等 → 必红）；
//   ② 缺必填前置拦截：零 POST + 内联错误可见（负控）；补齐后同一次提交即发（门禁释放实证）；
//   ③ 非法 JSON：内联错误可见 + 零 POST；改合法后提交即发；
//   ④ 创建成功 → 列表重取（GET 再发）→ 新行上屏 + message.success（假成功反向锁）；
//   ⑤ 折叠渲染判别：role-actions 行/动作、cross-border from/to/safeguard 列、sod 数组 join
//      + enabled（旧实现 roleA/roleB 键不存在 → 两列恒空 → 必红）。
//
// 注：Tabs 隐藏 pane 恒挂载于 DOM → 判别性查询一律经 activePane()（[role="tabpanel"]
//   [aria-hidden="false"]）收窄；创建按钮各 Tab 各一枚（隐藏 pane 同存）→ 必须 within(activePane())。
// 注：请求体断言经 JSON.parse(config.data)（拦截器后已 snake）——用户输入的 JSON 内键示例
//   一律用无大写键（如 user_id），避免拦截器对用户 JSON 内容键做 camel→snake（house 行为）。

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
const DATA_CLASS_URL = API_PATHS.AUDIT.ADMIN_COMPLIANCE_DATA_CLASS;
const AI_URL = API_PATHS.AUDIT.ADMIN_COMPLIANCE_AI_DECISIONS;
const SOD_URL = API_PATHS.AUDIT.ADMIN_COMPLIANCE_SOD_RULES;
const ROLE_ACTIONS_URL = API_PATHS.AUDIT.ADMIN_COMPLIANCE_ROLE_ACTIONS;
const CROSS_BORDER_URL = API_PATHS.AUDIT.ADMIN_COMPLIANCE_CROSS_BORDER;

interface Captured {
	url: string;
	method: string;
	data?: string;
}

let captured: Captured[] = [];
let originalAdapter: unknown;
let piasRows: any[] = [];
let dataClassRows: any[] = [];
let aiRows: any[] = [];

function ok(payload: unknown, config: any) {
	return { data: payload, status: 200, statusText: 'OK', headers: {}, config };
}

function installCaptureAdapter() {
	captured = [];
	piasRows = [];
	dataClassRows = [];
	aiRows = [];
	originalAdapter = apiClient.defaults.adapter;
	apiClient.defaults.adapter = (async (config: any) => {
		const url = String(config.url || '');
		const method = String(config.method || 'get').toLowerCase();
		captured.push({ url, method, data: config.data });
		if (url === PIAS_URL) {
			if (method === 'post') {
				piasRows = [{ id: 'pia-1', ...JSON.parse(config.data), tenant_id: 'tenant-b2x', created_at: TS }];
			}
			return ok({ code: 0, message: 'success', data: piasRows, timestamp: TS }, config);
		}
		if (url === DATA_CLASS_URL) {
			if (method === 'post') {
				dataClassRows = [{ id: 'dc-1', ...JSON.parse(config.data), tenant_id: 'tenant-b2x', created_at: TS }];
			}
			return ok({ code: 0, message: 'success', data: dataClassRows, timestamp: TS }, config);
		}
		if (url === AI_URL) {
			if (method === 'post') {
				const body = JSON.parse(config.data);
				// 响应形状 = AIDecisionRecord（compliance_handler.go：decision_type=req.DecisionID、
				// model_name=req.Model；input_data/output_data 落库为 JSON 字符串）
				aiRows = [
					{
						id: 'ai-1',
						model_name: body.model,
						decision_type: body.decision_id,
						input_data: JSON.stringify(body.input),
						output_data: JSON.stringify(body.output),
						reviewer: body.reviewer || '',
						reviewed: !!body.reviewed,
						tenant_id: 'tenant-b2x',
						created_at: TS,
					},
				];
			}
			return ok({ code: 0, message: 'success', data: aiRows, timestamp: TS }, config);
		}
		if (url === SOD_URL) {
			// 真后端形状 = SoDRule（roles_a/roles_b 为数组、enabled、无 created_at）
			return ok(
				{
					code: 0,
					message: 'success',
					data: [
						{
							id: 'sod-1',
							name: 'Segregation Rule',
							description: 'desc',
							roles_a: ['finance', 'auditor'],
							roles_b: ['admin'],
							enabled: true,
						},
					],
					timestamp: TS,
				},
				config,
			);
		}
		if (url === ROLE_ACTIONS_URL) {
			// 真后端形状 = map[string][]string
			return ok(
				{
					code: 0,
					message: 'success',
					data: { auditor: ['read', 'export'], supervisor: ['approve'] },
					timestamp: TS,
				},
				config,
			);
		}
		if (url === CROSS_BORDER_URL) {
			// 真后端形状 = CrossBorderTransferRecord（snake）
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

/** 列头文本集合：antd Table（scroll.x）为每列表头额外渲染一个 height:0 的隐藏测量 div（同名文本），
 *  getByText 会命中 2 处报错 → 列头断言一律走 th 集合（隐藏测量节点非 th，天然排除）。 */
function headerTexts(): string[] {
	return Array.from(activePane().querySelectorAll('th')).map((th) => (th.textContent || '').trim());
}

/** antd v6 Button 对「恰好两个汉字」自动插空格（生产 ConfigProvider 未关）→ 以 textContent 正则容忍空档。 */
function findButtonByText(re: RegExp, root: () => HTMLElement): HTMLElement {
	const el = (Array.from(root().querySelectorAll('button')) as HTMLElement[]).find((b) =>
		re.test((b.textContent || '').trim()),
	);
	expect(el).toBeTruthy();
	return el as HTMLElement;
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
	// pane 激活为同步渲染；数据到达由各断言的 findBy 承担
	activePane();
}

/** 打开当前激活 Tab 的创建弹窗（按钮在激活 pane 内定位——隐藏 pane 各有一枚同名按钮；
 *  waitFor 等待该 pane 数据加载完成脱离 LoadingScreen）。 */
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

describe('合规审计页三表单 DTO 对齐 + 折叠变换（A-221 · AC-B2-039/040/041）', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		installCaptureAdapter();
	});

	afterEach(() => {
		apiClient.defaults.adapter = originalAdapter as any;
	});

	it('AC-B2-039 PIA：wire payload 逐键 = CreatePIARequest（data_types 真数组、risk_level）→ 行上屏 + toast', async () => {
		renderPage();
		await openCreate();

		fireEvent.change(document.querySelector('#name')!, { target: { value: 'Customer PIA' } });
		fireEvent.change(document.querySelector('#description')!, { target: { value: 'desc' } });
		fireEvent.change(document.querySelector('#dataTypes')!, { target: { value: '["email", "phone"]' } });
		fireEvent.change(document.querySelector('#purpose')!, { target: { value: 'analytics' } });

		clickModalOk();

		await waitFor(() => expect(posts(PIAS_URL).length).toBe(1));
		const body = JSON.parse(posts(PIAS_URL)[0].data!);
		// 全键集断言（旧表单键 title/dataScope/risks/mitigation/status → 必不等 → 必红）
		expect(Object.keys(body).sort()).toEqual(['data_types', 'description', 'name', 'purpose', 'risk_level']);
		expect(body.name).toBe('Customer PIA');
		expect(body.data_types).toEqual(['email', 'phone']); // JSON 字符串数组（旧实现无此字段）
		expect(body.risk_level).toBe('low');

		// 创建成功 → 列表重取 → 新行上屏（假成功反向锁）+ toast
		expect(await screen.findByText('Customer PIA')).toBeInTheDocument();
		await waitFor(() => expect(vi.mocked(message.success)).toHaveBeenCalled());
	});

	it('AC-B2-039 数据分类：缺必填 tiers → 内联错误 + 零 POST（负控）；补齐后 wire 逐键（tiers 为字符串）', async () => {
		renderPage();
		await switchTab('数据分类');
		await openCreate();

		// 负控：只填 dataSetName（缺必填 tiers）→ 提交被前置拦截（旧实现无此二字段 → 必红于下一步）
		fireEvent.change(document.querySelector('#dataSetName')!, { target: { value: 'User Profile Data' } });
		clickModalOk();
		await waitFor(() => expect(formErrorCount()).toBeGreaterThan(0));
		expect(posts(DATA_CLASS_URL).length).toBe(0);

		fireEvent.change(document.querySelector('#tiers')!, { target: { value: 'PII/Confidential' } });
		clickModalOk();

		await waitFor(() => expect(posts(DATA_CLASS_URL).length).toBe(1));
		const body = JSON.parse(posts(DATA_CLASS_URL)[0].data!);
		expect(Object.keys(body).sort()).toEqual(['data_set_name', 'tiers']);
		expect(body.data_set_name).toBe('User Profile Data');
		expect(body.tiers).toBe('PII/Confidential'); // DTO 为字符串（dto.go:1371）
		expect(await screen.findByText('User Profile Data')).toBeInTheDocument();
	});

	it('AC-B2-039 AI 决策：缺必填 → 零 POST（负控）；input/output 真对象 + reviewed/reviewer wire 逐键 → 行上屏', async () => {
		renderPage();
		await switchTab('AI 决策');
		await openCreate();

		// 负控：空表单 → 内联必填错误 + 零 POST
		clickModalOk();
		await waitFor(() => expect(formErrorCount()).toBeGreaterThan(0));
		expect(posts(AI_URL).length).toBe(0);

		fireEvent.change(document.querySelector('#decisionId')!, { target: { value: 'ai-dec-001' } });
		fireEvent.change(document.querySelector('#model')!, { target: { value: 'risk-model-v3' } });
		fireEvent.change(document.querySelector('#input')!, { target: { value: '{"user_id": 7}' } });
		fireEvent.change(document.querySelector('#output')!, { target: { value: '{"score": 0.9}' } });
		fireEvent.change(document.querySelector('#reviewer')!, { target: { value: 'auditor-1' } });
		fireEvent.click(screen.getByRole('switch')); // reviewed: false → true

		clickModalOk();

		await waitFor(() => expect(posts(AI_URL).length).toBe(1));
		const body = JSON.parse(posts(AI_URL)[0].data!);
		// 全键集断言（旧表单 decisionType/modelName/inputData/outputResult/humanReview/status → 必不等）
		expect(Object.keys(body).sort()).toEqual(['decision_id', 'input', 'model', 'output', 'reviewed', 'reviewer']);
		expect(body.decision_id).toBe('ai-dec-001');
		expect(body.model).toBe('risk-model-v3');
		expect(body.input).toEqual({ user_id: 7 }); // 对象（旧实现发字符串）
		expect(body.output).toEqual({ score: 0.9 });
		expect(body.reviewed).toBe(true);
		expect(body.reviewer).toBe('auditor-1');

		// 新行上屏（decision_type 列回显 decision_id——compliance_handler.go 映射）
		expect(await screen.findByText('ai-dec-001')).toBeInTheDocument();
	});

	it('AC-B2-040 AI 决策：非法 JSON 内联报错 + 阻止提交；改合法后提交即发（门禁释放）', async () => {
		renderPage();
		await switchTab('AI 决策');
		await openCreate();

		fireEvent.change(document.querySelector('#decisionId')!, { target: { value: 'ai-dec-002' } });
		fireEvent.change(document.querySelector('#model')!, { target: { value: 'risk-model-v3' } });
		fireEvent.change(document.querySelector('#input')!, { target: { value: '{oops' } }); // 非法 JSON

		clickModalOk();
		await waitFor(() => expect(screen.getByText('必须是合法 JSON')).toBeInTheDocument());
		expect(posts(AI_URL).length).toBe(0);

		// 合法 JSON 但非对象（数组）→ 对象校验错误（同一 error 槽替换）
		fireEvent.change(document.querySelector('#input')!, { target: { value: '[1, 2]' } });
		clickModalOk();
		await waitFor(() => expect(screen.getByText('必须是 JSON 对象，如 {"key": "value"}')).toBeInTheDocument());
		expect(posts(AI_URL).length).toBe(0);

		// 改合法对象 → 提交放行
		fireEvent.change(document.querySelector('#input')!, { target: { value: '{"row": 1}' } });
		fireEvent.change(document.querySelector('#output')!, { target: { value: '{"ok": true}' } });
		clickModalOk();

		await waitFor(() => expect(posts(AI_URL).length).toBe(1));
		const body = JSON.parse(posts(AI_URL)[0].data!);
		expect(body.input).toEqual({ row: 1 });
		expect(body.output).toEqual({ ok: true });
	});

	it('AC-B2-041 折叠：role-actions map → 行 [{role, actions[]}]（动作以 tag 列出）', async () => {
		renderPage();
		await switchTab('角色-动作');

		// 折叠行上屏（旧实现把 map 当数组读 → 空表 → 必红）
		expect(await within(activePane()).findByText('auditor')).toBeInTheDocument();
		expect(within(activePane()).getByText('supervisor')).toBeInTheDocument();
		expect(within(activePane()).getByText('read')).toBeInTheDocument();
		expect(within(activePane()).getByText('export')).toBeInTheDocument();
		expect(within(activePane()).getByText('approve')).toBeInTheDocument();
		expect(headerTexts()).toContain('动作');
	});

	it('AC-B2-041 折叠：cross-border 列对齐 from/to/purpose/safeguard（旧键恒空列）', async () => {
		renderPage();
		await switchTab('跨境传输');

		expect(await within(activePane()).findByText('personal-data')).toBeInTheDocument();
		expect(within(activePane()).getByText('CN')).toBeInTheDocument();
		expect(within(activePane()).getByText('SG')).toBeInTheDocument();
		expect(within(activePane()).getByText('backup')).toBeInTheDocument();
		expect(within(activePane()).getByText('SCC')).toBeInTheDocument();
		// 列头对齐（旧列头 来源/目标国家/地区/法律依据 → 必红；th 集合断言避开隐藏测量 div）
		expect(headerTexts()).toEqual(expect.arrayContaining(['来源国', '目的国', '保障措施']));
		expect(headerTexts()).not.toContain('法律依据');
	});

	it('AC-B2-041 折叠：sod rolesA/rolesB 数组 join + enabled；死列（创建时间）删除', async () => {
		renderPage();
		await switchTab('SoD 规则');

		// 数组 join 渲染（旧 dataIndex roleA/roleB 不匹配真实键 → 两列恒空 → 必红）
		expect(await within(activePane()).findByText('finance, auditor')).toBeInTheDocument();
		expect(within(activePane()).getByText('admin')).toBeInTheDocument();
		expect(within(activePane()).getByText('是')).toBeInTheDocument(); // enabled=true
		expect(headerTexts()).toContain('启用');
		// 响应无 created_at → 死列删除（旧实现该列全 '-'；th 集合断言避开隐藏测量 div）
		expect(headerTexts()).not.toContain('创建时间');
	});
});
