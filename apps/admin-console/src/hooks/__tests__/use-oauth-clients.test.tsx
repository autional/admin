import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

vi.mock('@/lib/api.generated', () => ({
	getOAuthClients: vi.fn(),
	getOAuthClient: vi.fn(),
	createOAuthClient: vi.fn(),
	updateOAuthClient: vi.fn(),
	deleteOAuthClient: vi.fn(),
	rotateOAuthClientSecret: vi.fn(),
	getOAuthClientSecrets: vi.fn(),
	createOAuthClientSecret: vi.fn(),
	deleteOAuthClientSecret: vi.fn(),
	deactivateOAuthClientSecret: vi.fn(),
	getOAuthClientStats: vi.fn(),
}));

import { getOAuthClientSecrets } from '@/lib/api.generated';
import { useOAuthClientSecrets } from '../use-oauth-clients';

const mockedSecrets = vi.mocked(getOAuthClientSecrets);

function createWrapper() {
	const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
	return function Wrapper({ children }: { children: ReactNode }) {
		return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
	};
}

// AC-B4-W2-01：hook 显式 `secrets ?? []`（命名包裹键；不得用 extractList）。
describe('useOAuthClientSecrets（A-44 崩溃回归锁）', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('wire `{secrets: []}` → data 为空数组（非对象；DataTable dataSource 恒为数组）', async () => {
		mockedSecrets.mockResolvedValue({ secrets: [] } as any);

		const { result } = renderHook(() => useOAuthClientSecrets('client-1'), {
			wrapper: createWrapper(),
		});

		await waitFor(() => expect(result.current.isSuccess).toBe(true));
		expect(Array.isArray(result.current.data)).toBe(true);
		expect(result.current.data).toEqual([]);
	});

	it('wire `{secrets: [...]}` → 多行渲染数据原样映射', async () => {
		mockedSecrets.mockResolvedValue({
			secrets: [
				{ id: 's1', secretId: 'sec-1', label: 'primary', status: 'active' },
				{ id: 's2', secretId: 'sec-2', label: 'secondary', status: 'inactive' },
			],
		} as any);

		const { result } = renderHook(() => useOAuthClientSecrets('client-1'), {
			wrapper: createWrapper(),
		});

		await waitFor(() => expect(result.current.isSuccess).toBe(true));
		expect(result.current.data).toHaveLength(2);
		expect(result.current.data?.[0]?.id).toBe('s1');
	});

	it('响应缺 secrets 键 → []（降级不崩）', async () => {
		mockedSecrets.mockResolvedValue({} as any);

		const { result } = renderHook(() => useOAuthClientSecrets('client-1'), {
			wrapper: createWrapper(),
		});

		await waitFor(() => expect(result.current.isSuccess).toBe(true));
		expect(result.current.data).toEqual([]);
	});
});
