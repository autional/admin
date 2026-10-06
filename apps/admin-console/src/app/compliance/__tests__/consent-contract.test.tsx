// TASK-AB2-28（fix-admin-b2-security-forensics / A-236 + A-239 · AC-B2-051/052）：同意表三面契约锁。
//
// A-236（RC-B2-12）：撤销发 {purpose: record.scope}——列表行无 scope 键（wire 为 purpose）
//   → purpose:undefined 被 JSON.stringify 丢弃 → RevokeConsentRequest{user_id*/purpose*}
//   binding（dto.go:248-252）缺 purpose 必 400；确认弹窗插值 {{scope}} 同空。
// A-239：同意表 4/6 列错配（零行潜伏）——scope←wire 无此键（实为 purpose）、recordedAt←实为
//   grantedAt、ipAddress←ConsentItem 无（domain ConsentRecord.IPAddress json:"-"）、version←
//   ConsentItem 无（domain PolicyVersion json:"-"）→ 有数据后 4 列恒空。
// 修：撤销/弹窗改 record.purpose；列 scope→purpose、recordedAt→grantedAt；删 ip/version 列；
//   创建表单 service/consentMethod 显式输入（原为前端硬编码常量 'admin-console'/'manual'）。
//
// 反假绿：
//   ① wire 断言穿真实链路（page → use-compliance → api.generated → 拦截器 → adapter），不 mock hooks 模块；
//      撤销体必须全等 {user_id, purpose}（旧 purpose=undefined → 序列化后仅 {user_id} 必红）；
//   ② 列渲染：purpose/grantedAt 值上屏 + 旧列头（范围/IP地址/记录时间/版本）全数缺席（旧键 → 必红）；
//   ③ 创建 payload 键集全等 [consent_method,granted,purpose,service,user_id] 且 service/consent_method
//      = 用户输入值（旧硬编码 'admin-console'/'manual' 且无输入口 → #service 缺失必红）；
//   ④ 空表单提交 → 内联必填错误（userId/scope/service）+ 零 POST/DELETE（校验门先行）；
//   ⑤ 负控：终态行（granted=false）零「撤销」按钮；确认前零 DELETE。

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent, cleanup } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router';
import { apiClient, useAuthStore } from '@autional/shared';
import { message, modal } from '@/lib/antd-app';
import CompliancePage from '../page';

// antd v6 命令式 API 由 AntdAppProvider 的 StaticsBridge 赋值（export let），测试不经 Provider 时为
// undefined——成功路径的 message 会炸在 undefined 上。按仓内既有模式桩化（modal.confirm 桩化后
// 捕获配置并手动调 onOk，穿真实撤销链路）。
vi.mock('@/lib/antd-app', () => ({
	message: { success: vi.fn(), error: vi.fn() },
	modal: { confirm: vi.fn() },
}));

const CONSENT_URL = '/compliance/api/v1/admin/compliance/gdpr/consent';
const TS = '2026-10-04T00:00:00Z';

/** wire 形状（snake）同意列表：后端 dto.go:188-197 键集（service/consent_method 后端映射未带 → 恒空）。 */
const RAW_CONSENTS = [
	{
		id: 'consent-1',
		user_id: 'usr-c1',
		purpose: 'marketing',
		service: 'newsletter',
		granted: true,
		consent_method: 'explicit',
		granted_at: '2026-04-15T10:00:00Z',
		expired_at: '2027-04-15T10:00:00Z',
	},
	{
		id: 'consent-2',
		user_id: 'usr-c2',
		purpose: 'analytics',
		service: '',
		granted: false,
		consent_method: '',
		granted_at: '2026-03-01T08:30:00Z',
		expired_at: '2027-03-01T08:30:00Z',
	},
];

interface Captured {
	url: string;
	method: string;
	params: any;
	data: any;
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
		captured.push({ url, method, params: config.params, data: config.data });

		if (url === CONSENT_URL && method === 'get') {
			return ok(
				{ code: 0, message: 'success', items: RAW_CONSENTS, total: RAW_CONSENTS.length, timestamp: TS },
				config,
			);
		}
		if (url === CONSENT_URL && method === 'post') {
			return ok(
				{
					code: 0,
					message: 'created',
					data: { id: 'consent-9', user_id: 'usr-new', purpose: 'marketing', granted: true },
					timestamp: TS,
				},
				config,
			);
		}
		if (url === CONSENT_URL && method === 'delete') {
			return ok({ code: 0, message: 'consent revoked', timestamp: TS }, config);
		}
		return ok({ code: 0, message: 'success', data: {}, timestamp: TS }, config);
	}) as any;
}

function createPosts() {
	return captured.filter((c) => c.method === 'post' && c.url === CONSENT_URL);
}

function deleteCalls() {
	return captured.filter((c) => c.method === 'delete' && c.url === CONSENT_URL);
}

// 本测试穿真实 wire（拦截器链路）：种 token 会触发请求拦截器的「预判式 Token 刷新」
// （isTokenExpired('test-token') → refresh 失败 → onUnauthorized 清 store → 角色门假阴性）。
// 按 erasure-tab/retention 既有模式：只种租户/角色，不种 token。
function seedSession(role: string): void {
	useAuthStore.setState({
		user: { id: 'u-1', username: 'tester' } as never,
		accessToken: null,
		refreshToken: null,
		tenants: [{ id: 'tenant-a', name: 'Tenant A', role }],
		currentTenantId: 'tenant-a',
		permissions: ['compliance:read'],
		isAuthenticated: true,
	});
}

function resetAuthStore(): void {
	useAuthStore.setState({
		user: null,
		accessToken: null,
		refreshToken: null,
		tenants: [],
		currentTenantId: null,
		permissions: [],
		isAuthenticated: false,
	});
	window.localStorage.clear();
}

function renderPage() {
	const queryClient = new QueryClient({
		defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
	});
	return render(
		<QueryClientProvider client={queryClient}>
			<MemoryRouter>
				<CompliancePage />
			</MemoryRouter>
		</QueryClientProvider>,
	);
}

async function switchTab(label: string) {
	fireEvent.click(await screen.findByText(label));
}

/** Modal 确定按钮：antd 默认 en（OK）。 */
async function clickConfirmButton(re: RegExp) {
	const btn = await waitFor(() => {
		const el = Array.from(document.querySelectorAll('button')).find((b) =>
			re.test((b.textContent || '').trim()),
		);
		expect(el).toBeTruthy();
		return el as HTMLElement;
	});
	fireEvent.click(btn);
}

function setInput(id: string, value: string) {
	const el = document.querySelector(id) as HTMLInputElement;
	expect(el).toBeTruthy();
	fireEvent.change(el, { target: { value } });
}

/** antd Select 点选：开面板 → 按选项文案精确匹配（多面板残留时按文案去歧义）。 */
async function selectOption(selector: string, optionText: string) {
	const input = document.querySelector(selector) as HTMLElement;
	expect(input).toBeTruthy();
	fireEvent.mouseDown(input.closest('.ant-select-content')!);
	const option = await waitFor(() => {
		const els = Array.from(document.querySelectorAll('.ant-select-item-option'));
		const el = els.find((e) => (e.textContent || '').trim() === optionText);
		expect(el).toBeTruthy();
		return el as HTMLElement;
	});
	fireEvent.click(option);
}

describe('同意表契约（A-236/A-239 · AC-B2-051/052）', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		resetAuthStore();
		seedSession('admin');
		installCaptureAdapter();
	});

	afterEach(() => {
		cleanup();
		apiClient.defaults.adapter = originalAdapter as any;
		resetAuthStore();
	});

	it(
		'AC-B2-051：撤销体全等 {user_id, purpose=record.purpose}；弹窗文案含目的；终态行零按钮',
		{ timeout: 20000 },
		async () => {
			renderPage();
			await switchTab('同意管理');

			// 行数据上屏（userId 列两行 + 终态判别：仅 granted 行有「撤销」）
			expect(await screen.findByText('usr-c1')).toBeTruthy();
			expect(screen.getByText('usr-c2')).toBeTruthy();
			expect(screen.getAllByText('撤销')).toHaveLength(1);

			fireEvent.click(screen.getByText('撤销'));
			await waitFor(() => expect(vi.mocked(modal.confirm)).toHaveBeenCalled());
			const cfg: any = vi.mocked(modal.confirm).mock.calls[0][0];

			// 负控：确认前零 DELETE
			expect(deleteCalls()).toHaveLength(0);

			await cfg.onOk();

			await waitFor(() => expect(deleteCalls()).toHaveLength(1));
			const call = deleteCalls()[0];
			const body = JSON.parse(call.data);
			// 请求拦截器 camel→snake；旧代码 purpose=record.scope=undefined → 序列化仅 {user_id} 必红
			expect(body).toEqual({ user_id: 'usr-c1', purpose: 'marketing' });

			// A-236 二次面：确认文案插值 {{purpose}}（旧 record.scope → 文案空）
			expect(String(cfg.content)).toContain('marketing');
			expect(String(cfg.content)).toContain('usr-c1');

			await waitFor(() => expect(vi.mocked(message.success)).toHaveBeenCalled());
		},
	);

	it(
		'AC-B2-052：列对齐 wire（purpose/grantedAt 上屏；ip/version 列与旧列头全数删除）',
		{ timeout: 20000 },
		async () => {
			renderPage();
			await switchTab('同意管理');

			// purpose 列渲染（旧 scope 列读 undefined → 'marketing' 不上屏必红）
			expect(await screen.findByText('marketing')).toBeTruthy();
			expect(screen.getByText('analytics')).toBeTruthy();

			// grantedAt 列渲染（与页面同一表达式 new Date(v).toLocaleString('zh-CN') → 同 TZ 确定性）
			expect(
				screen.getByText(new Date('2026-04-15T10:00:00Z').toLocaleString('zh-CN')),
			).toBeTruthy();

			// 列头（antd Table scroll={{x}} 隐藏测宽行复制列头文本 → 用 AllBy 变体）
			expect(screen.getAllByText('处理目的').length).toBeGreaterThan(0);
			expect(screen.getAllByText('同意时间').length).toBeGreaterThan(0);

			// 旧列头全数缺席（删除列 ip/version + 更名列 scopeColumn/recordedAt）
			expect(screen.queryAllByText('IP地址')).toHaveLength(0);
			expect(screen.queryAllByText('版本')).toHaveLength(0);
			expect(screen.queryAllByText('范围')).toHaveLength(0);
			expect(screen.queryAllByText('记录时间')).toHaveLength(0);

			// 无 undefined 文本（键错配的显性判别）
			expect(screen.queryAllByText('undefined')).toHaveLength(0);
		},
	);

	it(
		'AC-B2-052：创建 payload 键集全等 + service/consentMethod 为显式输入值（旧硬编码 → 必红）',
		{ timeout: 20000 },
		async () => {
			renderPage();
			await switchTab('同意管理');
			// 列表门：userId 列两版均渲染（旧 scope 列错配不影响本测试；红色签字落在 #service 缺失）
			expect(await screen.findByText('usr-c1')).toBeTruthy();

			fireEvent.click(await screen.findByText('新建同意记录'));
			expect(await waitFor(() => document.querySelector('#userId'))).toBeTruthy();

			setInput('#userId', 'usr-new');
			await selectOption('#scope', '营销通信');
			// 显式输入口（旧代码无 #service/#consentMethod → 必红）
			setInput('#service', 'newsletter');
			await selectOption('#consentMethod', '默示同意');

			await clickConfirmButton(/^(OK|确\s*定|确定)$/);

			await waitFor(() => expect(createPosts()).toHaveLength(1));
			const body = JSON.parse(createPosts()[0].data);
			// 键集全等（拦截器 camel→snake；旧硬编码 service='admin-console'/consentMethod='manual' → 值不等必红）
			expect(Object.keys(body).sort()).toEqual([
				'consent_method',
				'granted',
				'purpose',
				'service',
				'user_id',
			]);
			expect(body.user_id).toBe('usr-new');
			expect(body.purpose).toBe('marketing');
			expect(body.service).toBe('newsletter');
			expect(body.consent_method).toBe('implicit');
			expect(body.granted).toBe(true);

			expect(deleteCalls()).toHaveLength(0);
			await waitFor(() => expect(vi.mocked(message.success)).toHaveBeenCalled());
		},
	);

	it(
		'AC-B2-051/052：空表单提交 → 内联必填错误（userId/scope/service）+ 零 POST/DELETE（校验门先行）',
		{ timeout: 20000 },
		async () => {
			renderPage();
			await switchTab('同意管理');
			// 列表门：userId 列两版均渲染（红色签字落在「请输入服务名称」缺席）
			expect(await screen.findByText('usr-c1')).toBeTruthy();

			fireEvent.click(await screen.findByText('新建同意记录'));
			expect(await waitFor(() => document.querySelector('#userId'))).toBeTruthy();

			await clickConfirmButton(/^(OK|确\s*定|确定)$/);

			expect(await screen.findByText('请输入用户ID')).toBeTruthy();
			expect(screen.getByText('请输入同意范围')).toBeTruthy();
			expect(screen.getByText('请输入服务名称')).toBeTruthy();
			expect(createPosts()).toHaveLength(0);
			expect(deleteCalls()).toHaveLength(0);
		},
	);
});
