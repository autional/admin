'use client';

import { extractItem, useCurrentTenantId } from '@autional/shared';
import { queryKeys } from '@/lib/query-keys';


import { useQuery } from '@tanstack/react-query';
import { getPasswordStatus } from '@/lib/api.generated';

export interface PasswordStatus {
	passwordAgeDays: number;
	mustChange: boolean;
	expiryDaysRemaining: number;
	lastChangedAt: string;
	historyEntriesCount: number;
}

export function usePasswordStatus(userId: string) {
	const tenantId = useCurrentTenantId() ?? '';
	return useQuery({
		queryKey: queryKeys.users.passwordStatus(tenantId, userId),
		queryFn: async () => {
			const res = await getPasswordStatus(userId);
			return extractItem<PasswordStatus>(res) ?? ({} as PasswordStatus);
		},
		enabled: !!userId,
	});
}
