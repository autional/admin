'use client';

import { useCallback } from 'react';
import { useCurrentTenantId } from '@autional/shared';
import { useQuery } from '@tanstack/react-query';
import { getFeatureGates } from '@/lib/api.generated';

import { queryKeys } from '@/lib/query-keys';
import type { FeatureGateResponse } from '@autional/shared/generated/types';

/**
 * Phase 0b: FeatureGate — feature gates enabled per tenant subscription plan.
 * Dual-gated with RBAC permissions: sidebar sections are visible only when
 * (hasPermission AND featureGateEnabled).
 *
 * Usage: const featureGates = useFeatureGates();
 *        featureGates.has('nhi') → whether NHI management is enabled
 */
export function useFeatureGates(): Set<string> {
	const tenantId = useCurrentTenantId() ?? '';
	const { data } = useQuery({
		queryKey: queryKeys.featureGates(tenantId),
		queryFn: () => getFeatureGates(),
		enabled: !!tenantId,
		staleTime: 5 * 60 * 1000, // 5 min cache
	});

	const typed = data as FeatureGateResponse | undefined;
	if (!typed?.featureGates) {
		return new Set<string>();
	}

	const enabled = new Set<string>();
	for (const gate of typed.featureGates) {
		if (gate.enabled) {
			enabled.add(gate.key ?? '');
		}
	}
	return enabled;
}

/**
 * Non-React Hook version — reads FeatureGates from cached query.
 * Phase 0b: for components that do not support TanStack Query.
 */
export function useStaticFeatureGates(): Set<string> {
	const tenantId = useCurrentTenantId() ?? '';
	const { data } = useQuery({
		queryKey: queryKeys.featureGates(tenantId),
		queryFn: () => getFeatureGates(),
		enabled: !!tenantId,
	});
	const typed = data as FeatureGateResponse | undefined;
	if (!typed?.featureGates) return new Set();
	const gates = new Set<string>();
	for (const g of typed.featureGates) if (g.enabled) gates.add(g.key ?? '');
	return gates;
}
