import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Mock } from 'vitest';

// 只替掉网络入口：/auth/me 默认挂起（消费后的补全属静默分支，用例不依赖其完成）
vi.mock('@autional/shared', async (importOriginal) => {
	const actual = await importOriginal<typeof import('@autional/shared')>();
	return {
		...actual,
		apiClient: { get: vi.fn(() => new Promise(() => {})) },
	};
});

import { useAuthStore, apiClient } from '@autional/shared';
import {
	consumeImpersonationHash,
	decodeImpersonationInfo,
	isImpersonationToken,
} from '../impersonation-handoff';

const NOW_S = Math.floor(Date.now() / 1000);
const apiGetMock = apiClient.get as unknown as Mock;

function makeToken(payload: Record<string, unknown>): string {
	// 真实 JWT 段是 base64url 无填充（hash 字符集 [A-Za-z0-9._-]），btoa 的 '=' 填充须去掉
	return `h.${btoa(JSON.stringify(payload)).replace(/=+$/, '')}.s`;
}

function impersonationPayload(overrides: Record<string, unknown> = {}): Record<string, unknown> {
	return {
		user_id: 'user-42',
		tenant_id: 'tenant-1',
		type: 'access',
		iat: NOW_S,
		exp: NOW_S + 3600,
		custom: {
			is_imp: true,
			impersonated_by: 'admin-7',
			imp_id: 'imp-001',
			imp_reason: 'support ticket',
			admin_name: 'Admin Seven',
			principal_type: 'human',
			entry_plane: 'api',
		},
		...overrides,
	};
}

const VALID_TOKEN = makeToken(impersonationPayload());

function setHash(hash: string, path = '/acme'): void {
	window.history.replaceState(null, '', `${path}${hash}`);
}

beforeEach(() => {
	vi.clearAllMocks();
	localStorage.clear();
	useAuthStore.getState().clearAuth();
	window.history.replaceState(null, '', '/');
});

describe('consumeImpersonationHash', () => {
	it('有效 hash → 落 store（accessToken/isAuthenticated/user.id）、清 hash、返回 true 且幂等', () => {
		setHash(`#impersonate=${VALID_TOKEN}`);

		expect(consumeImpersonationHash()).toBe(true);

		const state = useAuthStore.getState();
		expect(state.accessToken).toBe(VALID_TOKEN);
		expect(state.refreshToken).toBeNull();
		expect(state.isAuthenticated).toBe(true);
		expect(state.user?.id).toBe('user-42');
		// hash 已清（防重放）,path/search 保留
		expect(window.location.hash).toBe('');
		expect(window.location.pathname).toBe('/acme');
		// 幂等：再次调用 false
		expect(consumeImpersonationHash()).toBe(false);
	});

	it('无 hash → 返回 false、零副作用', () => {
		useAuthStore.setState({ user: null, accessToken: null, isAuthenticated: false });

		expect(consumeImpersonationHash()).toBe(false);
		expect(useAuthStore.getState().accessToken).toBeNull();
		expect(useAuthStore.getState().isAuthenticated).toBe(false);
		expect(useAuthStore.getState().user).toBeNull();
	});

	it('exp 已过期 → 不落 store、返回 false、hash 已清', () => {
		const expired = makeToken(impersonationPayload({ exp: NOW_S - 10 }));
		setHash(`#impersonate=${expired}`);

		expect(consumeImpersonationHash()).toBe(false);
		expect(useAuthStore.getState().accessToken).toBeNull();
		expect(useAuthStore.getState().isAuthenticated).toBe(false);
		expect(window.location.hash).toBe('');
	});

	it('is_imp 非真/缺 custom/user_id → 不落 store、返回 false、hash 已清', () => {
		const notImp = makeToken(impersonationPayload({ custom: { principal_type: 'human' } }));
		setHash(`#impersonate=${notImp}`);
		expect(consumeImpersonationHash()).toBe(false);
		expect(useAuthStore.getState().accessToken).toBeNull();
		expect(window.location.hash).toBe('');

		const noUserId = makeToken(impersonationPayload({ user_id: undefined }));
		setHash(`#impersonate=${noUserId}`);
		expect(consumeImpersonationHash()).toBe(false);
		expect(useAuthStore.getState().accessToken).toBeNull();
		expect(window.location.hash).toBe('');
	});

	it('落 store 后异步用显式 Bearer 调 /auth/me 补全 user（成功分支）', async () => {
		apiGetMock.mockImplementationOnce(() =>
			Promise.resolve({
				data: { id: 'user-42', username: 'alice', email: 'alice@example.com', status: 'active' },
			}),
		);
		setHash(`#impersonate=${VALID_TOKEN}`);

		expect(consumeImpersonationHash()).toBe(true);
		await vi.waitFor(() => {
			expect(useAuthStore.getState().user?.email).toBe('alice@example.com');
		});
		expect(apiGetMock).toHaveBeenCalledWith(
			'/identity/api/v1/auth/me',
			expect.objectContaining({ headers: { Authorization: `Bearer ${VALID_TOKEN}` } }),
		);
	});
});

describe('isImpersonationToken', () => {
	it('模拟 token 为真；正常/畸形 token 为假', () => {
		expect(isImpersonationToken(VALID_TOKEN)).toBe(true);
		expect(isImpersonationToken(makeToken({ user_id: 'admin-7', exp: NOW_S + 60 }))).toBe(false);
		expect(isImpersonationToken('not-a-jwt')).toBe(false);
		expect(isImpersonationToken(null)).toBe(false);
		expect(isImpersonationToken(undefined)).toBe(false);
	});
});

describe('decodeImpersonationInfo', () => {
	it('解析展示字段（目标/发起人/原因/到期）', () => {
		expect(decodeImpersonationInfo(VALID_TOKEN)).toEqual({
			targetUserId: 'user-42',
			adminId: 'admin-7',
			adminName: 'Admin Seven',
			impId: 'imp-001',
			reason: 'support ticket',
			expiresAtMs: (NOW_S + 3600) * 1000,
		});
		expect(decodeImpersonationInfo(makeToken({ user_id: 'admin-7' }))).toBeNull();
	});
});
