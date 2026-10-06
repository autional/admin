'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { extractList } from '@autional/shared';
import { queryKeys } from '@/lib/query-keys';
import {
	getApiKeys,
	createApiKey,
	getApiKey,
	deleteApiKey,
	rotateApiKey,
	updateApiKeyScopes,
	updateApiKeyStatus,
} from '@/lib/api.generated';

export interface ApiKeyRecord {
	id: string;
	name: string;
	keyPrefix: string;
	scopes: string[];
	status: string;
	environment?: string;
	expiresAt?: string;
	createdAt?: string;
	tenantId?: string;
	userId?: string;
}

export function useApiKeys(params?: Record<string, unknown>) {
	return useQuery({
		queryKey: queryKeys.apiKeys.all(params),
		queryFn: async () => {
			const res = await getApiKeys(params);
			return extractList<ApiKeyRecord>(res);
		},
	});
}

export function useApiKeyDetail(id: string) {
	return useQuery({
		queryKey: queryKeys.apiKeys.detail(id),
		queryFn: () => getApiKey(id),
		enabled: !!id,
	});
}

export function useCreateApiKey() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (data: Record<string, unknown>) => createApiKey(data),
		onSuccess: () => queryClient.invalidateQueries({ queryKey: ['api-keys'] }),
	});
}

export function useDeleteApiKey() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (id: string) => deleteApiKey(id),
		onSuccess: () => queryClient.invalidateQueries({ queryKey: ['api-keys'] }),
	});
}

export function useRotateApiKey() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (id: string) => rotateApiKey(id),
		onSuccess: () => queryClient.invalidateQueries({ queryKey: ['api-keys'] }),
	});
}

export function useUpdateApiKeyScopes() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: ({ id, scopes }: { id: string; scopes: string[] }) =>
			updateApiKeyScopes(id, scopes),
		onSuccess: () => queryClient.invalidateQueries({ queryKey: ['api-keys'] }),
	});
}

export function useUpdateApiKeyStatus() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: ({ id, status }: { id: string; status: string }) => updateApiKeyStatus(id, status),
		onSuccess: () => queryClient.invalidateQueries({ queryKey: ['api-keys'] }),
	});
}
