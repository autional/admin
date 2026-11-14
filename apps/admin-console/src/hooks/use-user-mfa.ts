'use client';

import { useQuery } from '@tanstack/react-query';
import { apiClient, extractItem, getHttpStatus, useCurrentTenantId } from '@autional/shared';
import { queryKeys } from '@/lib/query-keys';

/** MFA 方式类型（与 admin 端点契约一致，固定三值）。 */
export type MfaMethodType = 'totp' | 'sms' | 'email';

/** 单条 MFA 方式（响应键已由 api/client.ts 拦截器 camel 化）。 */
export interface MfaMethod {
	type: MfaMethodType;
	enabled: boolean;
	verified: boolean;
	disabled: boolean;
	/** 已脱敏联系方式；totp 恒为空串。 */
	contact: string;
	updatedAt: string;
}

/** `GET /mfa/api/v1/admin/mfa/methods/{user_id}` 的 data 形状。 */
export interface UserMfaMethods {
	userId: string;
	methods: MfaMethod[];
}

function toMethod(raw: Record<string, unknown>): MfaMethod {
	return {
		type: String(raw.type ?? '') as MfaMethodType,
		enabled: raw.enabled === true,
		verified: raw.verified === true,
		disabled: raw.disabled === true,
		contact: typeof raw.contact === 'string' ? raw.contact : '',
		updatedAt: typeof raw.updatedAt === 'string' ? raw.updatedAt : '',
	};
}

function toMethods(raw: unknown): MfaMethod[] {
	return Array.isArray(raw)
		? raw.filter((m): m is Record<string, unknown> => !!m && typeof m === 'object').map(toMethod)
		: [];
}

/**
 * 降级判据：端点未上线（404）/ 无权限（403）→ 静默降级（返回 null，页面维持旧三行）；
 * 其余错误照常上抛，交由调用方 error 语义处理（不在这里吞错）。
 */
function isDegradable(err: unknown): boolean {
	const status = getHttpStatus(err);
	return status === 404 || status === 403;
}

/**
 * 用户已开通的 MFA 方式。
 * - `data === null` ⇒ 端点不可用（403/404），调用方不渲染新块（旧行为）；
 * - 其它失败 ⇒ React Query error 态（含重试语义，404/403 不会被重试）。
 */
export function useUserMfaMethods(userId?: string) {
	const tenantId = useCurrentTenantId() ?? '';
	return useQuery({
		queryKey: queryKeys.users.mfaMethods(tenantId, userId ?? ''),
		queryFn: async ({ signal }): Promise<UserMfaMethods | null> => {
			try {
				const res = await apiClient.get(`/mfa/api/v1/admin/mfa/methods/${userId}`, { signal });
				const payload = extractItem<Record<string, unknown>>(res);
				if (!payload) return null;
				return {
					userId: String(payload.userId ?? userId ?? ''),
					methods: toMethods(payload.methods),
				};
			} catch (err) {
				if (isDegradable(err)) return null;
				throw err;
			}
		},
		enabled: !!userId,
	});
}
