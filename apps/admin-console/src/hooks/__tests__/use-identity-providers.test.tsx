// W1a · A-36（AC-B5-W1a-09）：IdP「最后测试」时间戳本地存储回归锁。
//
// 背景：测试连接结果无后端字段（lastTestedAt 恒空——审计 A-36 的列真空态）。
// 新契约：测试成功后写入 localStorage 映射（id → ISO），列表查询时合并回 lastTestedAt；
// localStorage 缺失/损坏时静默降级（不崩）。

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

vi.mock('@/lib/api.generated', () => ({
	getIdentityProviders: vi.fn(),
	createIdentityProvider: vi.fn(),
	updateIdentityProvider: vi.fn(),
	deleteIdentityProvider: vi.fn(),
	testIdentityProvider: vi.fn(),
	getLdapHealth: vi.fn(),
	testLdapConnection: vi.fn(),
	getSamlProviders: vi.fn(),
}));

import {
	getIdentityProviders,
	getSamlProviders,
	testIdentityProvider,
} from '@/lib/api.generated';
import {
	useIdentityProviders,
	useTestIdentityProvider,
	readIdpLastTestedMap,
} from '../use-identity-providers';

const STORAGE_KEY = 'admin-console-idp-last-tested';

function createWrapper() {
	const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
	return function Wrapper({ children }: { children: ReactNode }) {
		return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
	};
}

describe('useIdentityProviders 最后测试时间合并（A-36 · AC-B5-W1a-09）', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		window.localStorage.clear();
	});

	afterEach(() => {
		window.localStorage.clear();
	});

	it('预置 localStorage 映射 → 列表查询合并 lastTestedAt（仅命中行覆盖）', async () => {
		const testedAt = '2026-10-01T08:00:00.000Z';
		window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ 'id-1': testedAt }));
		vi.mocked(getIdentityProviders).mockResolvedValue({
			items: [
				{ id: 'id-1', name: 'OAuth A', type: 'oauth', status: 'active' },
				{ id: 'id-2', name: 'OAuth B', type: 'oauth', status: 'active' },
			],
		} as never);
		vi.mocked(getSamlProviders).mockResolvedValue({ items: [] } as never);

		const { result } = renderHook(() => useIdentityProviders(), { wrapper: createWrapper() });
		await waitFor(() => expect(result.current.isSuccess).toBe(true));

		const rows = result.current.data ?? [];
		expect(rows.find((r) => r.id === 'id-1')?.lastTestedAt).toBe(testedAt);
		expect(rows.find((r) => r.id === 'id-2')?.lastTestedAt).toBeUndefined();
	});

	it('测试成功后写入 localStorage 映射（readIdpLastTestedMap 可读回）', async () => {
		vi.mocked(testIdentityProvider).mockResolvedValue({} as never);

		const { result } = renderHook(() => useTestIdentityProvider(), { wrapper: createWrapper() });
		await result.current.mutateAsync('id-9');

		await waitFor(() => expect(readIdpLastTestedMap()['id-9']).toBeTruthy());
		// 值须为可解析的 ISO 时间
		expect(Number.isNaN(Date.parse(readIdpLastTestedMap()['id-9']))).toBe(false);
	});

	it('localStorage 内容损坏 → 读取降级为空映射（不崩）', () => {
		window.localStorage.setItem(STORAGE_KEY, '{broken-json');
		expect(readIdpLastTestedMap()).toEqual({});
	});
});
