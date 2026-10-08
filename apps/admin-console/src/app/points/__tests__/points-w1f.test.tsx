// W1f-29（A-325..A-333）回归锁 —— 积分管理页（/points）：
//   A-325：规则列表接 include_disabled=true（旧零参 ⇒ 停用规则从列表消失、无入口再启用）。
//   A-327：账户表 frozen_balance/status 两列 + 账户/交易两表 page/page_size 上行 + 服务端 total 驱动页数
//          （旧零分页参上行 ⇒ 服务端默认 20/页 vs 本地 10/页截断潜伏）。
//   A-328：金额按交易类型判色（wire amount 恒正数存储 ⇒ 旧按符号判色则消费/过期亦绿）。
//   A-329：风险评分懒载（旧每行一 useQuery ⇒ 10 行 10 请求 N+1）；本测试锁「打开前 0 请求 / 点击后恰 1 请求」。
//   A-331：转账页签与行转账弹窗表单双实例（旧共用 transferForm ⇒ 弹窗开合 resetFields 穿透清空 Tab 输入）。
//   A-332：解冻/过期补 Popconfirm（旧仅冻结有；过期比冻结更不可逆却直开弹窗）。
//   A-333：死键 exchangeTransferEnabled / 死 hook useUpdateAccountStatus 删（源码 grep 零命中）。
// 断言口径 = 最终 wire 请求参数（adapter 捕获，请求拦截器之后）+ 行渲染（data-row-key）+ 弹层可见性 + 源码静态检查。
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent, cleanup, configure } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { apiClient } from '@autional/shared';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import PointsPage from '../page';

vi.mock('@/lib/antd-app', () => ({
	message: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
	modal: { confirm: vi.fn() },
}));

configure({ asyncUtilTimeout: 15000 });

const TS = '2026-10-06T00:00:00Z';

const RULES_URL = '/point/api/v1/admin/point-rules';
const ACCOUNTS_URL = '/point/api/v1/admin/points';
const TX_URL = '/point/api/v1/admin/points/transactions';
const CONFIG_URL = '/point/api/v1/admin/points/config';

interface CapturedCall {
	method: string;
	url: string;
	params?: Record<string, unknown>;
}

const captured: CapturedCall[] = [];
let originalAdapter: unknown;

const RAW_RULES = [
	{ id: 'rule_w1f_01', name: '规则甲', trigger_condition: 'order.paid', points: 7, status: 'active' },
	{ id: 'rule_w1f_02', name: '规则乙', trigger_condition: 'user.register', points: 3, status: 'inactive' },
];

// A-327①：wire 键 frozen_balance/status（旧接口缺键 ⇒ 两列无从渲染）
const RAW_ACCOUNTS = Array.from({ length: 10 }, (_, i) => ({
	id: `acc_w1f_${i + 1}`,
	user_id: `u_w1f_${String(i + 1).padStart(2, '0')}`,
	user_name: i === 0 ? '张小明' : `用户${i + 1}`,
	balance: 1000 + i,
	frozen_balance: i === 0 ? 30 : 0,
	total_earned: 5000,
	total_spent: 1000,
	status: i === 0 ? 'suspended' : 'active',
}));

// A-328：amount 恒正数存储（earn 999 / spend 55，均为正数）
const RAW_TXS = [
	{ id: 'tx_w1f_01', user_id: 'u_w1f_01', type: 'earn', amount: 999, source: 'order', created_at: TS },
	{ id: 'tx_w1f_02', user_id: 'u_w1f_01', type: 'spend', amount: 55, source: 'order', created_at: TS },
];

function installAdapter() {
	originalAdapter = apiClient.defaults.adapter;
	apiClient.defaults.adapter = (async (config: any) => {
		const method = String(config.method || 'get').toLowerCase();
		const url = String(config.url || '');
		captured.push({ method, url, params: config.params });

		let data: Record<string, unknown>;
		if (method === 'get' && url === RULES_URL) {
			data = { code: 0, message: 'success', items: RAW_RULES, total: 2, timestamp: TS };
		} else if (method === 'get' && url === ACCOUNTS_URL) {
			// A-327②：服务端第 1 页 10 条 + 总 25（旧本地截断 total=items.length=10 ⇒ 只有 1 页）
			data = { code: 0, message: 'success', items: RAW_ACCOUNTS, total: 25, timestamp: TS };
		} else if (method === 'get' && url === TX_URL) {
			data = { code: 0, message: 'success', items: RAW_TXS, total: 42, timestamp: TS };
		} else if (method === 'get' && url === CONFIG_URL) {
			data = {
				code: 0,
				message: 'success',
				data: { points_type: 'cash_equivalent' },
				timestamp: TS,
			};
		} else if (method === 'get' && url.includes('/risk-score')) {
			data = {
				code: 0,
				message: 'success',
				data: { risk_level: 'low', risk_score: 10 },
				timestamp: TS,
			};
		} else {
			data = { code: 0, message: 'success', data: {}, timestamp: TS };
		}
		return { data, status: 200, statusText: 'OK', headers: {}, config };
	}) as any;
}

function renderPage() {
	const queryClient = new QueryClient({
		defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
	});
	return render(
		<QueryClientProvider client={queryClient}>
			<PointsPage />
		</QueryClientProvider>,
	);
}

function accountRowButtons(key: string): HTMLButtonElement[] {
	const row = document.querySelector(`tr[data-row-key="${key}"]`) as HTMLElement;
	expect(row).toBeTruthy();
	return Array.from(row.querySelectorAll('button'));
}

describe('积分管理（A-325..A-333）', () => {
	beforeEach(() => {
		captured.length = 0;
		installAdapter();
	});

	afterEach(() => {
		cleanup();
		apiClient.defaults.adapter = originalAdapter as any;
	});

	it(
		'AC-B5-W1f-11/13：A-325 include_disabled 上行 + A-327 frozen/status 列 + 服务端 total=25 驱动 3 页',
		{ timeout: 20000 },
		async () => {
			renderPage();
			expect(await screen.findByText('规则甲')).toBeTruthy();

			// A-325：规则首拉 wire include_disabled=true（旧零参 ⇒ 必红）；停用规则照常上列
			await waitFor(() => {
				const calls = captured.filter((c) => c.method === 'get' && c.url === RULES_URL);
				expect(calls.length).toBeGreaterThanOrEqual(1);
				expect(calls[0].params).toMatchObject({ include_disabled: true });
			});
			expect(screen.getByText('规则乙')).toBeTruthy();

			// A-327②：账户首拉 page=1 & page_size=10（旧零参上行 ⇒ 必红）
			await waitFor(() => {
				const calls = captured.filter((c) => c.method === 'get' && c.url === ACCOUNTS_URL);
				expect(calls.length).toBeGreaterThanOrEqual(1);
				expect(calls[0].params).toMatchObject({ page: 1, page_size: 10 });
			});

			// A-327①：打开账户页签 → frozen_balance=30 / status=suspended 两列可见
			fireEvent.click(screen.getByRole('tab', { name: '积分账户' }));
			await screen.findByText('张小明');
			const row = document.querySelector('tr[data-row-key="u_w1f_01"]') as HTMLElement;
			expect(row.textContent).toContain('张小明');
			expect(row.textContent).toContain('30');
			expect(row.textContent).toContain('已暂停');
			expect(screen.getAllByText('冻结积分').length).toBeGreaterThanOrEqual(1);

			// 服务端 total=25 被消费（旧本地分页 total=10 → 只有 1 页）
			await waitFor(() => {
				expect(document.querySelector('.ant-pagination-item[title="3"]')).toBeTruthy();
			});

			// 翻页 → 第二次请求带 page=2（受控分页上行）
			const page2 = document.querySelector('.ant-pagination-item[title="2"]') as HTMLElement;
			expect(page2).toBeTruthy();
			fireEvent.click(page2);
			await waitFor(() => {
				const calls = captured.filter((c) => c.method === 'get' && c.url === ACCOUNTS_URL);
				expect(calls.length).toBeGreaterThanOrEqual(2);
				expect(calls[calls.length - 1].params).toMatchObject({ page: 2, page_size: 10 });
			});
		},
	);

	it(
		'AC-B5-W1f-13/14：A-327 交易表 page/page_size 上行 + A-328 金额按类型判色（spend 红 / earn 绿）',
		{ timeout: 20000 },
		async () => {
			renderPage();
			expect(await screen.findByText('规则甲')).toBeTruthy();

			fireEvent.click(screen.getByRole('tab', { name: '交易记录' }));
			const search = (await screen.findByPlaceholderText('输入用户ID查看交易记录')) as HTMLInputElement;
			fireEvent.change(search, { target: { value: 'u_w1f_01' } });
			// Input.Search：Enter 触发 onSearch（enterButton 的 DOM 类名随 antd 版本变动，改用键盘触发）
			fireEvent.keyDown(search, { key: 'Enter', code: 'Enter', keyCode: 13 });

			// A-327②：交易 wire page/page_size/user_id 上行（旧仅 user_id、零分页 ⇒ 必红）
			await waitFor(() => {
				const calls = captured.filter((c) => c.method === 'get' && c.url === TX_URL);
				expect(calls.length).toBeGreaterThanOrEqual(1);
				expect(calls[0].params).toMatchObject({ page: 1, page_size: 10, user_id: 'u_w1f_01' });
			});

			// A-328：earn=绿 / spend=红（旧按符号 ⇒ amount 恒正 ⇒ 消费亦绿）
			await waitFor(() => {
				const green = document.querySelector('td span.text-success-text');
				const red = document.querySelector('td span.text-danger-text');
				expect(green?.textContent).toBe('999');
				expect(red?.textContent).toBe('55');
			});

			// 服务端 total=42 → 5 页
			await waitFor(() => {
				expect(document.querySelector('.ant-pagination-item[title="5"]')).toBeTruthy();
			});
		},
	);

	it(
		'AC-B5-W1f-15：A-329 风险评分懒载（打开账户表 0 请求；点击后恰 1 请求）',
		{ timeout: 20000 },
		async () => {
			renderPage();
			expect(await screen.findByText('规则甲')).toBeTruthy();

			fireEvent.click(screen.getByRole('tab', { name: '积分账户' }));
			await screen.findByText('张小明');

			// 旧实现：单元格挂载即 10 请求（N+1）⇒ 此断言必红
			expect(captured.filter((c) => c.url.includes('/risk-score')).length).toBe(0);

			// 点击第一行「查看风险」→ 恰 1 请求
			const riskBtn = accountRowButtons('u_w1f_01').find((b) => b.textContent === '查看风险');
			expect(riskBtn).toBeTruthy();
			fireEvent.click(riskBtn as HTMLButtonElement);
			await waitFor(() => {
				expect(captured.filter((c) => c.url.includes('/risk-score')).length).toBe(1);
			});
			await waitFor(() => {
				const row = document.querySelector('tr[data-row-key="u_w1f_01"]') as HTMLElement;
				expect(row.textContent).toContain('低风险');
			});
		},
	);

	it(
		'AC-B5-W1f-17：A-331 转账页签与行转账弹窗双实例（弹窗开合后 Tab 输入存续）',
		{ timeout: 20000 },
		async () => {
			renderPage();
			expect(await screen.findByText('规则甲')).toBeTruthy();

			// 进转账页签填入
			fireEvent.click(screen.getByRole('tab', { name: '转账' }));
			const tabInput = (await screen.findByPlaceholderText('如 user-001')) as HTMLInputElement;
			fireEvent.change(tabInput, { target: { value: 'TEST-VALUE-123' } });
			expect(tabInput.value).toBe('TEST-VALUE-123');

			// 切回账户页签 → 点行内「转账」开弹窗（旧共用 transferForm ⇒ 此刻 Tab 值即被覆盖）
			fireEvent.click(screen.getByRole('tab', { name: '积分账户' }));
			await screen.findByText('张小明');
			const transferBtn = accountRowButtons('u_w1f_01').find((b) => b.textContent === '转账');
			expect(transferBtn).toBeTruthy();
			fireEvent.click(transferBtn as HTMLButtonElement);
			await waitFor(() => {
				expect(document.querySelector('.ant-modal-close')).toBeTruthy();
			});

			// 取消弹窗（旧实现 resetFields 穿透清空共享实例）
			fireEvent.click(document.querySelector('.ant-modal-close') as HTMLElement);

			// 独立实例 ⇒ Tab 值存续（旧实现必红）
			await waitFor(() => {
				expect(tabInput.value).toBe('TEST-VALUE-123');
			});
		},
	);

	it(
		'AC-B5-W1f-18：A-332 解冻/过期均有 Popconfirm（确认后进入对应操作弹窗）',
		{ timeout: 20000 },
		async () => {
			renderPage();
			expect(await screen.findByText('规则甲')).toBeTruthy();

			fireEvent.click(screen.getByRole('tab', { name: '积分账户' }));
			await screen.findByText('张小明');

			// 解冻：点击弹确认（旧直开弹窗 ⇒ 无 Popconfirm）
			const unfreezeBtn = accountRowButtons('u_w1f_01').find((b) => b.textContent === '解冻');
			expect(unfreezeBtn).toBeTruthy();
			fireEvent.click(unfreezeBtn as HTMLButtonElement);
			await waitFor(() => {
				const pc = document.querySelector('.ant-popconfirm');
				expect(pc?.textContent).toContain('确认解冻');
			});
			expect(document.querySelector('.ant-popconfirm')?.textContent).toContain(
				'解冻用户 张小明 的积分？',
			);
			fireEvent.click(
				document.querySelector('.ant-popconfirm .ant-popconfirm-buttons .ant-btn-primary') as HTMLElement,
			);
			await waitFor(() => {
				expect(document.querySelector('.ant-modal-title')?.textContent).toContain(
					'解冻积分 - 张小明',
				);
			});
			fireEvent.click(document.querySelector('.ant-modal-close') as HTMLElement);

			// 过期：点击弹确认
			const expireBtn = accountRowButtons('u_w1f_01').find((b) => b.textContent === '过期');
			expect(expireBtn).toBeTruthy();
			fireEvent.click(expireBtn as HTMLButtonElement);
			await waitFor(() => {
				const pcs = Array.from(document.querySelectorAll('.ant-popconfirm'));
				expect(pcs.some((el) => el.textContent?.includes('确认过期处理'))).toBe(true);
			});
			const expirePc = Array.from(document.querySelectorAll('.ant-popconfirm')).find((el) =>
				el.textContent?.includes('确认过期处理'),
			) as HTMLElement;
			fireEvent.click(expirePc.querySelector('.ant-popconfirm-buttons .ant-btn-primary') as HTMLElement);
			await waitFor(() => {
				expect(document.querySelector('.ant-modal-title')?.textContent).toContain(
					'过期处理 - 张小明',
				);
			});
		},
	);

	it('AC-B5-W1f-19：A-333 死键/死 hook 源码 grep 零命中', () => {
		// vitest 下 import.meta.url 非 file 协议；以 vitest root（= 应用根）相对定位
		const src = readFileSync(resolve(process.cwd(), 'src/hooks/use-points.ts'), 'utf-8');
		expect(src).not.toContain('exchangeTransferEnabled');
		expect(src).not.toContain('useUpdateAccountStatus');
	});
});
