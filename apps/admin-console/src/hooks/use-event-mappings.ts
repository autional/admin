'use client';

import { extractList } from '@autional/shared';
import { queryKeys } from '@/lib/query-keys';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
	getEventMappings,
	createEventMapping,
	updateEventMapping,
	deleteEventMapping,
} from '@/lib/api.generated';

export function useEventMappings() {
	return useQuery({
		queryKey: queryKeys.notifications.eventMappings,
		staleTime: 60000,
		queryFn: async () => {
			const res = await getEventMappings();
			return extractList(res);
		},
	});
}

export function useCreateEventMapping() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: createEventMapping,
		onSuccess: () =>
			queryClient.invalidateQueries({ queryKey: queryKeys.notifications.eventMappings }),
	});
}

export function useUpdateEventMapping() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: ({ id, data }: { id: string; data: Record<string, unknown> }) =>
			updateEventMapping(id, data),
		onSuccess: () =>
			queryClient.invalidateQueries({ queryKey: queryKeys.notifications.eventMappings }),
	});
}

export function useDeleteEventMapping() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: deleteEventMapping,
		onSuccess: () =>
			queryClient.invalidateQueries({ queryKey: queryKeys.notifications.eventMappings }),
	});
}
