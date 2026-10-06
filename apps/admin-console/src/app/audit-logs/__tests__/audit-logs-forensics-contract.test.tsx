// TASK-AB2-18（fix-admin-b2-security-forensics / A-194+A-195 · AC-B2-029/030）：审计取证链 wire 契约回归锁。
//
// A-194（ADR-B2-10）：检索参数 start_time/end_time 必须为 epoch 秒 int64（10 位）。
//   旧缺陷：DateRangeFilter 产出的格式化串（format='YYYY-MM-DD HH:mm:ss'）直发 → 后端
//   AuditLogListRequest form int64 解析失败（service-audit dto.go:99-100 契约）。
// A-195：hashchain 请求路径必须带会话 tenantId（旧：硬编码 'default' 404/无数据）；弹窗渲染 aggregate
//   （isValid/logCount/verifiedAt/startHash/endHash/chainId —— service-audit dto.go:181-190），
//   不依赖 entries 明细（后端 HashChainResponse 无此字段）。
//
// 反假绿：
//   ① wire 断言穿真实 apiClient 拦截器（camel 书面写 → snake 上 wire）+ 捕获 adapter，且断言
//      「值非字符串、非 13 位毫秒、与 dayjs 秒换算逐位相等」；
//   ② 负控：无区间时首个请求不得带 start_time/end_time 键（防恒发空值假绿）；
//   ③ hashchain 负控：路径全等断言（旧值 .../hashchain/default 必炸）；
//   ④ aggregate 渲染用「仅 aggregate、无 entries」信封（旧实现 ?.entries || [] 恒空态 → 必红）；
//   ⑤ 区间选择经真实 antd RangePicker 交互（鼠标开面板 + 键入 + 确定提交），非 mock 组件。

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router';
import dayjs from 'dayjs';
import { apiClient, useAuthStore } from '@autional/shared';
import AuditLogsPage from '../page';

// antd v6 命令式 API 由 AntdAppProvider 的 StaticsBridge 赋值（export let），测试不经 Provider 时为
// undefined——错误路径下 handleApiError 会炸在 message.error 上而吞掉后续 state 更新（生产由路由
// 层 Provider 保证）。按仓内既有模式桩化（role-activations 同款），使错误分支可被真实驱动。
vi.mock('@/lib/antd-app', () => ({
	message: { success: vi.fn(), error: vi.fn() },
	modal: { confirm: vi.fn() },
}));

const TENANT = 'tenant-b2x';
const LOGS_URL = '/audit/api/v1/admin/audit/logs';
const HASHCHAIN_URL = `/audit/api/v1/admin/audit/hashchain/${TENANT}`;
const START_TYPED = '2026-10-04 01:00:00';
const END_TYPED = '2026-10-04 03:00:00';

// wire 形状（snake）aggregate：service-audit dto.go:181-190 HashChainResponse 全键；无 entries 字段。
const AGG = {
	tenant_id: TENANT,
	chain_id: 'chain-b2-01',
	start_hash: 'aaaa1111bbbb2222',
	end_hash: 'cccc3333dddd4444',
	log_count: 1842,
	is_valid: true,
	verified_at: 1759536000000, // 毫秒（dto 语义）
};

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
		} else if (url.includes(LOGS_URL)) {
			payload = {
				code: 0,
				message: 'success',
				items: [],
				total: 0,
				timestamp: '2026-10-04T00:00:00Z',
			};
		} else {
			payload = { code: 0, message: 'success', items: [], total: 0, timestamp: '2026-10-04T00:00:00Z' };
		}
		return { data: payload, status: 200, statusText: 'OK', headers: {}, config };
	}) as any;
}

function logsRequestsWithRange() {
	return captured.filter((c) => c.url === LOGS_URL && c.params && 'start_time' in c.params);
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

/** 真实 antd v6 RangePicker 驱动：mouseDown 开面板 → 键入起止 → 确定提交（探针实证配方）。 */
async function pickDateTimeRange(startStr: string, endStr: string) {
	const startInput = screen.getByPlaceholderText('开始时间') as HTMLInputElement;
	const pickerRoot = startInput.closest('.ant-picker') as HTMLElement;
	fireEvent.mouseDown(pickerRoot);
	fireEvent.mouseDown(startInput);
	fireEvent.focus(startInput);
	fireEvent.click(startInput);
	await waitFor(() => expect(document.querySelector('.ant-picker-dropdown')).toBeTruthy());

	fireEvent.change(startInput, { target: { value: startStr } });
	fireEvent.keyDown(startInput, { key: 'Enter', code: 'Enter', keyCode: 13 });

	const endInput = screen.getByPlaceholderText('结束时间') as HTMLInputElement;
	fireEvent.mouseDown(endInput);
	fireEvent.focus(endInput);
	fireEvent.change(endInput, { target: { value: endStr } });
	fireEvent.keyDown(endInput, { key: 'Enter', code: 'Enter', keyCode: 13 });

	const ok = document.querySelector('.ant-picker-ok button');
	expect(ok).toBeTruthy();
	fireEvent.click(ok as Element);
}

/** 展开「验证」折叠卡 → 点击哈希链「查看」→ 等待 hashchain 请求上 wire。 */
async function openHashChainModal() {
	fireEvent.click(screen.getByText('验证'));
	const view = await screen.findByText('查看');
	fireEvent.click(view);
	await waitFor(() =>
		expect(captured.some((c) => c.url.includes('/audit/api/v1/admin/audit/hashchain/'))).toBe(true),
	);
}

describe('审计日志取证链契约（A-194 / A-195 · AC-B2-029/030）', () => {
	beforeEach(() => {
		installCaptureAdapter();
		useAuthStore.setState({ currentTenantId: TENANT });
	});

	afterEach(() => {
		apiClient.defaults.adapter = originalAdapter as any;
		useAuthStore.setState({ currentTenantId: null });
		window.localStorage.clear();
	});

	it('A-194：无区间不带时间键；区间上 wire 为 10 位 epoch 秒整数（非字符串/非 13 位毫秒）', async () => {
		renderPage();

		// 首屏检索：无区间 → 负控（旧实现同样满足；防修复后恒发空键的假绿）
		await waitFor(() => expect(captured.some((c) => c.url === LOGS_URL)).toBe(true));
		const first = captured.find((c) => c.url === LOGS_URL) as Captured;
		expect(first.params).not.toHaveProperty('start_time');
		expect(first.params).not.toHaveProperty('end_time');

		await pickDateTimeRange(START_TYPED, END_TYPED);
		await waitFor(() => expect(logsRequestsWithRange().length).toBeGreaterThan(0));

		const ranged = logsRequestsWithRange().at(-1) as Captured;
		const st = ranged.params.start_time;
		const et = ranged.params.end_time;

		// 判别核心：旧实现为格式化串（'2026-10-04 01:00:00'）→ string 断言必炸
		expect(typeof st).toBe('number');
		expect(typeof et).toBe('number');
		expect(String(st)).toMatch(/^\d{10}$/); // 秒（10 位），非 13 位毫秒
		expect(String(et)).toMatch(/^\d{10}$/);
		// 换算逐位相等（ADR-B2-10：dayjs(x).unix()；精确时刻不取 endOf('day')）
		expect(st).toBe(dayjs(START_TYPED).unix());
		expect(et).toBe(dayjs(END_TYPED).unix());
	});

	it('A-195：hashchain 请求路径带会话租户（全等断言，非 default）', async () => {
		renderPage();
		await openHashChainModal();

		const hc = captured.find((c) => c.url.includes('/audit/api/v1/admin/audit/hashchain/')) as Captured;
		expect(hc.url).toBe(HASHCHAIN_URL);
	});

	it('A-195：弹窗渲染 aggregate 字段（仅 aggregate 信封、无 entries 依赖）', async () => {
		renderPage();
		await openHashChainModal();

		// A-196 起弹窗与「租户链状态」卡共用同一取数（同页同值），断言作用域限定在弹窗内。
		const modal = await screen.findByRole('dialog');
		const scope = within(modal);

		// aggregate 各键上屏（旧实现取 ?.entries || [] → 恒空态 → 全炸）
		expect(await scope.findByText('1842')).toBeInTheDocument(); // logCount
		expect(await scope.findByText('有效')).toBeInTheDocument(); // isValid=true 徽标
		expect(scope.getByText('aaaa1111bbbb2222')).toBeInTheDocument(); // startHash
		expect(scope.getByText('cccc3333dddd4444')).toBeInTheDocument(); // endHash
		expect(scope.getByText('chain-b2-01')).toBeInTheDocument(); // chainId
		expect(scope.getByText(new Date(AGG.verified_at).toLocaleString('zh-CN'))).toBeInTheDocument(); // verifiedAt
	});

	it('W2 通则①：hashchain 失败 → 弹窗错误态（失败 ≠「暂无数据」空态）', async () => {
		failHashChain = true;
		renderPage();
		await openHashChainModal();

		// 错误态可见（PageError 内联 + toast 至少一处）
		const errs = await screen.findAllByText('获取哈希链失败');
		expect(errs.length).toBeGreaterThan(0);
		// 空态不冒充错误：新旧两个空态文案（错误被伪装成「暂无」的旧表现）均不得出现
		expect(screen.queryByText('暂无哈希链数据')).toBeNull();
		expect(screen.queryByText('暂无哈希链条目')).toBeNull();
	});
});
