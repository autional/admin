'use client';

import { extractItem } from '@autional/shared';
import { queryKeys } from '@/lib/query-keys';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getRetentionPolicy, saveRetentionPolicy } from '@/lib/api.generated';

import type * as Types from '@autional/shared/generated/types';

export type RetentionPolicy = Types.RetentionPolicyResponse;

export function useRetentionPolicy(params?: Record<string, unknown>) {
	return useQuery({
		queryKey: queryKeys.retentionPolicy,
		queryFn: async () => {
			const res = await getRetentionPolicy(params as Parameters<typeof getRetentionPolicy>[0]);
			return extractItem<RetentionPolicy>(res) ?? ({} as RetentionPolicy);
		},
	});
}

export function useSaveRetentionPolicy() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (data: Types.RetentionPolicyRequest) => saveRetentionPolicy(data),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: queryKeys.retentionPolicy });
		},
	});
}
