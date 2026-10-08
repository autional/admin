'use client';

import { useCallback } from 'react';
import { useCurrentTenantId } from '@autional/shared';
import { useMembers } from '@/hooks/use-members';

/**
 * W1b（A-78/A-84/A-89）：owner_principal_id → 成员显示名解析单点。
 *
 * owner_principal_id 值域（后端冻结，agent/device/robot domain 注释一致）：
 *   人类主体 = identity_auth_users.id（= 成员表 userId，可解析显示名）
 *   workload 主体 = identity_identities.id（成员表查不到 → 回退原值）
 *
 * 解析优先级：principalId 命中成员 → username/email；未命中 → principalId 原值；
 * principalId 缺失 → 旧字段 fallback（列表历史行 owner_id）；全空 → '-'。
 * 存量 owner_id 属伪造属主（后端 DEV-27/G-12 只置空不回填），仅在 principalId 缺失时兜底展示。
 */
export function useOwnerDisplay() {
	const tenantId = useCurrentTenantId() ?? '';
	const { data: members = [] } = useMembers(tenantId);

	const resolve = useCallback(
		(principalId?: string | null, fallback?: string | null): string => {
			if (principalId) {
				const member = members.find((m) => m.userId === principalId);
				if (member) return member.username || member.email || principalId;
				return principalId;
			}
			return fallback || '-';
		},
		[members],
	);

	return { resolve };
}
