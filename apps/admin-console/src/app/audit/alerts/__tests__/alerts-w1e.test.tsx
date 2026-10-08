// W1e-23（fix-admin-b5-polish / A-203 + A-204 + A-205）：告警页三处收口回归锁。
//
//   A-203①：severity/type/status 列英文原值直出 → 词表本地化（未收录值回退原值）；
//   A-203②：createdAt RFC3339 原样 → 按 i18n.language 本地化；
//   A-204：指派空输入静默 return → 显式 warning 提示 + 确定按钮同步禁用（空/纯空白）；
//   A-205：tab 恒 "Autional 管理控制台" → 挂载 '告警 — Autional'。
//
// 断言口径 = 渲染输出 + 最终通知实参；穿真实拦截器（wire snake → camel 渲染）。
// 注意：A-204 走 message.warning —— mock 必须含 warning（仓内标准桩仅 success/error）。

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router';
import { apiClient, useAuthStore } from '@autional/shared';
import { message } from '@/lib/antd-app';
import AuditAlertsPage from '../page';

vi.mock('@/lib/antd-app', () => ({
	message: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
	modal: { confirm: vi.fn() },
}));

const TENANT = 'tenant-w1e-alerts';
const ALERTS_URL = '/audit/api/v1/admin/audit/alerts';
const CREATED_AT = '2026-01-15T10:00:00Z';

interface Captured {
	url: string;
	method: string;
	body?: unknown;
}

let captured: Captured[] = [];
let originalAdapter: unknown;

function ok(payload: unknown, config: any) {
	return { data: payload, status: 200, statusText: 'OK', headers: {}, config };
}

/** 告警行 wire（snake）：severity=high / type=anomaly / status=open（全部有词表）。 */
function alertsEnvelope() {
	const rows = [
		{
			id: 'alert-1',
			severity: 'high',
			type: 'anomaly',
			title: '多次登录失败',
			status: 'open',
			assignee: '',
			source: 'identity',
			message: '检测到暴力破解迹象',
			created_at: CREATED_AT,
		},
	];
	return {
		code: 0,
		message: 'success',
		data: { items: rows, pagination: { total: rows.length, page: 1, page_size: 20, total_pages: 1 } },
		timestamp: '2026-10-04T00:00:00Z',
	};
}

function installCaptureAdapter() {
	captured = [];
	originalAdapter = apiClient.defaults.adapter;
	apiClient.defaults.adapter = (async (config: any) => {
		const url = String(config.url || '');
		const method = String(config.method || 'get').toLowerCase();
		let body: unknown;
		if (typeof config.data === 'string' && config.data.length > 0) body = JSON.parse(config.data);
		else if (config.data && typeof config.data === 'object') body = config.data;
		captured.push({ url, method, body });
		if (url === ALERTS_URL) return ok(alertsEnvelope(), config);
		return ok({ code: 0, message: 'success', data: {}, timestamp: '2026-10-04T00:00:00Z' }, config);
	}) as any;
}

function renderPage() {
	const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
	return render(
		<QueryClientProvider client={queryClient}>
			<MemoryRouter>
				<AuditAlertsPage />
			</MemoryRouter>
		</QueryClientProvider>,
	);
}

/** Modal 确定按钮（未挂 ConfigProvider，antd 默认 en locale = OK；兼容 zh 文案）。 */
function modalOkButton(): HTMLElement {
	return screen.getByRole('button', { name: /^(OK|确\s*定|确定)$/ }) as HTMLElement;
}

describe('告警页 A-203/A-204/A-205 收口', () => {
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

	it('A-205：document.title=告警 — Autional', async () => {
		renderPage();
		await waitFor(() => expect(document.title).toBe('告警 — Autional'));
	});

	it('A-203：severity/type/status 词表本地化 + createdAt 按 zh-CN 渲染（旧形态零命中）', async () => {
		renderPage();
		await screen.findByText('多次登录失败');

		// 词表本地化（旧形态英文原值直出）
		expect(screen.getByText('高')).toBeInTheDocument();
		expect(screen.getByText('异常')).toBeInTheDocument();
		expect(screen.getByText('待处理')).toBeInTheDocument();
		// 旧英文原值零命中（Tag 文本精确匹配）
		expect(screen.queryByText('high')).toBeNull();
		expect(screen.queryByText('anomaly')).toBeNull();
		expect(screen.queryByText('open')).toBeNull();

		// createdAt 本地化（期望值同进程计算，时区无关）；RFC3339 原文零命中
		expect(screen.getByText(new Date(CREATED_AT).toLocaleString('zh-CN'))).toBeInTheDocument();
		expect(screen.queryByText(CREATED_AT)).toBeNull();
	});

	it('A-204：指派空输入 → warning 提示 + 确定按钮禁用 + 零请求；填值后按钮放行', async () => {
		renderPage();
		await screen.findByText('多次登录失败');

		// 行内「指派」按钮（恰好两汉字 → 正则容忍 antd 自动插空格）
		fireEvent.click(screen.getByText(/^指\s*派$/));

		// 首开：空输入 → 确定按钮禁用（旧形态可点且静默无响应）
		const okBtn = await waitFor(() => modalOkButton());
		expect(okBtn.hasAttribute('disabled')).toBe(true);

		// 回车提交空值 → 显式 warning（旧形态静默）
		const input = screen.getByPlaceholderText('例如 analyst-001') as HTMLInputElement;
		fireEvent.keyDown(input, { key: 'Enter', code: 'Enter', keyCode: 13 });
		await waitFor(() =>
			expect(vi.mocked(message.warning)).toHaveBeenCalledWith('请输入处理人名称或 ID'),
		);
		// 负控：空输入不发请求
		expect(captured.filter((c) => c.method === 'post')).toHaveLength(0);

		// 纯空白同样视为空（trim 语义）→ 按钮仍禁用
		fireEvent.change(input, { target: { value: '   ' } });
		await waitFor(() => expect(modalOkButton().hasAttribute('disabled')).toBe(true));

		// 有效输入 → 按钮放行（旧形态无此联动）
		fireEvent.change(input, { target: { value: 'analyst-001' } });
		await waitFor(() => expect(modalOkButton().hasAttribute('disabled')).toBe(false));
	});
});
