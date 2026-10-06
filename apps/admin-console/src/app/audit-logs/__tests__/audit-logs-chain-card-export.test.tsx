// TASK-AB2-19（fix-admin-b2-security-forensics / A-196+A-199 · AC-B2-031/032）：租户链状态卡 + 导出表键位回归锁。
//
// A-196：取证「验证」面板内链状态卡必须走 per-tenant hashchain（挂载即拉 + 卡片刷新），渲染
//   isValid/logCount/verifiedAt；旧实现「最近验证」调平台面 /admin/audit/verifications
//   （实测 5702 条=5702 个不同租户跨租户暴露，且初载不拉恒空）。失败 → 错误态（非空卡）。
// A-199：导出任务表列键 = wire 键 camel（job_id→jobId / content_type→contentType /
//   generated_at→generatedAt）；下载以 jobId 发起（旧 record.id → .../export/undefined/download 404）。
//
// 反假绿：
//   ① 导出列表信封仅含 wire 键（无 id/format/createdAt）——旧实现三列全空 → 必红；
//   ② 下载 wire 全等断言（旧 undefined 路径必炸）+ 显式负控不含 /undefined/；
//   ③ 链卡负控：平台面 /verifications 端点零请求；挂载即有 per-tenant hashchain 请求（旧实现初载不拉）；
//   ④ 失败态断言作用域限定在链卡内（within(card)），防弹窗/他处同文案冒充；
//   ⑤ 状态映射断言本地化标签（'已完成'）与未知值原样兜底（'queued'）——旧实现裸显英文原值。

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router';
import { apiClient, useAuthStore } from '@autional/shared';
import AuditLogsPage from '../page';

// antd v6 命令式 API 由 AntdAppProvider 的 StaticsBridge 赋值（export let），测试不经 Provider 时为
// undefined——错误路径下 handleApiError 会炸在 message.error 上而吞掉后续 state 更新（生产由路由
// 层 Provider 保证）。按仓内既有模式桩化（forensics-contract / role-activations 同款）。
vi.mock('@/lib/antd-app', () => ({
	message: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
	modal: { confirm: vi.fn() },
}));

const TENANT = 'tenant-b2x';
const LOGS_URL = '/audit/api/v1/admin/audit/logs';
const HASHCHAIN_URL = `/audit/api/v1/admin/audit/hashchain/${TENANT}`;
const EXPORT_JOBS_URL = '/audit/api/v1/admin/audit/export/jobs';
const DOWNLOAD_URL = '/audit/api/v1/admin/audit/export/exp_b2_01/download';
const DOWNLOAD_URL_RESULT = 'https://cos.example.com/exports/exp_b2_01.csv';

// wire 形状（snake）aggregate：service-audit dto.go:181-190 HashChainResponse 全键。
const AGG = {
	tenant_id: TENANT,
	chain_id: 'chain-b2-01',
	start_hash: 'aaaa1111bbbb2222',
	end_hash: 'cccc3333dddd4444',
	log_count: 1842,
	is_valid: true,
	verified_at: 1759536000000, // 毫秒（dto 语义：TimeToMillis）
};

// wire 形状（snake）导出任务：仅 dto.go:918-925 ExportJobResponse 全键（无 id/format/createdAt）。
const JOBS = [
	{
		job_id: 'exp_b2_01',
		status: 'completed',
		filename: 'audit_logs_20261004.csv',
		content_type: 'text/csv',
		record_count: 42,
		generated_at: 1759536000000,
	},
	{
		job_id: 'exp_b2_02',
		status: 'queued', // 未知状态：兜底原样
		filename: 'audit_logs_20261005.json',
		content_type: 'application/json',
		record_count: 7,
		generated_at: 1759600000000,
	},
];

interface Captured {
	url: string;
	params: any;
}

let captured: Captured[] = [];
let originalAdapter: unknown;
let failHashChain = false;

function installCaptureAdapter() {
	captured = [];
	failHashChain = false;
	originalAdapter = apiClient.defaults.adapter;
	apiClient.defaults.adapter = (async (config: any) => {
		const url = String(config.url || '');
		captured.push({ url, params: config.params });
		if (failHashChain && url.includes('/hashchain/')) {
			throw new Error('network down');
		}
		let payload: unknown;
		if (url.includes('/hashchain/')) {
			payload = { code: 0, message: 'success', data: AGG, timestamp: '2026-10-04T00:00:00Z' };
		} else if (url === EXPORT_JOBS_URL) {
			payload = {
				code: 0,
				message: 'success',
				items: JOBS,
				total: JOBS.length,
				timestamp: '2026-10-04T00:00:00Z',
			};
		} else if (url.includes('/download')) {
			payload = {
				code: 0,
				message: 'success',
				data: { download_url: DOWNLOAD_URL_RESULT },
				timestamp: '2026-10-04T00:00:00Z',
			};
		} else {
			payload = { code: 0, message: 'success', items: [], total: 0, timestamp: '2026-10-04T00:00:00Z' };
		}
		return { data: payload, status: 200, statusText: 'OK', headers: {}, config };
	}) as any;
}

function renderPage() {
	const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
	return render(
		<QueryClientProvider client={queryClient}>
			<MemoryRouter>
				<AuditLogsPage />
			</MemoryRouter>
		</QueryClientProvider>,
	);
}

describe('租户链状态卡（A-196 · AC-B2-031）', () => {
	beforeEach(() => {
		installCaptureAdapter();
		useAuthStore.setState({ currentTenantId: TENANT });
	});

	afterEach(() => {
		apiClient.defaults.adapter = originalAdapter as any;
		useAuthStore.setState({ currentTenantId: null });
		window.localStorage.clear();
	});

	it('挂载即拉 per-tenant hashchain；卡渲染 isValid/logCount/verifiedAt；零平台面 verifications 请求', async () => {
		renderPage();

		// 挂载即请求会话租户链（旧实现初载不拉；且仅点刷新才打平台面端点）
		await waitFor(() => expect(captured.some((c) => c.url === HASHCHAIN_URL)).toBe(true));

		fireEvent.click(screen.getByText('验证'));

		// 卡标题为「租户链状态」（旧「最近验证」）
		expect(await screen.findByText('租户链状态')).toBeInTheDocument();
		// aggregate 三键上屏
		expect(await screen.findByText('1842')).toBeInTheDocument();
		expect(await screen.findByText('有效')).toBeInTheDocument();
		expect(screen.getByText(new Date(AGG.verified_at).toLocaleString('zh-CN'))).toBeInTheDocument();
		// 负控：平台面端点（跨租户 5702 泄露路径）零请求
		expect(captured.some((c) => c.url.includes('/admin/audit/verifications'))).toBe(false);
	});

	it('链获取失败 → 卡错误态可见（非空卡、非「暂无」；判别旧实现空态冒充）', async () => {
		failHashChain = true;
		renderPage();

		fireEvent.click(screen.getByText('验证'));
		const title = await screen.findByText('租户链状态');
		const card = title.closest('.ant-card') as HTMLElement;
		expect(card).toBeTruthy();

		// 卡内错误态（旧实现：空卡 + 数据缺失被伪装成「暂无验证结果」）
		await waitFor(() => expect(within(card).getByText('获取哈希链失败')).toBeInTheDocument());
		expect(within(card).queryByText('暂无哈希链数据')).toBeNull();
		expect(within(card).queryByText('暂无验证结果')).toBeNull();
	});
});

describe('导出表键位（A-199 · AC-B2-032）', () => {
	beforeEach(() => {
		installCaptureAdapter();
		useAuthStore.setState({ currentTenantId: TENANT });
	});

	afterEach(() => {
		apiClient.defaults.adapter = originalAdapter as any;
		useAuthStore.setState({ currentTenantId: null });
		window.localStorage.clear();
	});

	it('列按 wire 键渲染（jobId/contentType/generatedAt/status）；本地化 + 未知状态原样兜底', async () => {
		renderPage();
		fireEvent.click(screen.getByText('导出任务'));

		// job_id → jobId 列（旧实现 dataIndex 'id' → 全空）
		expect(await screen.findByText('exp_b2_01')).toBeInTheDocument();
		expect(screen.getByText('exp_b2_02')).toBeInTheDocument();
		// content_type → contentType 列（旧实现 dataIndex 'format' → 全空）
		expect(screen.getByText('text/csv')).toBeInTheDocument();
		expect(screen.getByText('application/json')).toBeInTheDocument();
		// status：completed 本地化（旧实现裸显英文原值）
		expect(screen.getByText('已完成')).toBeInTheDocument();
		// 未知状态兜底原样
		expect(screen.getByText('queued')).toBeInTheDocument();
		// generated_at → generatedAt 列（旧实现 dataIndex 'createdAt' → 全空）
		expect(screen.getByText(new Date(1759536000000).toLocaleString())).toBeInTheDocument();
		expect(screen.getByText('42')).toBeInTheDocument();
	});

	it('下载以 jobId 发起（wire 全等路径；旧 undefined 路径负控）', async () => {
		const openSpy = vi.spyOn(window, 'open').mockReturnValue(null);
		try {
			renderPage();
			fireEvent.click(screen.getByText('导出任务'));

			const download = await screen.findByText('下载');
			fireEvent.click(download);

			// 全等断言：旧实现 record.id=undefined → .../export/undefined/download 必炸
			await waitFor(() => expect(captured.some((c) => c.url === DOWNLOAD_URL)).toBe(true));
			expect(captured.some((c) => c.url.includes('/undefined'))).toBe(false);
			// 响应 download_url 键 camel 化后被取用（下载闭环非仅请求）
			await waitFor(() => expect(openSpy).toHaveBeenCalledWith(DOWNLOAD_URL_RESULT, '_blank'));
		} finally {
			openSpy.mockRestore();
		}
	});
});
