// W1b（A-91 · A-93）：devices 详情波修复回归锁 ——
//   A-91：错误副标题不得残留「加载中」（旧实现 description fallback = t('common.loading')）
//   A-91：404 不重试（retryUnlessNotFound 页面接线实证：404 → 恰 1 次请求；500 → 恰 2 次，证谓词真接线）
//   A-93：notFound 死分支修复 —— 200 + data:null → EmptyState「未找到设备」可达
//         （旧 `?? ({} as DeviceInfo)` 空对象恒 truthy → notFound 分支永不触达）
// 断言口径 = 最终 wire 请求/响应（axios adapter 最末环捕获 + snake 行回写，与线上链路同构）。
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Routes, Route } from 'react-router';
import { apiClient } from '@autional/shared';
import DeviceDetailPage from '../[id]/page';

vi.mock('@/lib/antd-app', () => ({
	message: { success: vi.fn(), error: vi.fn() },
}));

const IOTS_URL = '/identity/api/v1/admin/iots';
const DEV_ID = 'dev-detail-1';

/** wire 形状（snake）设备行（DeviceInfo 契约，经响应拦截器 camel 化）。 */
const RAW_DEVICE = {
	identity_id: DEV_ID,
	name: 'living-room-hub',
	workload_subtype: 'smart_home',
	status: 'active',
	owner_id: 'owner-001',
	hardware_id: 'HW-001',
	firmware_ver: '1.2.0',
	created_at: '2026-01-05T00:00:00Z',
	updated_at: '2026-01-06T00:00:00Z',
};

interface CapturedCall {
	method: string;
	url: string;
}

const captured: CapturedCall[] = [];
let originalAdapter: unknown;
let failStatus: number | null = null;
let emptyBody = false;

/** axios 形状的 HTTP 错误（穿响应拦截器：非 401/非 40000102-404 → 原样 reject）。 */
function httpError(status: number, config: any) {
	const err: any = new Error(`Request failed with status code ${status}`);
	err.response = { status, data: { code: `${status}00000` }, headers: {}, config };
	err.config = config;
	return err;
}

function installCaptureAdapter() {
	failStatus = null;
	emptyBody = false;
	originalAdapter = apiClient.defaults.adapter;
	apiClient.defaults.adapter = (async (config: any) => {
		const method = String(config.method || 'get').toLowerCase();
		const url = String(config.url || '');
		captured.push({ method, url });
		const ts = '2026-10-06T00:00:00Z';
		if (url.startsWith(`${IOTS_URL}/`)) {
			if (failStatus) throw httpError(failStatus, config);
			const data = emptyBody
				? { code: 0, message: 'success', data: null, timestamp: ts }
				: { code: 0, message: 'success', data: RAW_DEVICE, timestamp: ts };
			return { data, status: 200, statusText: 'OK', headers: {}, config };
		}
		return { data: { code: 0, message: 'success', items: [], total: 0, timestamp: ts }, status: 200, statusText: 'OK', headers: {}, config };
	}) as any;
}

const detailCalls = () => captured.filter((c) => c.method === 'get' && c.url.startsWith(`${IOTS_URL}/`));

function renderPage(id: string = DEV_ID) {
	const queryClient = new QueryClient({
		// retryDelay=0：500 重试路径无等待（谓词接线验证用）
		defaultOptions: { queries: { retry: false, retryDelay: 0 }, mutations: { retry: false } },
	});
	return render(
		<QueryClientProvider client={queryClient}>
			<MemoryRouter initialEntries={[`/devices/${id}`]}>
				<Routes>
					<Route path="/devices/:id" element={<DeviceDetailPage />} />
				</Routes>
			</MemoryRouter>
		</QueryClientProvider>,
	);
}

describe('devices 详情（A-91/A-93）', () => {
	beforeEach(() => {
		captured.length = 0;
		installCaptureAdapter();
	});

	afterEach(() => {
		apiClient.defaults.adapter = originalAdapter as any;
	});

	it('AC-B5-W1b-91：404 → 错误态可见 + 副标题无「加载中」+ 404 零重试（恰 1 次请求）', { timeout: 20000 }, async () => {
		failStatus = 404;
		renderPage('dev-bad');

		// 错误态专用文案上屏
		expect(await screen.findByText('加载设备失败')).toBeTruthy();
		// A-91：副标题不得残留「加载中」（旧实现 description fallback = common.loading）
		expect(screen.queryByText('加载中')).toBeNull();
		// 404 零重试：恰 1 次详情请求（旧缺陷 404 重试 → 2 条 console 噪声）
		expect(detailCalls()).toHaveLength(1);
	});

	it('AC-B5-W1b-91：500 → 沿用全局 retry:1（恰 2 次请求，证 retry 谓词真接线）', { timeout: 20000 }, async () => {
		failStatus = 500;
		renderPage('dev-err');

		expect(await screen.findByText('加载设备失败')).toBeTruthy();
		// 非 404 → retryUnlessNotFound 放行 1 次 → 共 2 次（若谓词未接线/被默认 false 吞掉则恒 1 次）
		await waitFor(() => expect(detailCalls()).toHaveLength(2));
	});

	it('AC-B5-W1b-93：200 + data:null → notFound EmptyState 可达（旧空对象恒 truthy → 死分支）', { timeout: 20000 }, async () => {
		emptyBody = true;
		renderPage('dev-missing');

		expect(await screen.findByText('未找到设备')).toBeTruthy();
		expect(screen.getByText('找不到所请求的设备。')).toBeTruthy();
		// 非错误态、非加载态：不得残留「加载中」副标题或错误文案
		expect(screen.queryByText('加载设备失败')).toBeNull();
		expect(screen.queryByText('加载中')).toBeNull();
	});
});
