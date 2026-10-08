// W1e-25（fix-admin-b5-polish / A-219 残余）：保留策略页本地化回归锁（零页面改动验证项）。
//
// A-219 残余三口径（审计复查：本页在批量修复后已达标，本测试固化防回退）：
//   ① usePageTitle 挂载（family 第 N 例补齐）；
//   ② toast 全键化 + 传输层错误回落中文 fallback（不泄英文原文）；
//   ③ lastArchive 毫秒时间戳按 i18n.language 本地化（非 ISO 原样）。
//
// 断言口径 = document.title + 渲染输出 + 最终通知实参；Popconfirm 流程穿真实交互。

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router';
import { apiClient } from '@autional/shared';
import { message } from '@/lib/antd-app';
import RetentionPolicyPage from '../page';

vi.mock('@/lib/antd-app', () => ({
	message: { success: vi.fn(), error: vi.fn() },
	modal: { confirm: vi.fn() },
}));

const POLICY_URL = '/audit/api/v1/admin/audit/retention-policy';
const STATUS_URL = '/audit/api/v1/admin/audit/archive/status';
const ARCHIVE_URL = '/audit/api/v1/admin/audit/archive';
const LOGS_URL = '/audit/api/v1/admin/audit/logs';
const TS = '2026-10-04T00:00:00Z';
const LAST_ARCHIVE_MS = 1759536000000;

interface Captured {
	url: string;
	method: string;
}

let captured: Captured[] = [];
let originalAdapter: unknown;
let failArchive = false;

function ok(payload: unknown, config: any) {
	return { data: payload, status: 200, statusText: 'OK', headers: {}, config };
}

function installCaptureAdapter() {
	captured = [];
	failArchive = false;
	originalAdapter = apiClient.defaults.adapter;
	apiClient.defaults.adapter = (async (config: any) => {
		const url = String(config.url || '');
		captured.push({ url, method: String(config.method || 'get').toLowerCase() });
		if (url === POLICY_URL) {
			return ok(
				{
					code: 0,
					message: 'success',
					data: { tenant_id: 'tenant-w1e', days: 90, enabled: true, archive_to: 'minio', bucket: 'audit-archive' },
					timestamp: TS,
				},
				config,
			);
		}
		if (url === STATUS_URL) {
			return ok(
				{
					code: 0,
					message: 'success',
					data: { enabled: true, days: 90, bucket: 'audit-archive', last_archive: LAST_ARCHIVE_MS },
					timestamp: TS,
				},
				config,
			);
		}
		if (url === ARCHIVE_URL) {
			// 传输层错误（英文原文）→ 页面必须回落中文 fallback（error-handler A-200④ 口径）
			throw new Error('Request failed with status code 500');
		}
		if (url === LOGS_URL) {
			return ok({ code: 0, message: 'success', items: [], total: 0, timestamp: TS }, config);
		}
		return ok({ code: 0, message: 'success', items: [], total: 0, timestamp: TS }, config);
	}) as any;
}

function renderPage() {
	const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
	return render(
		<QueryClientProvider client={queryClient}>
			<MemoryRouter>
				<RetentionPolicyPage />
			</MemoryRouter>
		</QueryClientProvider>,
	);
}

describe('保留策略页本地化（A-219 残余）', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		installCaptureAdapter();
	});

	afterEach(() => {
		apiClient.defaults.adapter = originalAdapter as any;
	});

	it('①：document.title=保留策略 — Autional', async () => {
		renderPage();
		await waitFor(() => expect(document.title).toBe('保留策略 — Autional'));
	});

	it('③：lastArchive 毫秒时间戳按 zh-CN 本地化（数字原样零命中）', async () => {
		renderPage();
		expect((await screen.findAllByText('已启用')).length).toBeGreaterThan(0);
		expect(screen.getByText(new Date(LAST_ARCHIVE_MS).toLocaleString('zh-CN'))).toBeInTheDocument();
		expect(screen.queryByText(String(LAST_ARCHIVE_MS))).toBeNull();
	});

	it('②：归档失败（传输层英文）→ 中文 fallback toast「归档失败」，英文原文零透出', async () => {
		renderPage();
		expect((await screen.findAllByText('已启用')).length).toBeGreaterThan(0);

		fireEvent.click(screen.getByText('立即归档'));
		// Popconfirm 二次确认（确认前零归档请求）
		const okBtn = await screen.findByRole('button', { name: '确认归档' });
		expect(captured.filter((c) => c.url === ARCHIVE_URL)).toHaveLength(0);
		fireEvent.click(okBtn);

		await waitFor(() => expect(vi.mocked(message.error)).toHaveBeenCalledWith('归档失败'));
		expect(vi.mocked(message.error).mock.calls.map((c) => String(c[0]))).not.toContain(
			'Request failed with status code 500',
		);
		expect(vi.mocked(message.success)).not.toHaveBeenCalled();
	});
});
