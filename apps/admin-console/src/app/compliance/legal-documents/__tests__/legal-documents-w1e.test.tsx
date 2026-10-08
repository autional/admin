// W1e-31（fix-admin-b5-polish / A-276 + A-278）：条款文档页收口回归锁。
//
//   A-276：弃用草稿无归档路径（旧仅 published 行可归档）→ draft 亦可直接归档
//           （避免「发布（effective_at 空置 now）→归档」绕行的非预期短时上线风险）；
//   A-278①：编辑/新建表单占位符错用筛选文案（按类型筛选/按语言筛选）→ 表单专用占位符；
//   A-278②：生效时间列零格式化（裸显 RFC3339）→ 按 i18n.language 本地化（空值 '-'）；
//   A-278③：无 usePageTitle（tab 恒"Autional 管理控制台"）→ 挂载「条款文档管理」。
//
// 断言口径 = 渲染输出 + modal.confirm 实参 + wire 请求 + 最终通知实参。
// 注：归档确认走 '@/lib/antd-app' 的 modal.confirm（mock 捕获 → 显式回调 onOk 穿真实链路）。

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent, within, cleanup, configure } from '@testing-library/react';
import { apiClient } from '@autional/shared';

// 全量门并行负载下，antd 动画/首渲染可超测试库默认 1000ms 异步超时 → 放宽（防假红）
configure({ asyncUtilTimeout: 5000 });
import { message, modal } from '@/lib/antd-app';
import LegalDocumentsPage from '../page';

vi.mock('@/lib/antd-app', () => ({
	message: { success: vi.fn(), error: vi.fn() },
	modal: { confirm: vi.fn() },
}));

const LIST_URL = '/compliance/api/v1/admin/compliance/legal-documents';
const DRAFT_ID = 'ld-draft-w1e';
const PUB_ID = 'ld-pub-w1e';
const ARCH_ID = 'ld-arch-w1e';
const ARCHIVE_URL = `${LIST_URL}/${DRAFT_ID}/archive`;
const TS = '2026-10-04T00:00:00Z';
const EFFECTIVE_AT = '2026-01-15T10:00:00Z';
const CONTENT_FIXTURE = '[{"title":"第一条","body":"……"}]';

/** wire 形状（snake）：三行覆盖 draft/published/archived（A-276 判别靠 draft 行）。 */
const RAW_DOCS = [
	{
		id: DRAFT_ID,
		doc_type: 'terms',
		version: '0.9',
		title: '弃用草稿留档',
		lang: 'zh-CN',
		status: 'draft',
		content: CONTENT_FIXTURE,
		effective_at: null,
	},
	{
		id: PUB_ID,
		doc_type: 'privacy',
		version: '1.0',
		title: '已发布正文',
		lang: 'en-US',
		status: 'published',
		content: CONTENT_FIXTURE,
		effective_at: EFFECTIVE_AT,
	},
	{
		id: ARCH_ID,
		doc_type: 'terms',
		version: '0.1',
		title: '历史版本',
		lang: 'zh-CN',
		status: 'archived',
		content: CONTENT_FIXTURE,
		effective_at: EFFECTIVE_AT,
	},
];

interface Captured {
	url: string;
	method: string;
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
		captured.push({ url, method });
		if (url === LIST_URL && method === 'get') {
			return ok(
				{
					code: 0,
					message: 'success',
					items: RAW_DOCS,
					total: RAW_DOCS.length,
					pagination: { total: RAW_DOCS.length, page: 1, page_size: 20, total_pages: 1, has_next: false },
					timestamp: TS,
				},
				config,
			);
		}
		if (url === ARCHIVE_URL && method === 'post') {
			return ok({ code: 0, message: 'success', data: {}, timestamp: TS }, config);
		}
		return ok({ code: 0, message: 'success', data: {}, timestamp: TS }, config);
	}) as any;
}

/** 行定位：标题单元格 → 直属 tr。 */
function rowOf(title: string): HTMLElement {
	const cell = screen.getByText(title);
	const row = cell.closest('tr');
	expect(row).toBeTruthy();
	return row as HTMLElement;
}

describe('条款文档页 A-276/A-278（W1e）', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		installCaptureAdapter();
	});

	afterEach(() => {
		cleanup();
		apiClient.defaults.adapter = originalAdapter as any;
	});

	it('A-276：draft 行可归档（published 亦然、archived 无）→ 确认后 POST /archive + 成功回执', async () => {
		render(<LegalDocumentsPage />);
		await screen.findByText('弃用草稿留档');

		// 旧形态：draft 行零归档按钮 → 必红；archived 行不得出现归档
		const draftRow = rowOf('弃用草稿留档');
		expect(within(draftRow).getByText('归档')).toBeInTheDocument();
		expect(within(rowOf('已发布正文')).getByText('归档')).toBeInTheDocument();
		expect(within(rowOf('历史版本')).queryByText('归档')).toBeNull();

		// 确认弹窗（mock 捕获实参）→ 确认前零 POST（负控）
		fireEvent.click(within(draftRow).getByText('归档'));
		const confirmArgs = vi.mocked(modal.confirm).mock.calls[0][0] as {
			title: string;
			content: string;
			okText: string;
			onOk: () => Promise<void>;
		};
		expect(confirmArgs.title).toBe('确认归档');
		expect(confirmArgs.content).toBe('归档后将不再向用户展示，确定归档？');
		expect(confirmArgs.okText).toBe('归档');
		expect(captured.filter((c) => c.method === 'post')).toHaveLength(0);

		// 穿真实链路：onOk → handleArchive → POST → 成功回执
		await confirmArgs.onOk();
		await waitFor(() => expect(captured.some((c) => c.url === ARCHIVE_URL && c.method === 'post')).toBe(true));
		await waitFor(() => expect(vi.mocked(message.success)).toHaveBeenCalledWith('归档成功'));
	});

	it('A-278③：document.title=条款文档管理 — Autional（旧形态恒"Autional 管理控制台"）', async () => {
		render(<LegalDocumentsPage />);
		await waitFor(() => expect(document.title).toBe('条款文档管理 — Autional'));
	});

	it('A-278①：表单占位符专用文案（旧形态错用筛选文案「按类型筛选/按语言筛选」）', async () => {
		render(<LegalDocumentsPage />);
		await screen.findByText('弃用草稿留档');

		fireEvent.click(screen.getByText('新建条款'));
		const modalEl = await waitFor(() => {
			const el = document.querySelector('.ant-modal');
			expect(el).toBeTruthy();
			return el as HTMLElement;
		});
		const scope = within(modalEl);
		// 新占位符上屏 + 旧筛选占位符在表单内零命中
		expect(scope.getByText('选择文档类型')).toBeInTheDocument();
		expect(scope.getByText('选择语言')).toBeInTheDocument();
		expect(scope.queryByText('按类型筛选')).toBeNull();
		expect(scope.queryByText('按语言筛选')).toBeNull();
	});

	it('A-278②：生效时间列本地化（published 行本地化值；裸 RFC3339 零命中；空值 "-"）', async () => {
		render(<LegalDocumentsPage />);
		await screen.findByText('已发布正文');

		// 旧形态：裸显 RFC3339 → 本地化断言必红
		expect(within(rowOf('已发布正文')).getByText(new Date(EFFECTIVE_AT).toLocaleString('zh-CN'))).toBeInTheDocument();
		expect(screen.queryByText(EFFECTIVE_AT)).toBeNull();
		// draft 行 effective_at=null → '-'
		expect(within(rowOf('弃用草稿留档')).getByText('-')).toBeInTheDocument();
	});
});
