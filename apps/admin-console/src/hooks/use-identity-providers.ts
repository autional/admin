'use client';

import { extractList, toPageParams } from '@autional/shared';
import type { LdapHealthResponse, SamlProviderItem } from '@autional/shared/generated/types';
import { queryKeys } from '@/lib/query-keys';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
	getIdentityProviders,
	createIdentityProvider,
	updateIdentityProvider,
	deleteIdentityProvider,
	testIdentityProvider,
	getLdapHealth,
	testLdapConnection,
	getSamlProviders,
} from '@/lib/api.generated';

export interface IdPRecord {
	id: string;
	name: string;
	type: 'oauth' | 'saml' | 'ldap';
	status: 'active' | 'inactive';
	lastTestedAt?: string;
	config?: Record<string, any>;
}

/**
 * 将 SAML IdP 记录映射为统一 IdPRecord（admin /identity-providers 页聚合展示）。
 * 来源: saml-service (authms_saml.saml_providers)，由 seed 015 写入。
 * 见 AGENTS.md「IdP 后端读表统一」: identity.providers (OAuth) 与 saml_providers (SAML) 分库存储，
 * 前端聚合两个来源展示。
 */
function toIdPRecordFromSaml(item: SamlProviderItem): IdPRecord {
	return {
		id: item.id ?? '',
		name: item.name ?? '',
		type: 'saml' as const,
		status: item.enabled ? 'active' : 'inactive',
		config: {
			entityId: item.entityId,
			ssoUrl: item.ssoUrl,
			sloUrl: item.sloUrl,
			nameIdFormat: item.nameIdFormat,
			wantAuthnSigned: item.wantAuthnSigned,
			allowIdpInitiated: item.allowIdpInitiated,
			defaultRedirectUri: item.defaultRedirectUri,
			forceAuthn: item.forceAuthn,
		},
	};
}

/**
 * A-36：IdP「最后测试」时间戳本地存储 —— 测试结果无后端字段，
 * 测试连接成功后记录于 localStorage，列表读取时合并回 lastTestedAt。
 */
const IDP_LAST_TESTED_STORAGE_KEY = 'admin-console-idp-last-tested';

/** 读取 IdP 最近测试时间映射（id → ISO 时间）。 */
export function readIdpLastTestedMap(): Record<string, string> {
	if (typeof window === 'undefined') return {};
	try {
		const raw = window.localStorage.getItem(IDP_LAST_TESTED_STORAGE_KEY);
		return raw ? (JSON.parse(raw) as Record<string, string>) : {};
	} catch {
		return {};
	}
}

function writeIdpLastTested(id: string, at: string) {
	if (typeof window === 'undefined') return;
	try {
		const map = readIdpLastTestedMap();
		map[id] = at;
		window.localStorage.setItem(IDP_LAST_TESTED_STORAGE_KEY, JSON.stringify(map));
	} catch {
		// localStorage 不可用时静默（非关键路径，不阻断测试结果提示）
	}
}

export function useIdentityProviders() {
	return useQuery({
		queryKey: queryKeys.identityProviders.all,
		staleTime: 300000,
		queryFn: async () => {
			// 聚合两个来源: identity-service (OAuth providers) + saml-service (SAML IdP)
			const [identityRes, samlRes] = await Promise.allSettled([
				getIdentityProviders(),
				// TASK-AB1-27（RC-5 契约收敛）：分页参数经 toPageParams 单点转 wire snake（禁手写字面量）。
				getSamlProviders({ ...toPageParams({ page: 1, pageSize: 100 }) }),
			]);
			const identityItems =
				identityRes.status === 'fulfilled' ? extractList<IdPRecord>(identityRes.value) : [];
			const samlItems =
				samlRes.status === 'fulfilled'
					? extractList<SamlProviderItem>(samlRes.value).map(toIdPRecordFromSaml)
					: [];
			// A-36：合并本地「最后测试」时间（有记录的行覆盖 lastTestedAt）。
			const lastTestedMap = readIdpLastTestedMap();
			return [...identityItems, ...samlItems].map((item) =>
				lastTestedMap[item.id] ? { ...item, lastTestedAt: lastTestedMap[item.id] } : item,
			);
		},
	});
}

export function useCreateIdentityProvider() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: createIdentityProvider,
		onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.identityProviders.all }),
	});
}

export function useUpdateIdentityProvider() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: ({ id, data }: { id: string; data: Record<string, unknown> }) =>
			updateIdentityProvider(id, data),
		onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.identityProviders.all }),
	});
}

export function useDeleteIdentityProvider() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: deleteIdentityProvider,
		onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.identityProviders.all }),
	});
}

export function useTestIdentityProvider() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (id: string) => testIdentityProvider(id),
		// A-36：测试成功后记录本地时间戳并刷新列表 → 「最后测试」列即时可见。
		onSuccess: (_data, id) => {
			writeIdpLastTested(id, new Date().toISOString());
			queryClient.invalidateQueries({ queryKey: queryKeys.identityProviders.all });
		},
	});
}

// --- LDAP-specific hooks ---

/**
 * Fetch LDAP directory health statuses.
 * Returns an array of LdapHealthResponse objects.
 */
export function useLdapHealth() {
	return useQuery({
		queryKey: queryKeys.ldap.health,
		staleTime: 30000,
		// A-37：未配置 LDAP 时后端返回 503（ErrCodeLDAPNotConfigured），重试无意义。
		retry: false,
		queryFn: async () => {
			const res = await getLdapHealth();
			return extractList<LdapHealthResponse>(res);
		},
	});
}

/**
 * Test connection to a registered LDAP directory by name.
 */
export function useTestLdapConnection() {
	return useMutation({
		mutationFn: (data: { directoryName: string }) => testLdapConnection(data),
	});
}
