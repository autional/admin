// W1e-29（fix-admin-b5-polish / A-259 + A-260 + A-261 + A-262 + A-264）：认证管理列表页收口回归锁。
//
//   A-259：分页 showTotal 旧传 { count } 而模板 {{total}} ⇒ DOM 字面量「共 {{total}} 条」→ 改 { total }；
//   A-260：domain 9 值 vs 页面映射 8 值（缺 manual_review）→ 补映射（行本地化 + 筛选选项同源派生）；
//   A-261：覆盖弹窗术语冲突（旧「人工审核」族与 manual_review 状态「人工审核中」撞名）→ 全文案「人工覆盖」族；
//   A-262：method/provider/ageGroup 枚举原样英文 + verifiedAt/createdAt RFC3339 原样
//           → 词表本地化（未收录回退原值）+ 按 i18n.language 本地化；
//   A-264：导出端点零引用 → 导出 CSV 入口（CSV 文本 → 客户端 Blob 下载）+ 转人工复核入口 + 搜索防抖
//           （击键 400ms 空闲才发 GET；回车立即提交）。
//
// 断言口径 = 渲染输出 + 最终通知实参 + 请求实参（URL/params/body）；负控成对（旧形态零命中）。
// 注：本页 message 走 '@/lib/antd-app'（mock 捕获）；导出下载留阶段 B（浏览器实测），本测试锁
//     Blob 载荷与文件名契约（jsdom 无真实下载）。

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent, within, configure } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// 全量门并行负载下，antd 动画/首渲染可超测试库默认 1000ms 异步超时 → 放宽（防假红）
configure({ asyncUtilTimeout: 5000 });
import { MemoryRouter } from 'react-router';
import { apiClient } from '@autional/shared';
import { message } from '@/lib/antd-app';
import VerificationsPage from '../page';

vi.mock('@/lib/antd-app', () => ({
	message: { success: vi.fn(), error: vi.fn() },
	modal: { confirm: vi.fn() },
}));

const LIST_URL = '/verification/api/v1/admin/verifications';
const STATS_URL = '/verification/api/v1/admin/verifications/stats';
const EXPORT_URL = '/verification/api/v1/admin/verifications/export';
const REVIEW_URL = '/verification/api/v1/admin/verifications/v-1/manual-review';
const OVERRIDE_URL = '/verification/api/v1/admin/verifications/v-1/override';
const TS = '2026-10-04T00:00:00Z';
const VERIFIED_AT = '2026-01-15T10:00:00Z';
const CREATED_AT = '2026-01-14T08:30:00Z';
const CREATED_AT2 = '2026-01-13T08:30:00Z';
const CSV = 'id,user_id,status\nv-1,u-1,verified\n';

function rows() {
	return [
		{
			id: 'v-1',
			user_id: 'u-1',
			status: 'verified',
			method: 'three_element',
			provider: 'aliyun',
			age_group: 'adult',
			verified_at: VERIFIED_AT,
			created_at: CREATED_AT,
		},
		{
			id: 'v-2',
			user_id: 'u-2',
			status: 'manual_review',
			method: 'manual',
			provider: '',
			age_group: 'minor',
			verified_at: null,
			created_at: CREATED_AT2,
		},
	];
}

interface Captured {
	url: string;
	method: string;
	params?: unknown;
	data?: unknown;
}

let captured: Captured[] = [];
let originalAdapter: unknown;
let clickSpy: ReturnType<typeof vi.spyOn>;
let listGets = 0;

function ok(payload: unknown, config: any) {
	return { data: payload, status: 200, statusText: 'OK', headers: {}, config };
}

function installCaptureAdapter() {
	captured = [];
	listGets = 0;
	originalAdapter = apiClient.defaults.adapter;
	apiClient.defaults.adapter = (async (config: any) => {
		const url = String(config.url || '');
		const method = String(config.method || 'get').toLowerCase();
		captured.push({ url, method, params: config.params, data: config.data });
		if (url === LIST_URL && method === 'get') {
			listGets += 1;
			return ok(
				{
					code: 0,
					message: 'success',
					items: rows(),
					total: 2,
					pagination: { page: 1, page_size: 20, total: 2 },
					timestamp: TS,
				},
				config,
			);
		}
		if (url === STATS_URL && method === 'get') {
			return ok(
				{ code: 0, message: 'success', data: { total: 2, verified: 1, pending: 0, rejected: 0 }, timestamp: TS },
				config,
			);
		}
		if (url === EXPORT_URL && method === 'get') {
			// CSV 原文（非信封实体 → 拦截器透传）
			return { data: CSV, status: 200, statusText: 'OK', headers: {}, config };
		}
		if (url === REVIEW_URL && method === 'post') {
			return ok({ code: 0, message: 'success', data: {}, timestamp: TS }, config);
		}
		if (url === OVERRIDE_URL && method === 'post') {
			return ok({ code: 0, message: 'success', data: {}, timestamp: TS }, config);
		}
		return ok({ code: 0, message: 'success', data: {}, timestamp: TS }, config);
	}) as any;
}

function renderPage() {
	const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
	return render(
		<QueryClientProvider client={queryClient}>
			<MemoryRouter>
				<VerificationsPage />
			</MemoryRouter>
		</QueryClientProvider>,
	);
}

/** Modal 确定按钮（无 ConfigProvider → antd 默认 en locale = OK；兼容 zh 文案）。 */
function modalOkButton(): HTMLElement {
	return screen.getByRole('button', { name: /^(OK|确\s*定|确定)$/ }) as HTMLElement;
}

describe('认证管理列表页 A-259/260/261/262/264（W1e）', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		installCaptureAdapter();
		(URL as any).createObjectURL = vi.fn(() => 'blob:mock');
		(URL as any).revokeObjectURL = vi.fn();
		clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
	});

	afterEach(() => {
		apiClient.defaults.adapter = originalAdapter as any;
		clickSpy.mockRestore();
	});

	it('A-259：showTotal 传 { total } → 「共 2 条」（旧形态字面量「共 {{total}} 条」零命中）', async () => {
		renderPage();
		await screen.findByText('u-1');

		expect(screen.getByText('共 2 条')).toBeInTheDocument();
		expect(screen.queryByText('共 {{total}} 条')).toBeNull();
	});

	it('A-260：manual_review 行本地化「人工审核中」+ 筛选选项同源派生（旧形态行显原始英文）', async () => {
		renderPage();
		await screen.findByText('u-2');

		// 行 Tag 本地化（旧形态直出 manual_review）
		expect(screen.getByText('人工审核中')).toBeInTheDocument();
		expect(screen.queryByText('manual_review')).toBeNull();

		// 筛选下拉含同值选项（选项表与行映射同源派生）；页脚 page-size Select 亦为 combobox → 取首个（筛选）
		fireEvent.mouseDown(screen.getAllByRole('combobox')[0]);
		const dropdown = await waitFor(() => {
			const el = document.querySelector('.ant-select-dropdown');
			expect(el).toBeTruthy();
			return el as HTMLElement;
		});
		expect(within(dropdown).getByText('人工审核中')).toBeInTheDocument();
	});

	it('A-262：method/provider/ageGroup 词表 + 时间本地化（英文原值/ISO 原样零命中）', async () => {
		renderPage();
		await screen.findByText('u-1');

		// 词表（旧形态直出 three_element / aliyun / adult）
		expect(screen.getByText('三要素')).toBeInTheDocument();
		expect(screen.getByText('阿里云')).toBeInTheDocument();
		expect(screen.getByText('成人')).toBeInTheDocument();
		expect(screen.queryByText('three_element')).toBeNull();
		expect(screen.queryByText('aliyun')).toBeNull();
		expect(screen.queryByText('adult')).toBeNull();

		// verified_at / created_at → toLocaleString(i18n.language)；RFC3339 原文零命中
		expect(screen.getByText(new Date(VERIFIED_AT).toLocaleString('zh-CN'))).toBeInTheDocument();
		expect(screen.getByText(new Date(CREATED_AT).toLocaleString('zh-CN'))).toBeInTheDocument();
		expect(screen.getByText(new Date(CREATED_AT2).toLocaleString('zh-CN'))).toBeInTheDocument();
		expect(screen.queryByText(VERIFIED_AT)).toBeNull();
		expect(screen.queryByText(CREATED_AT)).toBeNull();
		expect(screen.queryByText(CREATED_AT2)).toBeNull();
	});

	it('A-261：覆盖弹窗术语 = 「人工覆盖」族（与「人工审核中」状态解冲突）', async () => {
		renderPage();
		await screen.findByText('u-1');

		fireEvent.click(screen.getAllByText('覆盖')[0]);

		// 旧形态弹窗标题「人工审核」（与状态「人工审核中」撞名）→ 新「人工覆盖」
		expect(await screen.findByText('人工覆盖')).toBeInTheDocument();
		expect(screen.getByText('覆盖原因')).toBeInTheDocument();
		expect(screen.queryByText('人工审核')).toBeNull();
	});

	it('A-264：导出 CSV 入口 → GET export + Blob 载荷全等 + 文件名契约 + 成功回执', async () => {
		renderPage();
		await screen.findByText('u-1');

		// 旧形态：导出端点零引用（无入口 → 必红）
		fireEvent.click(screen.getByText('导出 CSV'));
		await waitFor(() => expect(captured.some((c) => c.url === EXPORT_URL && c.method === 'get')).toBe(true));

		const createURL = (URL as any).createObjectURL as ReturnType<typeof vi.fn>;
		await waitFor(() => expect(createURL).toHaveBeenCalledTimes(1));
		const blob = createURL.mock.calls[0][0] as Blob;
		expect(blob.type).toContain('text/csv');
		expect(await blob.text()).toBe(CSV);

		// anchor 下载名契约 + 释放 URL
		expect(clickSpy).toHaveBeenCalledTimes(1);
		const anchor = (clickSpy.mock.instances as unknown as HTMLAnchorElement[])[0];
		expect(anchor.download).toMatch(/^verifications-\d+\.csv$/);
		expect((URL as any).revokeObjectURL).toHaveBeenCalledWith('blob:mock');
		expect(vi.mocked(message.success)).toHaveBeenCalledWith('导出完成');
	});

	it('A-264：转人工复核入口（manual_review 行不重复触发）→ POST /manual-review + 成功回执', async () => {
		renderPage();
		await screen.findByText('u-1');

		// 两行中仅 verified 行有入口（manual_review 行零入口）
		const entries = screen.getAllByText('转人工复核');
		expect(entries).toHaveLength(1);

		fireEvent.click(entries[0]);
		// 弹窗：说明 + 原因输入口
		expect(await screen.findByText(/转入人工复核流程/)).toBeInTheDocument();
		fireEvent.change(screen.getByPlaceholderText('说明转入人工复核的原因...'), {
			target: { value: '活体分数偏低需人工复核' },
		});
		fireEvent.click(modalOkButton());

		await waitFor(() => expect(captured.some((c) => c.url === REVIEW_URL && c.method === 'post')).toBe(true));
		const call = captured.find((c) => c.url === REVIEW_URL) as Captured;
		expect(JSON.parse(String(call.data))).toEqual({ reason: '活体分数偏低需人工复核' });
		await waitFor(() => expect(vi.mocked(message.success)).toHaveBeenCalledWith('已转入人工复核'));
	});

	it('A-264：搜索防抖 — 击键 400ms 内零 GET，空闲后才发（search 入参）；回车立即提交', async () => {
		renderPage();
		await screen.findByText('u-1');
		await waitFor(() => expect(listGets).toBe(1));

		// 输入 → 未到 400ms：零新 GET（旧形态每击键即发）
		const input = screen.getByPlaceholderText('搜索用户') as HTMLInputElement;
		fireEvent.change(input, { target: { value: 'alice' } });
		await new Promise((r) => setTimeout(r, 150));
		expect(listGets).toBe(1);

		// 空闲期过 → 防抖提交（search=alice）
		await waitFor(
			() => {
				expect(listGets).toBe(2);
				const last = [...captured].reverse().find((c) => c.url === LIST_URL && c.method === 'get') as Captured;
				expect((last.params as any).search).toBe('alice');
			},
			{ timeout: 3000 },
		);

		// 回车 = 立即提交（不等防抖）：bob 即刻进参
		fireEvent.change(input, { target: { value: 'bob' } });
		fireEvent.keyDown(input, { key: 'Enter', code: 'Enter', keyCode: 13 });
		await waitFor(
			() => {
				const last = [...captured].reverse().find((c) => c.url === LIST_URL && c.method === 'get') as Captured;
				expect((last.params as any).search).toBe('bob');
			},
			{ timeout: 3000 },
		);
	});
});
