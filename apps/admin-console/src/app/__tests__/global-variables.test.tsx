// TASK-AB1-27（fix-admin-b1-guard-contract / RC-5 契约收敛，清单外补收敛）：global-variables 范围列契约回归锁。
//
//   ① 行 wire = service-core 扁平 ListResponse（snake items）经拦截器深 camel：
//      `app_id` → `appId`，范围列须显示 `App: <appId>`；
//      旧缺陷 = dataIndex 'app_id' 读（已 camel 化的）行对象恒 undefined ⇒ 应用级变量被误展示为「全局」标签；
//   ② 全局行（app_id 空串）保持「全局」标签（语义不回退）。
//
// 断言口径 = 最终渲染文本（adapter 注入真实 wire 信封，同 platform-portals 先例文件头约定）。
// 注：axios 自定义 adapter 不走 settle —— 本文件只走成功路径，无需错误注入。

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { apiClient } from '@autional/shared';
import GlobalVariablesPage from '../notifications/global-variables/page';

const LIST_URL = '/notification/api/v1/admin/notifications/global-variables';

let originalAdapter: unknown;

/** wire 形状（snake）原始行 = GlobalVariableResponse 契约（service-notification dto.go:873-879）。 */
const RAW_VARS = [
	{
		id: 'gv-app-1',
		tenant_id: 'tenant-1',
		app_id: 'app-1',
		key: 'app_name',
		value: 'Demo App',
	},
	{
		id: 'gv-global-1',
		tenant_id: 'tenant-1',
		app_id: '',
		key: 'support_email',
		value: 'support@autional.net',
	},
];

/** service-core 扁平 ListResponse：拦截器只保留 items/total/pagination 并深 camel 化。 */
function listEnvelope(items: unknown[]) {
	return {
		code: 0,
		message: 'ok',
		items,
		total: items.length,
		pagination: { total: items.length, page: 1, page_size: 20, total_pages: 1, has_next: false },
		timestamp: '2026-10-04T00:00:00Z',
	};
}

function installListAdapter() {
	originalAdapter = apiClient.defaults.adapter;
	apiClient.defaults.adapter = (async (config: any) => {
		return { data: listEnvelope(RAW_VARS), status: 200, statusText: 'OK', headers: {}, config };
	}) as any;
}

function renderPage() {
	const queryClient = new QueryClient({
		defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
	});
	return render(
		<QueryClientProvider client={queryClient}>
			<GlobalVariablesPage />
		</QueryClientProvider>,
	);
}

describe('global-variables 范围列契约收敛（RC-5 / TASK-AB1-27 补）', () => {
	beforeEach(() => {
		window.localStorage.clear();
	});

	afterEach(() => {
		cleanup();
		if (originalAdapter !== undefined) apiClient.defaults.adapter = originalAdapter as any;
	});

	it('应用级行显示 App: <appId>；全局行显示「全局」（旧缺陷 = dataIndex app_id 恒 undefined ⇒ 全误示「全局」）', async () => {
		installListAdapter();
		renderPage();

		// ① 等待查询落地：以行值文本为锚（注意页面顶部的「预设键名」Tag 也含 app_name/support_email，
		//    不能作为表格已渲染信号，否则同步断言会在数据未落表前抢先执行）。
		expect(await screen.findByText('Demo App')).toBeTruthy();
		expect(screen.getByText('support@autional.net')).toBeTruthy();

		// ② 应用级行：范围列直读 camel `appId`（旧代码读 'app_id' ⇒ 此处恒失败）
		expect(screen.getByText('App: app-1')).toBeTruthy();

		// ③ 全局行（appId 空串）保持「全局」标签，且恰 1 处（旧代码两行均误示「全局」⇒ 2 处）
		expect(screen.getAllByText('全局')).toHaveLength(1);
	});
});
