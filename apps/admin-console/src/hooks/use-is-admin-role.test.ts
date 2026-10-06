// TASK-AB1-13（fix-admin-b1-guard-contract / ADR-AB1-01 · A-233 前端面）：
// useIsAdminRole 精确角色判定单测。
//
// AC-AB1-23：admin / super_admin ⇒ true；security_admin / auditor / user_manager ⇒ false。
// 关键判例 = security_admin（含 "admin" 子串）必须 false —— 子串匹配即 A-445 类缺陷。

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { renderHook, act, cleanup } from '@testing-library/react';
import { useAuthStore } from '@autional/shared';
import { useIsAdminRole } from './use-is-admin-role';

function setRole(role: string | null): void {
	useAuthStore.setState({
		tenants: role === null ? [] : [{ id: 'tenant-a', name: 'Tenant A', role }],
		currentTenantId: role === null ? null : 'tenant-a',
	});
}

/** 重置 store + localStorage，避免跨用例污染 */
function resetAuthStore(): void {
	useAuthStore.setState({
		user: null,
		accessToken: null,
		refreshToken: null,
		tenants: [],
		currentTenantId: null,
		permissions: [],
		isAuthenticated: false,
	});
	window.localStorage.clear();
}

describe('useIsAdminRole（AC-AB1-23：精确角色判定）', () => {
	beforeEach(() => {
		resetAuthStore();
	});

	afterEach(() => {
		cleanup();
		resetAuthStore();
	});

	it('admin ⇒ true', () => {
		const { result } = renderHook(() => useIsAdminRole());
		act(() => setRole('admin'));
		expect(result.current).toBe(true);
	});

	it('super_admin ⇒ true', () => {
		const { result } = renderHook(() => useIsAdminRole());
		act(() => setRole('super_admin'));
		expect(result.current).toBe(true);
	});

	it('security_admin ⇒ false（含 "admin" 子串，但非全权角色——A-445 关键判例）', () => {
		const { result } = renderHook(() => useIsAdminRole());
		act(() => setRole('security_admin'));
		expect(result.current).toBe(false);
	});

	it('auditor ⇒ false', () => {
		const { result } = renderHook(() => useIsAdminRole());
		act(() => setRole('auditor'));
		expect(result.current).toBe(false);
	});

	it('user_manager ⇒ false', () => {
		const { result } = renderHook(() => useIsAdminRole());
		act(() => setRole('user_manager'));
		expect(result.current).toBe(false);
	});

	it('role = null（未登录/未选租户）⇒ false', () => {
		const { result } = renderHook(() => useIsAdminRole());
		expect(result.current).toBe(false);
		act(() => setRole(null));
		expect(result.current).toBe(false);
	});

	it('响应式：角色切换即重渲染（member ⇒ admin 翻转）', () => {
		const { result } = renderHook(() => useIsAdminRole());
		act(() => setRole('member'));
		expect(result.current).toBe(false);
		act(() => setRole('admin'));
		expect(result.current).toBe(true);
	});
});
