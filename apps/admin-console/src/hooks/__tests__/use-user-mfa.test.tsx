// 用户详情 · MFA 方式明细（P2）：hook 三态回归锁。
//   ① 200：按契约解析 methods（缺字段归一，contact 缺失 → 空串）；
//   ② 404（端点未上线）/③ 403（无权限）：静默降级为 null，不抛错 ⇒ 页面维持旧三行；
//   ④ 其它错误（如 500）：照常上抛，交给 error 语义处理（不在这里吞错）。
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Mock } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

// 只替掉网络入口（apiClient.get），其余 shared 导出保持真实（getHttpStatus / extractItem 等）。
vi.mock('@autional/shared', async (importOriginal) => {
	const actual = await importOriginal<typeof import('@autional/shared')>();
	return {
		...actual,
		apiClient: { get: vi.fn() },
	};
});

import { apiClient } from '@autional/shared';
import { useUserMfaMethods } from '../use-user-mfa';

const apiGet = apiClient.get as unknown as Mock;
const USER_ID = 'usr_01J000000000000000000MFA';
const ENDPOINT = `/mfa/api/v1/admin/mfa/methods/${USER_ID}`;

function httpError(status: number): Error {
	const err = new Error(`Request failed with status code ${status}`) as Error & {
		response: { status: number; data: unknown };
	};
	err.response = { status, data: { code: `${status}00000` } };
	return err;
}

function createWrapper() {
	const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
	return function Wrapper({ children }: { children: ReactNode }) {
		return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
	};
}

describe('useUserMfaMethods', () => {
	beforeEach(() => {
		apiGet.mockReset();
	});

	it('200：解析用户 MFA 方式（camel 契约键直读 + 缺字段归一）', async () => {
		apiGet.mockResolvedValueOnce({
			data: {
				userId: USER_ID,
				methods: [
					{
						type: 'totp',
						enabled: true,
						verified: true,
						disabled: false,
						contact: '',
						updatedAt: '2026-10-01T02:00:00Z',
					},
					{
						type: 'sms',
						enabled: true,
						verified: false,
						disabled: false,
						// contact 缺席 ⇒ 归一为空串（页面显示 '-'）
						updatedAt: '2026-10-02T02:00:00Z',
					},
				],
			},
		});

		const { result } = renderHook(() => useUserMfaMethods(USER_ID), { wrapper: createWrapper() });

		await waitFor(() => expect(result.current.isSuccess).toBe(true));
		expect(apiGet).toHaveBeenCalledWith(ENDPOINT, expect.objectContaining({ signal: expect.anything() }));
		expect(result.current.data).toEqual({
			userId: USER_ID,
			methods: [
				{
					type: 'totp',
					enabled: true,
					verified: true,
					disabled: false,
					contact: '',
					updatedAt: '2026-10-01T02:00:00Z',
				},
				{
					type: 'sms',
					enabled: true,
					verified: false,
					disabled: false,
					contact: '',
					updatedAt: '2026-10-02T02:00:00Z',
				},
			],
		});
		expect(result.current.isError).toBe(false);
	});

	it('404（端点未上线）：静默降级 → data 为 null，不报错', async () => {
		apiGet.mockRejectedValueOnce(httpError(404));

		const { result } = renderHook(() => useUserMfaMethods(USER_ID), { wrapper: createWrapper() });

		await waitFor(() => expect(result.current.isSuccess).toBe(true));
		expect(result.current.data).toBeNull();
		expect(result.current.isError).toBe(false);
	});

	it('403（无权限）：静默降级 → data 为 null，不报错', async () => {
		apiGet.mockRejectedValueOnce(httpError(403));

		const { result } = renderHook(() => useUserMfaMethods(USER_ID), { wrapper: createWrapper() });

		await waitFor(() => expect(result.current.isSuccess).toBe(true));
		expect(result.current.data).toBeNull();
		expect(result.current.isError).toBe(false);
	});

	it('500：不降级，错误上抛（error 态）', async () => {
		apiGet.mockRejectedValueOnce(httpError(500));

		const { result } = renderHook(() => useUserMfaMethods(USER_ID), { wrapper: createWrapper() });

		await waitFor(() => expect(result.current.isError).toBe(true));
		expect(result.current.data).toBeUndefined();
	});

	it('无 userId：不请求（enabled=false）', () => {
		const { result } = renderHook(() => useUserMfaMethods(undefined), { wrapper: createWrapper() });

		expect(result.current.fetchStatus).toBe('idle');
		expect(apiGet).not.toHaveBeenCalled();
	});
});
