'use client';

import { extractItem } from '@autional/shared';
import { queryKeys } from '@/lib/query-keys';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getDataClassification, updateDataClassification } from '@/lib/api.generated';

interface ClassificationData {
	[key: string]: string;
}

export function useDataClassification(tenantId: string) {
	return useQuery({
		queryKey: queryKeys.security.dataClassification(tenantId),
		queryFn: async () => {
			const res = await getDataClassification(tenantId);
			return extractItem<ClassificationData>(res) ?? ({} as ClassificationData);
		},
		enabled: !!tenantId,
	});
}

export function useUpdateDataClassification(tenantId: string) {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (data: any) => updateDataClassification(tenantId, data),
		onSuccess: () =>
			queryClient.invalidateQueries({ queryKey: queryKeys.security.dataClassification(tenantId) }),
	});
}
