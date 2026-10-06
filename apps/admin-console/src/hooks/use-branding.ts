'use client';

import { extractItem } from '@autional/shared';
import { queryKeys } from '@/lib/query-keys';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getTenantBranding, updateTenantBranding } from '@/lib/api.generated';

interface Branding {
	logoUrl?: string;
	faviconUrl?: string;
	primaryColor?: string;
	[key: string]: unknown;
}

export function useBranding(tenantId: string) {
	return useQuery({
		queryKey: queryKeys.branding.all(tenantId),
		staleTime: 60000,
		queryFn: async () => {
			const res = await getTenantBranding(tenantId);
			return extractItem<Branding>(res) ?? ({} as Branding);
		},
		enabled: !!tenantId,
	});
}

export function useUpdateBranding() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: ({ tenantId, data }: { tenantId: string; data: any }) =>
			updateTenantBranding(tenantId, data),
		onSuccess: (_, vars) =>
			queryClient.invalidateQueries({ queryKey: queryKeys.branding.all(vars.tenantId) }),
	});
}
