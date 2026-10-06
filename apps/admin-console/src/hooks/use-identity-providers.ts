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
		lastTestedAt: undefined,
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
			return [...identityItems, ...samlItems];
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
	return useMutation({
		mutationFn: (id: string) => testIdentityProvider(id),
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
