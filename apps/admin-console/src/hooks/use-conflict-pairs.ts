'use client';

import { extractList } from '@autional/shared';
import { queryKeys } from '@/lib/query-keys';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getConflictPairs, createConflictPair, deleteConflictPair } from '@/lib/api.generated';

export interface ConflictPairRecord {
	id: string;
	role_id_a: string;
	role_id_b: string;
	description?: string;
	created_at?: string;
}

export function useConflictPairs() {
	return useQuery({
		queryKey: queryKeys.conflictPairs.all,
		staleTime: 30000,
		queryFn: async () => {
			const res = await getConflictPairs();
			return extractList<ConflictPairRecord>(res);
		},
	});
}

export function useCreateConflictPair() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (data: { roleIdA: string; roleIdB: string; description?: string }) =>
			createConflictPair(data),
		onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.conflictPairs.all }),
	});
}

export function useDeleteConflictPair() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (pairId: string) => deleteConflictPair(pairId),
		onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.conflictPairs.all }),
	});
}
