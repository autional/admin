// TASK-AB1-22（fix-admin-b1-guard-contract / A-423）：billing alerts channels 形状契约回归锁。
//
//   AC-AB1-40：列表以 wire 逗号串渲染多 Tag；创建/编辑请求体 notification_channels 为逗号串（string）。
//
// 断言口径 = **最终 wire 请求/响应**：捕获器装在 shared apiClient 的 axios adapter（请求拦截器之后
// 最末环），跑真实链路 page → generated api → 拦截器（camel→snake / snake→camel）→ adapter；
// adapter 回写 wire 形状（snake）响应，与线上链路同构。
// wire 契约（实读）：service-billing `internal/handler/dto/dto.go:900-908/:918/:961` ——
// notification_channels 读出/入参均为逗号分隔串（服务端按 ',' split 校验）。

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { apiClient } from '@autional/shared';
import BillingAlertsPage from '../page';

vi.mock('@/lib/antd-app', () => ({ message: { success: vi.fn(), error: vi.fn() } }));

const ALERTS_URL = '/billing/api/v1/admin/billing/alerts';
const ALERT_ID = 'ua_01J8ZQ4T5X6Y7Z8A9B0C1D2E3F';

interface CapturedCall {
	method: string;
	url: string;
	body?: Record<string, unknown>;
}

const captured: CapturedCall[] = [];
let originalAdapter: unknown;

/** wire 形状（snake）：UsageAlertResponse 契约（notification_channels 为逗号串）。 */
const RAW_ALERTS = [
	{
		id: ALERT_ID,
		tenant_id: 'tnt_demo001',
		name: 'API 调用量告警',
		resource_type: 'api_calls',
		threshold_percent: 80,
		notification_channels: 'email,sms',
		status: 'active',
		last_triggered_at: '2026-09-30T00:00:00Z',
		created_at: '2026-09-01T00:00:00Z',
		updated_at: '2026-09-02T00:00:00Z',
	},
];

const dataEnvelope = (data: unknown) => ({
	code: 0,
	message: 'success',
	data,
	timestamp: '2026-10-04T00:00:00Z',
});

const listEnvelope = (items: unknown[]) => ({
	code: 0,
	message: 'success',
	items,
	total: items.length,
	pagination: { total: items.length, page: 1, page_size: 20, total_pages: 1, has_next: false },
	timestamp: '2026-10-04T00:00:00Z',
});

function installCaptureAdapter() {
	originalAdapter = apiClient.defaults.adapter;
	apiClient.defaults.adapter = (async (config: any) => {
		let body: Record<string, unknown> | undefined;
		if (typeof config.data === 'string' && config.data.length > 0) {
			body = JSON.parse(config.data);
		} else if (config.data && typeof config.data === 'object') {
			body = config.data as Record<string, unknown>;
		}
		const method = String(config.method || 'get').toLowerCase();
		const url = String(config.url || '');
		captured.push({ method, url, body });

		let data: unknown;
		if (url.includes(ALERTS_URL) && method === 'get') {
			data = listEnvelope(RAW_ALERTS);
		} else if (url.includes(ALERTS_URL) && method === 'post') {
			data = dataEnvelope(RAW_ALERTS[0]);
		} else if (url.includes(ALERTS_URL) && method === 'put') {
			data = dataEnvelope(RAW_ALERTS[0]);
		} else {
			data = dataEnvelope({});
		}
		return { data, status: 200, statusText: 'OK', headers: {}, config };
	}) as any;
}

function renderPage(ui: React.ReactElement) {
	const queryClient = new QueryClient({
		defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
	});
	return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
}

/** Modal 确定按钮（测试未挂 ConfigProvider，antd 默认 en locale = OK；兼容 zh 文本）。 */
function clickModalOk() {
	const ok = screen.getByRole('button', { name: /^(OK|确\s*定|确定)$/ });
	fireEvent.click(ok);
}

/** 在 antd v6 Select 中按唯一 option 文案选择（触发区 = .ant-select-content）。 */
async function selectOption(selectDomId: string, optionTitle: string) {
	const input = document.querySelector(`#${selectDomId}`) as HTMLInputElement;
	fireEvent.mouseDown(input.closest('.ant-select-content')!);
	const option = await waitFor(() => {
		const el = document.querySelector(`.ant-select-item-option[title="${optionTitle}"]`);
		expect(el).toBeTruthy();
		return el as HTMLElement;
	});
	fireEvent.click(option);
}

describe('billing alerts channels 形状契约（A-423）', () => {
	beforeEach(() => {
		captured.length = 0;
		installCaptureAdapter();
	});

	afterEach(() => {
		apiClient.defaults.adapter = originalAdapter as any;
	});

	it('AC-AB1-40：wire 逗号串渲染多 Tag（不显示原始 CSV 文本）', { timeout: 20000 }, async () => {
		renderPage(<BillingAlertsPage />);

		expect(await screen.findByText('API 调用量告警')).toBeTruthy();
		const row = screen.getByText('API 调用量告警').closest('tr')!;
		expect(within(row).getByText('邮件')).toBeTruthy();
		expect(within(row).getByText('短信')).toBeTruthy();
		expect(screen.queryByText('email,sms')).toBeNull();
	});

	it('AC-AB1-40：创建请求体 notification_channels 为逗号串（多选 string[] → wire string）', { timeout: 20000 }, async () => {
		renderPage(<BillingAlertsPage />);
		expect(await screen.findByText('API 调用量告警')).toBeTruthy();

		fireEvent.click(screen.getByText('创建预警'));

		const nameInput = await waitFor(() => {
			const el = document.querySelector('#name') as HTMLInputElement;
			expect(el).toBeTruthy();
			return el;
		});
		fireEvent.change(nameInput, { target: { value: '存储用量告警' } });

		await selectOption('resourceType', '存储');
		fireEvent.change(document.querySelector('#thresholdPercent') as HTMLInputElement, {
			target: { value: '75' },
		});

		// 渠道多选：应用内 + Webhook（文案全局唯一，避免与指标选项撞名）
		await selectOption('notificationChannels', '应用内');
		await selectOption('notificationChannels', 'Webhook');

		clickModalOk();
		await waitFor(() => expect(captured.some((c) => c.method === 'post')).toBe(true));

		const post = captured.find((c) => c.method === 'post')!;
		expect(post.url).toContain(ALERTS_URL);
		expect(post.body!.name).toBe('存储用量告警');
		expect(post.body!.resource_type).toBe('storage');
		expect(post.body!.threshold_percent).toBe(75);
		// 旧缺陷：表单 string[] 直传 → wire 收到 JSON 数组，Go string 字段 unmarshal 失败 → 400
		expect(typeof post.body!.notification_channels).toBe('string');
		expect((post.body!.notification_channels as string).split(',').sort()).toEqual([
			'in_app',
			'webhook',
		]);
	});

	it('AC-AB1-40：编辑回显拆多 Tag + 编辑请求体 notification_channels 为逗号串', { timeout: 20000 }, async () => {
		renderPage(<BillingAlertsPage />);
		expect(await screen.findByText('API 调用量告警')).toBeTruthy();

		fireEvent.click(screen.getByText('编辑'));

		// 旧缺陷（A-426①）：CSV 串直填多选 → 选择器单 tag「email,sms」；
		// 修复后：读取边界拆分为数组 → 「邮件」「短信」两个 tag，且表单值随之为 string[]。
		// 用全局计数判别（表格行内另有各 1 个 Tag；回显后每 label ≥2；旧缺陷恒 1）。
		await waitFor(() => expect(screen.getAllByText('邮件').length).toBeGreaterThanOrEqual(2));
		expect(screen.getAllByText('短信').length).toBeGreaterThanOrEqual(2);
		expect(screen.queryByText('email,sms')).toBeNull();

		// 编辑态追加一个渠道（Webhook）→ 提交值 = 回显数组 + 新增项
		await selectOption('notificationChannels', 'Webhook');

		clickModalOk();
		await waitFor(() => expect(captured.some((c) => c.method === 'put')).toBe(true));

		const put = captured.find((c) => c.method === 'put')!;
		expect(put.url).toContain(`${ALERTS_URL}/${ALERT_ID}`);
		expect(typeof put.body!.notification_channels).toBe('string');
		expect((put.body!.notification_channels as string).split(',').sort()).toEqual([
			'email',
			'sms',
			'webhook',
		]);
	});
});
