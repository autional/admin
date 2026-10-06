'use client';

import { extractList, extractItem } from '@autional/shared';
import { queryKeys } from '@/lib/query-keys';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
	getSIEMConnectors,
	createSIEMConnector,
	updateSIEMConnector,
	deleteSIEMConnector,
	testSIEMConnector,
} from '@/lib/api.generated';

import type * as Types from '@autional/shared/generated/types';

export type SIEMConnectorRecord = Types.SIEMConnectorResponse;

export function useSIEMConnectors(params?: Record<string, unknown>) {
	return useQuery({
		queryKey: queryKeys.siemConnectors.all(params),
		staleTime: 60000,
		queryFn: async () => {
			const res = await getSIEMConnectors(params);
			const items = Array.isArray(res) ? res : extractList<SIEMConnectorRecord>(res);
			return items;
		},
	});
}

export function useCreateSIEMConnector() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (data: Types.SIEMConnectorRequest) => createSIEMConnector(data),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ['siem-connectors'] });
		},
	});
}

export function useUpdateSIEMConnector() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: ({ id, data }: { id: string; data: Types.SIEMConnectorRequest }) =>
			updateSIEMConnector(id, data),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ['siem-connectors'] });
		},
	});
}

export function useDeleteSIEMConnector() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (id: string) => deleteSIEMConnector(id),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ['siem-connectors'] });
		},
	});
}

export function useTestSIEMConnector() {
	return useMutation({
		mutationFn: (id: string) => testSIEMConnector(id),
	});
}
