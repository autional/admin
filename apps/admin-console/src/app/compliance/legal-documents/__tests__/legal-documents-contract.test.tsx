// TASK-AB1-23（fix-admin-b1-guard-contract / A-274）：legal-documents 页契约收敛回归锁。
//
//   AC-AB1-41：security_admin 与 admin 两会话渲染通过（经 TASK-AB1-10 路由放宽后可达；
//              路由守卫面由 legal-documents-guard.test.tsx 单独锁定，本测试锁页面读路径）。
//   附（A-274 核心守门）：
//     ① 列表 wire snake（doc_type / effective_at）经拦截器 camel 直读 —— 表格列正常渲染
//        （旧缺陷 = snake 直读恒 undefined → 伪 key `legalDocuments.docType.undefined` / 恒「—」）；
//     ② 编辑弹窗回填当前值（camel）且提交可达 —— 编辑死锁回归锁
//        （旧缺陷 = doc_type 恒 undefined + 编辑态 disabled + required ⇒ 校验必败、字段被禁）；
//     ③ PUT body = 4 字段 {title,lang,content,effectiveAt}（AC-008，wire snake 后键集精确，
//        不含 doc_type/version/status —— 后端 Update 契约不可变）。
//   W4-01（fix-admin-b3-write-path / F2-01）：content 落 jsonb 列——前端提交前置 JSON 校验
//     （非法 JSON 本地拦截不发请求，服务端另有 json.Valid 400 兜底）；fixture content 须为合法 JSON。
//
// 断言口径 = **最终 wire 请求/响应**：捕获器装在 shared apiClient 的 axios adapter（请求拦截器之后
// 最末环），跑真实链路 page → apiClient → 拦截器（camel→snake / snake→camel 深转）→ adapter；
// adapter 回写 wire 形状（snake）响应，与线上链路同构。
//
// 会话播种用未来 exp 的 JWT 形 token：非 JWT 串会被 store.isTokenExpired 判过期 → apiClient
// 预判式刷新 → refreshToken 网络失败 → onUnauthorized 异步清空 store（跨用例竞态；
// TASK-AB1-14 实证），故 futureJwt() 绕开预判刷新。

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent, cleanup } from '@testing-library/react';
import { apiClient, useAuthStore } from '@autional/shared';
import LegalDocumentsPage from '../page';

vi.mock('@/lib/antd-app', () => ({
	message: { success: vi.fn(), error: vi.fn() },
	modal: { confirm: vi.fn() },
}));

const LIST_URL = '/compliance/api/v1/admin/compliance/legal-documents';
const DOC_ID = 'ld_01J8ZQ4T5X6Y7Z8A9B0C1D2E3F';

/** W4-01：content 为 jsonb 载体 —— 合法 JSON 数组串（元素含 title/body，与页面 hint 口径一致）。 */
const CONTENT_FIXTURE = '[{"title":"第一条","body":"……"}]';

/** wire 形状（snake）：LegalDocument 契约经响应拦截器深 camel 化（doc_type/effective_at = 本 TASK 收敛键）。 */
const RAW_DOCS = [
	{
		id: DOC_ID,
		doc_type: 'terms',
		version: '1.0',
		title: '服务条款正文',
		lang: 'zh-CN',
		status: 'draft',
		content: CONTENT_FIXTURE,
		effective_at: '2026-01-15T10:00:00Z',
	},
];

interface CapturedCall {
	method: string;
	url: string;
	params?: Record<string, unknown>;
	body?: Record<string, unknown>;
}

const captured: CapturedCall[] = [];
let originalAdapter: unknown;

/** 列表信封（与线上同构；无 `data` 键 ⇒ 拦截器走 items/total/pagination 分支后再 camel 深转）。 */
function listEnvelope(items: unknown[]) {
	return {
		code: 0,
		message: 'success',
		items,
		total: items.length,
		pagination: { total: items.length, page: 1, page_size: 20, total_pages: 1, has_next: false },
		timestamp: '2026-10-04T00:00:00Z',
	};
}

function installCaptureAdapter() {
	originalAdapter = apiClient.defaults.adapter;
	apiClient.defaults.adapter = (async (config: any) => {
		let body: Record<string, unknown> | undefined;
		if (typeof config.data === 'string' && config.data.length > 0) {
			body = JSON.parse(config.data);
		} else if (config.data && typeof config.data === 'object') {
			body = config.data as Record<string, unknown>;
		}
		const method = String(config.method || 'get').toLowerCase();
		const url = String(config.url || '');
		captured.push({ method, url, params: config.params as Record<string, unknown> | undefined, body });

		let data: unknown;
		if (method === 'get') {
			data = listEnvelope(RAW_DOCS);
		} else {
			data = { code: 0, message: 'success', data: {}, timestamp: '2026-10-04T00:00:00Z' };
		}
		return { data, status: 200, statusText: 'OK', headers: {}, config };
	}) as any;
}

/** 假 JWT 形 access token（未来 exp）——绕开 isTokenExpired 预判刷新（见文件头注释）。 */
function futureJwt(): string {
	const b64 = (obj: unknown) => btoa(JSON.stringify(obj));
	return `${b64({ alg: 'none', typ: 'JWT' })}.${b64({ exp: Math.floor(Date.now() / 1000) + 3600 })}.sig`;
}

/** 播种一个「已就绪」会话（security_admin / admin；角色经 tenants + currentTenantId 派生）。 */
function seedSession(role: string): void {
	useAuthStore.setState({
		user: { id: 'u-1', username: 'tester' } as never,
		accessToken: futureJwt(),
		refreshToken: 'test-refresh',
		tenants: [{ id: 'tenant-a', name: 'Tenant A', role }],
		currentTenantId: 'tenant-a',
		permissions: ['audit:read', 'compliance:read'],
		isAuthenticated: true,
	});
}

/** 重置 store + localStorage，避免跨用例污染。 */
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

/** Modal 确定按钮（测试未挂 ConfigProvider，antd 默认 en locale = OK；兼容 zh 文本）。 */
function clickModalOk() {
	const ok = screen.getByRole('button', { name: /^(OK|确\s*定|确定)$/ });
	fireEvent.click(ok);
}

const getCalls = () => captured.filter((c) => c.method === 'get' && c.url === LIST_URL);
const putCalls = () => captured.filter((c) => c.method === 'put');

describe('legal-documents 契约收敛（A-274 / AC-AB1-41）', () => {
	beforeEach(() => {
		captured.length = 0;
		resetAuthStore();
		installCaptureAdapter();
	});

	afterEach(() => {
		cleanup();
		resetAuthStore();
		apiClient.defaults.adapter = originalAdapter as any;
	});

	it('security_admin 会话：wire snake 响应 camel 直读 —— 列表行渲染 + GET 分页参数单点', async () => {
		seedSession('security_admin');
		render(<LegalDocumentsPage />);

		// 列表行：title / docType（服务条款）/ lang（简体中文）/ status（草稿）/ effectiveAt（非 —）
		expect(await screen.findByText('服务条款正文')).toBeTruthy();
		expect(screen.getByText('服务条款')).toBeTruthy();
		expect(screen.getByText('简体中文')).toBeTruthy();
		expect(screen.getByText('草稿')).toBeTruthy();
		// A-278②（W1e）：生效时间列已本地化（旧 = 裸显 RFC3339）→ 断言改为本地化渲染值
		// （期望值同进程动态计算，时区无关；i18n.language=zh-CN 见 test/setup.ts）
		expect(screen.getByText(new Date('2026-01-15T10:00:00Z').toLocaleString('zh-CN'))).toBeTruthy();
		// 旧形态（RFC3339 原文）零命中
		expect(screen.queryByText('2026-01-15T10:00:00Z')).toBeNull();
		// 旧缺陷残留（伪 key / 空占位）零命中
		expect(screen.queryByText(/docType\.undefined|effectiveAt\.undefined/)).toBeNull();
		expect(screen.queryByText('—')).toBeNull();

		// 请求侧：URL 单点 + toPageParams 收敛（wire = page_size 50；无 pageSize 双写）
		const gets = getCalls();
		expect(gets).toHaveLength(1);
		expect(gets[0].params?.page_size).toBe(50);
		expect(gets[0].params?.pageSize).toBeUndefined();
	});

	it('admin 会话：编辑弹窗回填 camel 当前值、提交可达；PUT body = 4 字段（AC-008 防死锁回归）', async () => {
		seedSession('admin');
		render(<LegalDocumentsPage />);
		expect(await screen.findByText('服务条款正文')).toBeTruthy();

		fireEvent.click(screen.getByText('编辑条款'));

		// 回填断言：version/title/content 为表单受控值；docType/lang Select 触发区含选中值文本
		expect(await screen.findByDisplayValue('1.0')).toBeTruthy();
		expect(screen.getByDisplayValue('服务条款正文')).toBeTruthy();
		// antd v6：Select 触发区 = .ant-select-content（选中值文本在其中；旧版 selection-item 类已不存在）
		const docTypeInput = document.querySelector('#docType') as HTMLInputElement;
		expect(docTypeInput.closest('.ant-select-content')?.textContent).toContain('服务条款'); // 旧缺陷 = 空 + disabled ⇒ 死锁
		const langInput = document.querySelector('#lang') as HTMLInputElement;
		expect(langInput.closest('.ant-select-content')?.textContent).toContain('简体中文');

		// 改标题后提交：校验须放行（docType 已回填 camel）、PUT 可达
		fireEvent.change(screen.getByDisplayValue('服务条款正文'), {
			target: { value: '服务条款正文 v2' },
		});
		clickModalOk();

		await waitFor(() => expect(putCalls()).toHaveLength(1));
		const put = putCalls()[0];
		expect(put.url).toBe(`${LIST_URL}/${DOC_ID}`);
		// AC-008：wire snake 后键集精确 = {content,effective_at,lang,title}；不可变键零出现
		expect(Object.keys(put.body!).sort()).toEqual(['content', 'effective_at', 'lang', 'title']);
		expect(put.body!.title).toBe('服务条款正文 v2');
		expect(put.body).not.toHaveProperty('doc_type');
		expect(put.body).not.toHaveProperty('version');
		expect(put.body).not.toHaveProperty('status');
		// effectiveAt 经 camel 回填（DatePicker 持有 dayjs）→ 提交序列化为 ISO 串（旧缺陷 = null）
		expect(typeof put.body!.effective_at).toBe('string');
		expect(String(put.body!.effective_at)).toMatch(/^2026-01-15T/);
	});

	it('W4-01：编辑态 content 非合法 JSON → 本地校验拦截（不发 PUT）+ 可读提示', async () => {
		seedSession('admin');
		render(<LegalDocumentsPage />);
		expect(await screen.findByText('服务条款正文')).toBeTruthy();

		fireEvent.click(screen.getByText('编辑条款'));

		const contentArea = await screen.findByDisplayValue(CONTENT_FIXTURE);
		fireEvent.change(contentArea, { target: { value: '第一条……（非 JSON 自由文本）' } });
		clickModalOk();

		// 校验失败文案可见 + 无任何 PUT 发出（jsonb 载体不会被非法值触达）
		expect(await screen.findByText(/正文不是合法 JSON/)).toBeTruthy();
		expect(putCalls()).toHaveLength(0);
	});
});
