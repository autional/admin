// W1e-26（fix-admin-b5-polish / A-231）：报告页导出 + period/generatedAt 回显回归锁。
//
//   A-231①：报告生成后无导出入口 → 新增「导出」（客户端 Blob 下载 JSON；生成前禁用）；
//   A-231②：响应 period / generated_at 两字段零渲染 → 周期经选项词表回显 + 生成时间按
//            i18n.language 本地化（generated_at 为秒级时间戳，*1000）。
//
// 注：导出为纯前端 Blob 构造（两端点只读计算、无后端导出端点）——live 下载留阶段 B
// （浏览器实测），本测试锁 Blob 载荷内容与文件名契约 + 禁用态。
//
// 断言口径 = Blob 实参文本（JSON.parse 全等）+ anchor.download 文件名 + 渲染输出。

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router';
import { apiClient } from '@autional/shared';
import AuditReportsPage from '../page';

vi.mock('@/lib/antd-app', () => ({
	message: { success: vi.fn(), error: vi.fn() },
	modal: { confirm: vi.fn() },
}));

const SEC_URL = '/audit/api/v1/admin/audit/reports/security';
const TS = '2026-10-04T00:00:00Z';
const GENERATED_AT = 1759536000; // 秒级（wire 语义）

interface Captured {
	url: string;
	method: string;
}

let captured: Captured[] = [];
let originalAdapter: unknown;
let clickSpy: ReturnType<typeof vi.spyOn>;

function ok(payload: unknown, config: any) {
	return { data: payload, status: 200, statusText: 'OK', headers: {}, config };
}

function securityEnvelope() {
	return {
		code: 0,
		message: 'success',
		data: {
			period: '7d',
			generated_at: GENERATED_AT,
			summary: { total_events: 842, failed_logins: 7, anomalies_detected: 3, blocked_ips: 2, suspicious_activities: 5 },
			top_risks: [],
			details: { suspicious_users: [], failed_login_ips: {}, unusual_access_times: [] },
		},
		timestamp: TS,
	};
}

function installCaptureAdapter() {
	captured = [];
	originalAdapter = apiClient.defaults.adapter;
	apiClient.defaults.adapter = (async (config: any) => {
		const url = String(config.url || '');
		captured.push({ url, method: String(config.method || 'get').toLowerCase() });
		if (url === SEC_URL) return ok(securityEnvelope(), config);
		if (url.includes('/sod-config')) {
			// SoD 模式（useIsAuditRestricted 依赖）：single → 不受限（与角色解耦，测试确定性）
			return ok(
				{
					code: 0,
					message: 'success',
					data: { tenant_id: 'tenant-w1e', sod_mode: 'single', updated_at: TS },
					timestamp: TS,
				},
				config,
			);
		}
		return ok({ code: 0, message: 'success', data: {}, timestamp: TS }, config);
	}) as any;
}

function renderPage() {
	const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
	return render(
		<QueryClientProvider client={queryClient}>
			<MemoryRouter>
				<AuditReportsPage />
			</MemoryRouter>
		</QueryClientProvider>,
	);
}

/** 当前激活 pane（security 为默认 tab；判别按钮查询作用域收窄防串线）。 */
function activePane(): HTMLElement {
	const el = document.querySelector('[role="tabpanel"][aria-hidden="false"]');
	expect(el).not.toBeNull();
	return el as HTMLElement;
}

/** antd v6 Button 对「恰好两个汉字」自动插空格 → textContent 正则容忍空档。 */
function findButton(re: RegExp, root: HTMLElement): HTMLButtonElement {
	const el = (Array.from(root.querySelectorAll('button')) as HTMLButtonElement[]).find((b) =>
		re.test((b.textContent || '').trim()),
	);
	expect(el).toBeTruthy();
	return el as HTMLButtonElement;
}

describe('报告页 A-231 导出与回显', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		installCaptureAdapter();
		// jsdom 未实现 blob URL API（页面下载回调用到）
		(URL as any).createObjectURL = vi.fn(() => 'blob:mock');
		(URL as any).revokeObjectURL = vi.fn();
		clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
	});

	afterEach(() => {
		apiClient.defaults.adapter = originalAdapter as any;
		clickSpy.mockRestore();
	});

	it('A-231①：生成前导出按钮禁用；生成后启用（security tab）', async () => {
		renderPage();
		const pane = activePane();
		const exportBtn = findButton(/^导\s*出$/, pane);
		// 旧形态：无导出入口（按钮缺席即红）；生成前必须禁用
		expect(exportBtn.hasAttribute('disabled')).toBe(true);
		expect(clickSpy).not.toHaveBeenCalled();

		fireEvent.click(findButton(/^生\s*成$/, pane));
		await waitFor(() => expect(captured.some((c) => c.url === SEC_URL)).toBe(true));
		// 生成后放行
		await waitFor(() => expect(findButton(/^导\s*出$/, activePane()).hasAttribute('disabled')).toBe(false));
	});

	it('A-231①：点击导出 → Blob 载荷 = 报告 JSON 全等 + 文件名契约（security-report-7d-*.json）', async () => {
		renderPage();
		const pane = activePane();
		fireEvent.click(findButton(/^生\s*成$/, pane));
		await waitFor(() => expect(captured.some((c) => c.url === SEC_URL)).toBe(true));

		fireEvent.click(findButton(/^导\s*出$/, activePane()));

		// Blob 实参：内容 = JSON.stringify(payload,null,2)
		const createURL = (URL as any).createObjectURL as ReturnType<typeof vi.fn>;
		await waitFor(() => expect(createURL).toHaveBeenCalledTimes(1));
		const blob = createURL.mock.calls[0][0] as Blob;
		expect(blob.type).toContain('application/json');
		const parsed = JSON.parse(await blob.text());
		// 载荷 = 生成结果原样（period 回显与摘要均在）
		expect(parsed.period).toBe('7d');
		expect(parsed.generatedAt).toBe(GENERATED_AT);
		expect(parsed.summary.totalEvents).toBe(842);

		// anchor 下载名契约（旧形态无入口 → 全炸）；且已触发点击 + 释放 URL
		expect(clickSpy).toHaveBeenCalledTimes(1);
		const anchor = (clickSpy.mock.instances as unknown as HTMLAnchorElement[])[0];
		expect(anchor.download).toMatch(/^security-report-7d-\d+\.json$/);
		expect((URL as any).revokeObjectURL).toHaveBeenCalledWith('blob:mock');
	});

	it('A-231②：生成后回显 报告周期 + 生成时间（本地化秒级时间戳；旧形态两字段零渲染）', async () => {
		renderPage();
		fireEvent.click(findButton(/^生\s*成$/, activePane()));
		await waitFor(() => expect(captured.some((c) => c.url === SEC_URL)).toBe(true));

		// 周期经选项词表回显（'7d' → '近 7 天'）+ 生成时间本地化（秒 → *1000）
		expect(await screen.findByText(/报告周期：近 7 天/)).toBeInTheDocument();
		const localized = new Date(GENERATED_AT * 1000).toLocaleString('zh-CN');
		expect(screen.getByText(new RegExp(`生成时间：${localized.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`))).toBeInTheDocument();
		// 旧形态：raw 秒戳数字零命中（判别 generatedAtOf 未回落原值）
		expect(screen.queryByText(new RegExp(`生成时间：${GENERATED_AT}\\b`))).toBeNull();
	});
});
