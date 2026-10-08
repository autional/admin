'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { extractList } from '@autional/shared';
import { queryKeys } from '@/lib/query-keys';
import {
	getOAuthClients,
	getOAuthClient,
	createOAuthClient,
	updateOAuthClient,
	deleteOAuthClient,
	rotateOAuthClientSecret,
	getOAuthClientSecrets,
	createOAuthClientSecret,
	deleteOAuthClientSecret,
	deactivateOAuthClientSecret,
	getOAuthClientStats,
} from '@/lib/api.generated';

export interface OAuthClientRecord {
	id: string;
	clientId: string;
	clientName: string;
	redirectUris: string[];
	grantTypes: string[];
	status: string;
	createdAt?: string;
}

export interface OAuthClientSecretRecord {
	id: string;
	secretId: string;
	label?: string;
	status: string;
	createdAt?: string;
}

export interface OAuthClientStats {
	clientId: string;
	activeTokens: number;
	activeRefreshTokens: number;
	lastRequestAt?: string;
}

export function useOAuthClients(params?: Record<string, unknown>) {
	return useQuery({
		queryKey: queryKeys.oauthClients.all(params),
		queryFn: async () => {
			const res = await getOAuthClients(params);
			return extractList<OAuthClientRecord>(res);
		},
	});
}

export function useOAuthClient(clientId: string) {
	return useQuery({
		queryKey: queryKeys.oauthClients.detail(clientId),
		queryFn: () => getOAuthClient(clientId),
		enabled: !!clientId,
	});
}

export function useCreateOAuthClient() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (data: Record<string, unknown>) => createOAuthClient(data),
		onSuccess: () => queryClient.invalidateQueries({ queryKey: ['oauth-clients'] }),
	});
}

export function useUpdateOAuthClient() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: ({ id, data }: { id: string; data: Record<string, unknown> }) =>
			updateOAuthClient(id, data),
		onSuccess: () => queryClient.invalidateQueries({ queryKey: ['oauth-clients'] }),
	});
}

export function useDeleteOAuthClient() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (id: string) => deleteOAuthClient(id),
		onSuccess: () => queryClient.invalidateQueries({ queryKey: ['oauth-clients'] }),
	});
}

export function useRotateOAuthClientSecret() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (clientId: string) => rotateOAuthClientSecret(clientId),
		onSuccess: () => queryClient.invalidateQueries({ queryKey: ['oauth-clients'] }),
	});
}

export function useOAuthClientSecrets(clientId: string) {
	return useQuery({
		queryKey: queryKeys.oauthClients.secrets(clientId),
		// RC-B4-02（A-44）：wire 形状是命名包裹键 `{ secrets: [...] }`（oauth admin 面），
		// extractList 只认 items/data 会误判（对象直落 DataTable → 崩溃）。此处显式映射 —— 禁用 extractList。
		queryFn: async (): Promise<OAuthClientSecretRecord[]> => {
			const res = (await getOAuthClientSecrets(clientId)) as
				| { secrets?: OAuthClientSecretRecord[] }
				| undefined;
			return res?.secrets ?? [];
		},
		enabled: !!clientId,
	});
}

export function useCreateOAuthClientSecret() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (clientId: string) => createOAuthClientSecret(clientId),
		onSuccess: (_data, clientId) =>
			queryClient.invalidateQueries({ queryKey: queryKeys.oauthClients.secrets(clientId) }),
	});
}

export function useDeleteOAuthClientSecret() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: ({ clientId, secretId }: { clientId: string; secretId: string }) =>
			deleteOAuthClientSecret(clientId, secretId),
		onSuccess: (_data, { clientId }) =>
			queryClient.invalidateQueries({ queryKey: queryKeys.oauthClients.secrets(clientId) }),
	});
}

export function useDeactivateOAuthClientSecret() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: ({ clientId, secretId }: { clientId: string; secretId: string }) =>
			deactivateOAuthClientSecret(clientId, secretId),
		onSuccess: (_data, { clientId }) =>
			queryClient.invalidateQueries({ queryKey: queryKeys.oauthClients.secrets(clientId) }),
	});
}

export function useOAuthClientStats(clientId: string) {
	return useQuery({
		queryKey: queryKeys.oauthClients.stats(clientId),
		queryFn: () => getOAuthClientStats(clientId),
		enabled: !!clientId,
	});
}
