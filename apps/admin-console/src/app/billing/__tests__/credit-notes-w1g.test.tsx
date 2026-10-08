// W1g（A-430/A-431）AC-B5-W1g-17/18：信用票据页回归锁 ——
//   A-430：删除须先取消（服务端 IsTerminal 守卫 "must be cancelled first"）→ 非 cancelled 置灰、
//          cancelled 可删。
//   A-431①：状态标签 issued/cancelled 单点映射（applied 为虚构枚举已退场）
//   A-431②：appliedAt 死字段行移除（DTO 声明、domain 无此字段、mapper 不填）
//   A-431④：amount=0 不因假值判定显 '-'；decimal 字符串经 Number → toLocaleString
// 断言口径 = 表格行 DOM + 详情弹窗 DOM。
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
	render,
	screen,
	waitFor,
	within,
	fireEvent,
	cleanup,
	configure,
} from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { apiClient } from '@autional/shared';
import BillingCreditNotesPage from '../credit-notes/page';

vi.mock('@/lib/antd-app', () => ({ message: { success: vi.fn(), error: vi.fn(), warning: vi.fn() } }));

configure({ asyncUtilTimeout: 15000 });

const NOTE_URL = '/billing/api/v1/admin/billing/credit-note';
const TS = '2026-10-06T00:00:00Z';

const NOTES: Record<string, Record<string, unknown>> = {
	'CN-W1G-001': {
		credit_note_number: 'CN-W1G-001',
		invoice_number: 'INV-W1G-001',
		amount: '12.34',
		status: 'issued',
		reason: '部分退款',
		issued_at: TS,
	},
	'CN-W1G-002': {
		credit_note_number: 'CN-W1G-002',
		invoice_number: 'INV-W1G-002',
		amount: '0',
		status: 'cancelled',
		reason: '',
		issued_at: TS,
	},
};

let originalAdapter: unknown;

function installAdapter() {
	originalAdapter = apiClient.defaults.adapter;
	apiClient.defaults.adapter = (async (config: any) => {
		const url = String(config.url || '');
		const number = url.split('/').pop() || '';
		const note = NOTES[number];
		return {
			data: {
				code: 0,
				message: 'success',
				data: note ?? {},
				timestamp: TS,
			},
			status: 200,
			statusText: 'OK',
			headers: {},
			config,
		};
	}) as any;
}

function renderPage() {
	const queryClient = new QueryClient({
		defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
	});
	return render(
		<QueryClientProvider client={queryClient}>
			<BillingCreditNotesPage />
		</QueryClientProvider>,
	);
}

function searchNote(number: string) {
	fireEvent.change(screen.getByPlaceholderText('输入票据编号查询'), {
		target: { value: number },
	});
	fireEvent.click(screen.getByRole('button', { name: /查询/ }));
}

describe('信用票据（A-430/A-431）', () => {
	beforeEach(() => {
		installAdapter();
	});

	afterEach(() => {
		cleanup();
		apiClient.defaults.adapter = originalAdapter as any;
	});

	it(
		'AC-B5-W1g-17/18：issued 行 — 已签发 Tag + 删除置灰 + 详情无「应用时间」',
		{ timeout: 20000 },
		async () => {
			renderPage();
			searchNote('CN-W1G-001');

			expect(await screen.findByText('已签发')).toBeTruthy();
			expect(await screen.findByText('12.34')).toBeTruthy();

			// A-430：非 cancelled → 删除置灰（旧实现无守卫直发 → 服务端 400）
			const deleteBtn = screen.getByRole('button', { name: /删除/ }) as HTMLButtonElement;
			expect(deleteBtn.disabled).toBe(true);
			// issued 行仍有「取消」入口（取消后可删）
			expect(screen.getByRole('button', { name: /取消/ })).toBeTruthy();

			// A-431②：详情弹窗无 appliedAt 行（旧「应用时间」→ 必红）
			fireEvent.click(screen.getByRole('button', { name: /详情/ }));
			const modal = await waitFor(() => {
				const el = document.querySelector('.ant-modal');
				expect(el).toBeTruthy();
				return el as HTMLElement;
			});
			expect(within(modal).getByText('票据详情')).toBeTruthy();
			expect(within(modal).queryByText('应用时间')).toBeNull();
			expect(within(modal).getByText('签发时间')).toBeTruthy();
			// A-431①：详情状态同映射（旧裸显英文原值）
			expect(within(modal).getByText('已签发')).toBeTruthy();
		},
	);

	it(
		'AC-B5-W1g-18：cancelled 行 — amount=0 显示「0」非「-」+ 已取消 + 删除可点',
		{ timeout: 20000 },
		async () => {
			renderPage();
			searchNote('CN-W1G-002');

			expect(await screen.findByText('已取消')).toBeTruthy();

			const row = await waitFor(() => {
				const el = document.querySelector('tr[data-row-key="CN-W1G-002"]');
				expect(el).toBeTruthy();
				return el as HTMLElement;
			});
			// A-431④：amount '0' 经 Number → toLocaleString 显示 '0'（旧假值判定 → '-'）
			expect(within(row).getByText('0')).toBeTruthy();

			// A-430：cancelled → 删除可点（守卫放行）
			const deleteBtn = screen.getByRole('button', { name: /删除/ }) as HTMLButtonElement;
			expect(deleteBtn.disabled).toBe(false);
		},
	);
});
