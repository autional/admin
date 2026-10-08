// W1b（A-69）：logs 页「我的操作日志」列面修复回归锁 ——
//   ① action i18n：三种命名风格归一（auth.login_success → 「登录成功」）；未收录动作回退原值（admin_list_keys）
//   ② status 徽标：success → 「成功」/ failed → 「失败」（旧实现裸字符串无徽标）
//   ③ 补列对齐 dto.AuditLogResponse 实读键：resource / resource_id / ip / user_agent / details
//      （旧列 targetType/message 恒空 —— wire 键实为 resource/details）
//   ④ h1 = 「我的操作日志」（A-68 同改面）
// 断言口径 = 最终 wire 响应（axios adapter 最末环 snake 行回写 + 响应拦截器 camel 化，与线上链路同构）。
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router';
import { apiClient } from '@autional/shared';
import LogsPage from '../logs/page';

const LOGS_URL = '/identity/api/v1/auth/me/audit-logs';
const captured: string[] = [];
let originalAdapter: unknown;

/** wire 形状（snake）审计日志行：字段与 dto.AuditLogResponse 实读一致。 */
const RAW_LOGS = [
	{
		id: 'log-1',
		action: 'auth.login_success',
		status: 'success',
		resource: 'session',
		resource_id: 'sess-1',
		ip: '10.0.0.1',
		user_agent: 'Mozilla/5.0 (X11)',
		details: 'ok',
		created_at: '2026-10-01T10:00:00Z',
	},
	{
		id: 'log-2',
		action: 'admin_list_keys',
		status: 'failed',
		resource: 'api_key',
		resource_id: '',
		ip: '',
		user_agent: '',
		details: '',
		created_at: '2026-10-02T10:00:00Z',
	},
];

function installCaptureAdapter() {
	captured.length = 0;
	originalAdapter = apiClient.defaults.adapter;
	apiClient.defaults.adapter = (async (config: any) => {
		captured.push(String(config.url || ''));
		const data = {
			code: 0,
			message: 'success',
			items: RAW_LOGS,
			total: 2,
			pagination: { total: 2, page: 1, page_size: 10, total_pages: 1, has_next: false },
			timestamp: '2026-10-06T00:00:00Z',
		};
		return { data, status: 200, statusText: 'OK', headers: {}, config };
	}) as any;
}

function renderPage() {
	const queryClient = new QueryClient({
		defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
	});
	return render(
		<QueryClientProvider client={queryClient}>
			<MemoryRouter>{<LogsPage />}</MemoryRouter>
		</QueryClientProvider>,
	);
}

describe('logs 列面（A-69）', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		installCaptureAdapter();
	});

	afterEach(() => {
		apiClient.defaults.adapter = originalAdapter as any;
	});

	it('AC-B5-W1b-69：action i18n（命中/回退）+ status 徽标 + resource/resource_id/ip/user_agent/details 列', { timeout: 20000 }, async () => {
		renderPage();
		expect(await screen.findByText('登录成功')).toBeTruthy();

		// ① action i18n：auth.login_success → 「登录成功」（旧实现渲染原始点号串 → 必红）；原始串零残留
		expect(screen.queryByText('auth.login_success')).toBeNull();
		// 未收录动作回退原值（不伪造翻译）
		expect(screen.getByText('admin_list_keys')).toBeTruthy();

		// ② status 徽标：success/failed 语义词渲染
		expect(screen.getByText('成功')).toBeTruthy();
		expect(screen.getByText('失败')).toBeTruthy();

		// ③ 补列表头（对齐 wire 实读键）——表头作用域断言
		//（antd 为 ellipsis 列渲染隐藏测宽 div 复读表头文本 → 全文 getByText 会多匹配）
		const thead = document.querySelector('.ant-table-thead') as HTMLElement;
		expect(thead).toBeTruthy();
		for (const header of ['目标', '目标 ID', 'IP 地址', 'User Agent', '详情']) {
			expect(thead.textContent, `表头缺列：${header}`).toContain(header);
		}

		// ③ 补列取值（旧实现 targetType/message 恒空列在此行会渲染空 → 值断言必红）
		expect(screen.getByText('session')).toBeTruthy();
		expect(screen.getByText('sess-1')).toBeTruthy();
		expect(screen.getByText('10.0.0.1')).toBeTruthy();
		expect(screen.getByText('Mozilla/5.0 (X11)')).toBeTruthy();
		expect(screen.getByText('ok')).toBeTruthy();

		// ④ 空值行：缺失字段回落 '-'（不可渲染 undefined）
		expect(screen.queryByText('undefined')).toBeNull();
		expect(screen.getAllByText('-').length).toBeGreaterThanOrEqual(3);

		// ⑤ h1（A-68 同改面）：我的操作日志
		expect(screen.getByText('我的操作日志')).toBeTruthy();

		// wire 锚：请求打审计端点（真实链路而非桩数据直渲染）
		expect(captured.some((u) => u.includes(LOGS_URL))).toBe(true);
	});
});
