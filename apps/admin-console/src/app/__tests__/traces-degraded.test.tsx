// W1b（A-71）：链路追踪「假可供性」移除回归锁 ——
//   旧实现：搜索框 + 刷新按钮点击仅弹 toast「未配置」，零请求（假交互消耗用户动作）。
//   现实现：无搜索框/无按钮（零可供性控件），以 Empty 说明态表达「追踪端点未配置」。
//   恢复即红：任何输入框/按钮控件回归（哪怕接线了也要经 A-70 BFF 路由就绪后再评估）即失败。
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { apiClient } from '@autional/shared';
import TracesPage from '../traces/page';

let originalAdapter: unknown;
let adapterCalls = 0;

describe('traces 页降级说明态（A-71）', () => {
	beforeEach(() => {
		adapterCalls = 0;
		originalAdapter = apiClient.defaults.adapter;
		apiClient.defaults.adapter = (async (config: any) => {
			adapterCalls += 1;
			return { data: {}, status: 200, statusText: 'OK', headers: {}, config };
		}) as any;
	});

	afterEach(() => {
		apiClient.defaults.adapter = originalAdapter as any;
	});

	it('AC-B5-W1b-71：零假交互控件（无搜索框/无按钮）+ 说明态文案 + 零请求', async () => {
		render(<TracesPage />);

		// ① 页面标题仍在（导航语义不丢）
		expect(screen.getByText('分布式追踪')).toBeTruthy();

		// ② 假搜索框/刷新按钮不得存在（旧缺陷：点击仅弹「未配置」toast）
		expect(screen.queryAllByRole('textbox')).toHaveLength(0);
		expect(screen.queryAllByRole('button')).toHaveLength(0);

		// ③ 说明态文案 = traces.unavailable（追踪端点未配置）
		expect(screen.getByText('未为此门户配置追踪端点')).toBeTruthy();

		// ④ 页面不发任何请求（说明态不消耗网络）
		expect(adapterCalls).toBe(0);
	});
});
