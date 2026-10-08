import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { QueryStateFallback } from '../QueryStateFallback';

// AC-B4-W0-02-2：三分支渲染断言（forbidden / error 可重试 / error 不可重试）。
describe('QueryStateFallback（RC-B4-01 / AC-B4-W0-02）', () => {
	it('forbidden：403 → 无权限文案，且无重试按钮（403 重试必败）', () => {
		render(
			<QueryStateFallback
				error={{ response: { status: 403 } }}
				forbiddenMessage="无权限查看角色"
				onRetry={vi.fn()}
			/>,
		);
		expect(screen.getByText('无权限查看角色')).toBeTruthy();
		expect(screen.queryByRole('button')).toBeNull();
	});

	it('error（可重试）：500 → 失败文案 + 重试按钮接通回调', () => {
		const onRetry = vi.fn();
		render(
			<QueryStateFallback
				error={{ response: { status: 500 } }}
				errorMessage="加载角色列表失败"
				onRetry={onRetry}
			/>,
		);
		expect(screen.getByText('加载角色列表失败')).toBeTruthy();
		fireEvent.click(screen.getByRole('button'));
		expect(onRetry).toHaveBeenCalledTimes(1);
	});

	it('error（不可重试）：400 → 失败文案但无重试按钮', () => {
		render(
			<QueryStateFallback
				error={{ response: { status: 400 } }}
				errorMessage="请求参数错误"
				onRetry={vi.fn()}
			/>,
		);
		expect(screen.getByText('请求参数错误')).toBeTruthy();
		expect(screen.queryByRole('button')).toBeNull();
	});

	it('无 status（网络错误）→ 默认可重试', () => {
		render(<QueryStateFallback error={new Error('Network Error')} onRetry={vi.fn()} />);
		expect(screen.getByRole('button')).toBeTruthy();
	});

	it('loading/empty/ready → 返回 null（空态留给 DataTable/Empty 原位）', () => {
		const { container: c1 } = render(<QueryStateFallback isLoading />);
		expect(c1.innerHTML).toBe('');
		const { container: c2 } = render(<QueryStateFallback data={[]} />);
		expect(c2.innerHTML).toBe('');
		const { container: c3 } = render(<QueryStateFallback data={[1]} />);
		expect(c3.innerHTML).toBe('');
	});

	it('默认文案走 i18n（未传 message props）', () => {
		render(<QueryStateFallback error={{ response: { status: 403 } }} />);
		expect(screen.getByText('无权限访问')).toBeTruthy();
	});
});
