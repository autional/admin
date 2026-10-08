'use client';

import { extractItem } from '@autional/shared';
import { queryKeys } from '@/lib/query-keys';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getDataClassification, updateDataClassification } from '@/lib/api.generated';

/** 单个分级条目（A-124：description/color 为契约字段，读写双向接通）。
 *  wire 锚：service-tenant/internal/handler/dto/dto.go:924-961
 *  （classifications:[{level,label,description,color}] + updated_at）。 */
export interface ClassificationEntry {
	level: string;
	label: string;
	description?: string;
	color?: string;
}

export interface ClassificationData {
	tenantId?: string;
	classifications: ClassificationEntry[];
	updatedAt?: string;
}

export function useDataClassification(tenantId: string) {
	return useQuery({
		queryKey: queryKeys.security.dataClassification(tenantId),
		queryFn: async () => {
			const res = await getDataClassification(tenantId);
			const data = extractItem<ClassificationData>(res);
			return data ?? ({ classifications: [] } as ClassificationData);
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
