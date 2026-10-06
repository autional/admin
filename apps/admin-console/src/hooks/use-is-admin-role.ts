'use client';

import { useCurrentRole } from '@autional/shared';

/**
 * 当前角色是否为管理面全权角色（admin / super_admin）。
 *
 * A-233/A-445（TASK-AB1-13）：写控件门与后端守卫同源的**精确相等**判定 ——
 * 禁止把角色串做子串包含判定（那会把 security_admin 误判为 true，
 * 这正是 A-445 类缺陷的口径）。security_admin / auditor / user_manager 均为 false。
 *
 * 前端角色仅用于 UX 呈现（隐藏/禁用写控件）；真正的授权由后端 rbac-backed 守卫强制。
 */
export function useIsAdminRole(): boolean {
	const role = useCurrentRole();
	return role === 'super_admin' || role === 'admin';
}
