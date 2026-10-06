'use client';

import { extractList, extractItem } from '@autional/shared';
import { queryKeys } from '@/lib/query-keys';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
	resolveDispute,
	adjustWallet,
	getWalletSummary,
	getWalletTransactions,
	getWalletDisputes,
} from '@/lib/api.generated';
import * as Generated from '@autional/shared/generated/api';
import type {
	UpdateCouponRequest,
	UpdateFraudRulesRequest,
	BatchFreezeRequest,
	BatchUnfreezeRequest,
	CreateCouponRequest,
} from '@autional/shared/generated/types';

export interface WalletSummary {
	balance?: number;
	frozenAmount?: number;
	totalBalance?: number;
	totalFrozenBalance?: number;
	totalIncome?: number;
	totalExpense?: number;
	totalEarned?: number;
	totalSpent?: number;
	[key: string]: unknown;
}

export interface Transaction {
	id: string;
	type: string;
	amount: number;
	balance: number;
	description?: string;
	createdAt: string;
	[key: string]: unknown;
}

export interface Dispute {
	id: string;
	transactionId: string;
	reason: string;
	status: string;
	amount: number;
	createdAt: string;
	[key: string]: unknown;
}

export interface Coupon {
	id: string;
	code: string;
	name?: string;
	discountType?: string;
	discountValue?: number;
	minOrderAmount?: number;
	validFrom?: string;
	validUntil?: string;
	usageLimit?: number;
	usedCount?: number;
	status?: string;
	[key: string]: unknown;
}

export interface FraudRule {
	id?: string;
	name: string;
	type: string;
	threshold?: number;
	action?: string;
	enabled?: boolean;
	[key: string]: unknown;
}

export interface ReconciliationRecord {
	id?: string;
	date: string;
	internalBalance: number;
	externalBalance: number;
	difference: number;
	status: string;
	transactions?: number;
	[key: string]: unknown;
}

async function fetchWalletSummary(
	tenantId: string,
	signal?: AbortSignal,
): Promise<WalletSummary | Record<string, never>> {
	try {
		const res = await getWalletSummary(tenantId);
		return extractItem<WalletSummary>(res) ?? ({} as WalletSummary);
	} catch {
		return {};
	}
}

async function fetchWalletTransactions(
	tenantId: string,
	params?: Record<string, unknown>,
	signal?: AbortSignal,
): Promise<Transaction[]> {
	try {
		const res = await getWalletTransactions(tenantId, params);
		return extractList<Transaction>(res);
	} catch {
		return [];
	}
}

async function fetchWalletDisputes(tenantId: string, signal?: AbortSignal): Promise<Dispute[]> {
	try {
		const res = await getWalletDisputes(tenantId);
		return extractList<Dispute>(res);
	} catch {
		return [];
	}
}

export function useWalletSummary(tenantId: string) {
	return useQuery({
		queryKey: queryKeys.wallets.summary(tenantId),
		queryFn: async ({ signal }) => {
			return fetchWalletSummary(tenantId, signal);
		},
		enabled: !!tenantId,
	});
}

export function useWalletTransactions(tenantId: string, params?: Record<string, unknown>) {
	return useQuery({
		queryKey: queryKeys.wallets.transactions(tenantId, params),
		queryFn: async ({ signal }) => {
			return fetchWalletTransactions(tenantId, params, signal);
		},
		enabled: !!tenantId,
	});
}

export function useWalletDisputes(tenantId: string) {
	return useQuery({
		queryKey: queryKeys.wallets.disputes(tenantId),
		queryFn: async ({ signal }) => {
			return fetchWalletDisputes(tenantId, signal);
		},
		enabled: !!tenantId,
	});
}

export function useResolveDispute() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: ({
			tenantId,
			id,
			data,
		}: {
			tenantId: string;
			id: string;
			data: Record<string, unknown>;
		}) => resolveDispute(tenantId, id, data),
		onSuccess: (_, vars) => {
			queryClient.invalidateQueries({ queryKey: queryKeys.wallets.disputes(vars.tenantId) });
		},
	});
}

export function useAdjustWallet() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: ({ userId, data }: { userId: string; data: Record<string, unknown> }) =>
			adjustWallet(userId, data),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: queryKeys.wallets.all() });
		},
	});
}

export function useCoupons() {
	return useQuery({
		queryKey: queryKeys.wallets.coupons,
		staleTime: 60000,
		queryFn: async ({ signal }) => {
			const res = await Generated.adminWalletsCoupons();
			return extractList<Coupon>(res);
		},
	});
}

export function useCreateCoupon() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (data: CreateCouponRequest) => Generated.adminWalletsCouponsPost(data),
		onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.wallets.coupons }),
	});
}

export function useUpdateCoupon() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: ({ id, data }: { id: string; data: Record<string, unknown> }) =>
			Generated.adminWalletsCouponsByCouponsPut(id, data as unknown as UpdateCouponRequest),
		onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.wallets.coupons }),
	});
}

export function useDeleteCoupon() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (id: string) => Generated.adminWalletsCouponsByCouponsDelete(id),
		onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.wallets.coupons }),
	});
}

export function useFraudRules() {
	return useQuery({
		queryKey: queryKeys.wallets.fraudRules,
		staleTime: 60000,
		queryFn: async ({ signal }) => {
			const res = await Generated.adminWalletsFraudRules();
			return extractList<FraudRule>(res);
		},
	});
}

export function useUpdateFraudRules() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (data: Record<string, unknown>) =>
			Generated.adminWalletsFraudRulesPost(data as unknown as UpdateFraudRulesRequest),
		onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.wallets.fraudRules }),
	});
}

export function useReconciliation(params?: { date?: string }) {
	return useQuery({
		queryKey: queryKeys.wallets.reconciliation(params),
		staleTime: 30000,
		queryFn: async ({ signal }) => {
			const res = await Generated.adminWalletsReconciliation(params);
			return extractList<ReconciliationRecord>(res);
		},
		enabled: !!params?.date,
	});
}

export function useBatchFreeze() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (data: Record<string, unknown>) =>
			Generated.adminWalletsBatchFreezePost(data as unknown as BatchFreezeRequest),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: queryKeys.wallets.all() });
		},
	});
}

export function useBatchUnfreeze() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (data: Record<string, unknown>) =>
			Generated.adminWalletsBatchUnfreezePost(data as unknown as BatchUnfreezeRequest),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: queryKeys.wallets.all() });
		},
	});
}
