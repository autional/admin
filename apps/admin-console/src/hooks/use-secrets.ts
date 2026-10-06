'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { extractList, useCurrentTenantId } from '@autional/shared';
import type * as GeneratedTypes from '@autional/shared/generated/types';
import { queryKeys } from '@/lib/query-keys';

import {
	getSecrets,
	getSecretDetail,
	getSecretVersions,
	getSecretVersionValue,
	updateSecret,
	rotateSecret,
	revokeSecret,
	batchRevokeSecrets,
	batchDeleteSecrets,
	getEncryptionKeys,
	createSecret,
	deleteSecret,
} from '@/lib/api.generated';

export type SecretRecord = GeneratedTypes.SecretResponse;

export function useSecrets(params?: {
	prefix?: string;
	status?: string;
	page?: number;
	page_size?: number;
}) {
	const tenantId = useCurrentTenantId() ?? '';

	return useQuery({
		queryKey: queryKeys.secrets.list(tenantId, params),
		staleTime: 300000,
		queryFn: async () => {
			const res = await getSecrets(params as Record<string, unknown>);
			return extractList<SecretRecord>(res);
		},
	});
}

export function useSecretDetail(key: string) {
	const tenantId = useCurrentTenantId() ?? '';
	return useQuery({
		queryKey: queryKeys.secrets.detail(tenantId, key),
		queryFn: async () => {
			const res = await getSecretDetail({ key });
			return res as GeneratedTypes.SecretDetailResponse;
		},
		enabled: !!key,
	});
}

export function useSecretVersions(key: string) {
	const tenantId = useCurrentTenantId() ?? '';
	return useQuery({
		queryKey: queryKeys.secrets.versions(tenantId, key),
		queryFn: async () => {
			const res = await getSecretVersions({ key });
			return res as GeneratedTypes.SecretVersionResponse[];
		},
		enabled: !!key,
	});
}

export function useSecretVersionValue() {
	return useMutation({
		mutationFn: async ({ key, version }: { key: string; version: number }) => {
			const res = await getSecretVersionValue({ version }, { key });
			return res as GeneratedTypes.SecretValueResponse;
		},
	});
}

export function useCreateSecret() {
	const tenantId = useCurrentTenantId() ?? '';
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: async (data: { key: string; value: string; description?: string }) => {
			return createSecret(data);
		},
		onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.secrets.all(tenantId) }),
	});
}

export function useUpdateSecret() {
	const tenantId = useCurrentTenantId() ?? '';
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: async ({ key, data }: { key: string; data: { description?: string } }) => {
			return updateSecret(data, { key });
		},
		onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.secrets.all(tenantId) }),
	});
}

export function useDeleteSecret() {
	const tenantId = useCurrentTenantId() ?? '';
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: async (key: string) => {
			await deleteSecret(key);
		},
		onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.secrets.all(tenantId) }),
	});
}

export function useRotateSecret() {
	const tenantId = useCurrentTenantId() ?? '';
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: async ({ key, data }: { key: string; data: { value: string } }) => {
			return rotateSecret(data, { key });
		},
		onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.secrets.all(tenantId) }),
	});
}

export function useRevokeSecret() {
	const tenantId = useCurrentTenantId() ?? '';
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: async (key: string) => {
			await revokeSecret({ key });
		},
		onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.secrets.all(tenantId) }),
	});
}

export function useBatchRevoke() {
	const tenantId = useCurrentTenantId() ?? '';
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: async (keys: string[]) => {
			const res = await batchRevokeSecrets(keys);
			return res as { succeeded: string[]; errors: { key: string; error: string }[] };
		},
		onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.secrets.all(tenantId) }),
	});
}

export function useBatchDelete() {
	const tenantId = useCurrentTenantId() ?? '';
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: async (keys: string[]) => {
			const res = await batchDeleteSecrets(keys);
			return res as { succeeded: string[]; errors: { key: string; error: string }[] };
		},
		onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.secrets.all(tenantId) }),
	});
}

export function useEncryptionKeys() {
	const tenantId = useCurrentTenantId() ?? '';
	return useQuery({
		queryKey: queryKeys.secrets.encryptionKeys(tenantId),
		queryFn: async () => {
			const res = await getEncryptionKeys();
			const current = res?.keys?.[0]?.keyId ?? res?.current ?? '';
			const available = (res?.keys ?? []).map((k: { keyId?: string }) => k.keyId);
			return { current, available };
		},
	});
}
