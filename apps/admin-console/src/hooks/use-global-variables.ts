'use client';

import { extractList } from '@autional/shared';
import { queryKeys } from '@/lib/query-keys';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
	getGlobalVariables,
	createGlobalVariable,
	updateGlobalVariable,
	deleteGlobalVariable,
} from '@/lib/api.generated';

export function useGlobalVariables() {
	return useQuery({
		queryKey: queryKeys.notifications.globalVariables,
		staleTime: 60000,
		queryFn: async () => {
			const res = await getGlobalVariables();
			return extractList(res);
		},
	});
}

export function useCreateGlobalVariable() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: createGlobalVariable,
		onSuccess: () =>
			queryClient.invalidateQueries({ queryKey: queryKeys.notifications.globalVariables }),
	});
}

export function useUpdateGlobalVariable() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: ({ id, data }: { id: string; data: Record<string, unknown> }) =>
			updateGlobalVariable(id, data),
		onSuccess: () =>
			queryClient.invalidateQueries({ queryKey: queryKeys.notifications.globalVariables }),
	});
}

export function useDeleteGlobalVariable() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: deleteGlobalVariable,
		onSuccess: () =>
			queryClient.invalidateQueries({ queryKey: queryKeys.notifications.globalVariables }),
	});
}
