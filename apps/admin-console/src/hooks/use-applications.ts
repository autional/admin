'use client';

import { extractList } from '@autional/shared';
import { queryKeys } from '@/lib/query-keys';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
	getApplications,
	createApplication,
	updateApplication,
	deleteApplication,
	suspendApplication,
	activateApplication,
} from '@/lib/api.generated';

export interface AppRecord {
	id: string;
	code: string;
	name: string;
	type: 'oidc' | 'saml' | 'custom';
	clientId: string;
	status: string;
	redirectUris: string[];
	description?: string;
	createdAt?: string;
}

export function useApplications(tenantId: string) {
	return useQuery({
		queryKey: queryKeys.applications.all(tenantId),
		staleTime: 60000,
		queryFn: async () => {
			const res = await getApplications(tenantId);
			return extractList<AppRecord>(res);
		},
		enabled: !!tenantId,
	});
}

export function useCreateApplication() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: ({ tenantId, data }: { tenantId: string; data: Record<string, unknown> }) =>
			createApplication(tenantId, data),
		onSuccess: (_, vars) =>
			queryClient.invalidateQueries({ queryKey: queryKeys.applications.all(vars.tenantId) }),
	});
}

export function useUpdateApplication() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: ({
			tenantId,
			id,
			data,
		}: {
			tenantId: string;
			id: string;
			data: Record<string, unknown>;
		}) => updateApplication(tenantId, id, data),
		onSuccess: (_, vars) =>
			queryClient.invalidateQueries({ queryKey: queryKeys.applications.all(vars.tenantId) }),
	});
}

export function useSuspendApplication() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: ({
			tenantId,
			id,
			reason,
		}: {
			tenantId: string;
			id: string;
			reason?: string;
		}) => suspendApplication(tenantId, id, { reason }),
		onSuccess: (_, vars) =>
			queryClient.invalidateQueries({ queryKey: queryKeys.applications.all(vars.tenantId) }),
	});
}

export function useActivateApplication() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: ({ tenantId, id }: { tenantId: string; id: string }) =>
			activateApplication(tenantId, id),
		onSuccess: (_, vars) =>
			queryClient.invalidateQueries({ queryKey: queryKeys.applications.all(vars.tenantId) }),
	});
}

export function useDeleteApplication() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: ({ tenantId, id }: { tenantId: string; id: string }) =>
			deleteApplication(tenantId, id),
		onSuccess: (_, vars) =>
			queryClient.invalidateQueries({ queryKey: queryKeys.applications.all(vars.tenantId) }),
	});
}
