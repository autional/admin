'use client';

import { apiClient, extractList, extractItem, useCurrentTenantId } from '@autional/shared';
import { queryKeys } from '@/lib/query-keys';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import * as Generated from '@autional/shared/generated/api';
import type { CreateWalletRequest, CreateCouponRequest } from '@autional/shared/generated/types';
import {
	updateWallet,
	deleteWallet,
	batchFreezeWallets,
	batchUnfreezeWallets,
	updateCoupon,
	deleteCoupon,
	getFraudRules,
	getWalletPolicy,
	updateWalletPolicy,
	adjustWallet,
} from '@/lib/api.generated';

export interface WalletItem {
	id: string;
	userId: string;
	userName?: string;
	tenantId: string;
	appId: string;
	balance: string;
	currency: string;
	status: string;
	frozenAmount?: string;
	createdAt: string;
}

export interface CouponItem {
	id: string;
	code: string;
	value: string;
	type: string;
	status: string;
	maxUses?: number;
	usedCount?: number;
	minAmount?: string;
	validFrom?: string;
	validUntil?: string;
	createdAt: string;
}

export interface WithdrawalItem {
	id: string;
	userId: string;
	walletId: string;
	amount: string;
	currency: string;
	status: string;
	bankAccount?: string;
	note?: string;
	createdAt: string;
}

export interface FraudRule {
	id: string;
	name: string;
	description?: string;
	enabled: boolean;
	conditions?: unknown;
	createdAt: string;
}

export interface WalletPolicy {
	appId: string;
	maxBalance: string;
	dailyWithdrawLimit: string;
	monthlyWithdrawLimit: string;
	minWithdrawAmount: string;
	transferEnabled: boolean;
	withdrawalRequireReview: boolean;
	autoApproveLimit: string;
	supportedCurrencies: string;
	timezone: string;
	rateLimitPerMin: number;
	rateLimitPerHour: number;
	idempotencyTTL: number;
	quoteCacheTTL: number;
	internalClientTimeout: number;
	defaultListPageSize: number;
	exportPageSize: number;
}

export function useWalletList(params?: Record<string, unknown>) {
	return useQuery({
		queryKey: queryKeys.walletAdmin.list(params),
		queryFn: async () => {
			const res = await Generated.adminWallets(params);
			return extractList<WalletItem>(res);
		},
	});
}

export function useCreateWallet() {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: (data: CreateWalletRequest) => Generated.adminWalletsPost(data),
		onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.walletAdmin.all }),
	});
}

export function useUpdateWallet() {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: ({ id, data }: { id: string; data: Record<string, unknown> }) =>
			updateWallet(id, data),
		onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.walletAdmin.all }),
	});
}

export function useDeleteWallet() {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: deleteWallet,
		onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.walletAdmin.all }),
	});
}

export function useBatchFreeze() {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: batchFreezeWallets,
		onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.walletAdmin.all }),
	});
}

export function useBatchUnfreeze() {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: batchUnfreezeWallets,
		onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.walletAdmin.all }),
	});
}

export function useCoupons() {
	return useQuery({
		queryKey: queryKeys.walletAdmin.coupons,
		queryFn: async () => {
			const res = await Generated.adminWalletsCoupons();
			return extractList<CouponItem>(res);
		},
	});
}

export function useCreateCoupon() {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: (data: CreateCouponRequest) => Generated.adminWalletsCouponsPost(data),
		onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.walletAdmin.coupons }),
	});
}

export function useUpdateCoupon() {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: ({ id, data }: { id: string; data: Record<string, unknown> }) =>
			updateCoupon(id, data) as Promise<unknown>,
		onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.walletAdmin.coupons }),
	});
}

export function useDeleteCoupon() {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: deleteCoupon,
		onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.walletAdmin.coupons }),
	});
}

export function useWithdrawals(params?: Record<string, unknown>) {
	const tenantId = useCurrentTenantId() ?? '';
	return useQuery({
		queryKey: queryKeys.walletAdmin.withdrawals(params),
		queryFn: async () => {
			const res = await Generated.adminWalletsTenantsTransactionsByTenants(tenantId, {
				...params,
				type: 'withdraw',
			} as any);
			return extractList<WithdrawalItem>(res);
		},
	});
}

export function useApproveWithdrawal() {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: ({ id, data }: { id: string; data: Record<string, unknown> }) =>
			Generated.adminWalletsWithdrawalsApproveByWithdrawalsPost(id, data),
		onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.walletAdmin.all }),
	});
}

export function useRejectWithdrawal() {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: ({ id, data }: { id: string; data: Record<string, unknown> }) =>
			Generated.adminWalletsWithdrawalsRejectByWithdrawalsPost(id, data),
		onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.walletAdmin.all }),
	});
}

export function useFraudRules() {
	return useQuery({
		queryKey: queryKeys.walletAdmin.fraudRules,
		queryFn: async () => {
			const res = await getFraudRules();
			return extractList<FraudRule>(res);
		},
	});
}

export function useWalletPolicy(tenantId: string, appId: string) {
	return useQuery({
		queryKey: queryKeys.walletAdmin.policy(tenantId, appId),
		queryFn: async () => {
			const res = await getWalletPolicy(tenantId, appId);
			return extractItem<WalletPolicy>(res);
		},
		enabled: !!tenantId && !!appId,
	});
}

export function useUpdateWalletPolicy() {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: ({
			tenantId,
			appId,
			data,
		}: {
			tenantId: string;
			appId: string;
			data: Record<string, unknown>;
		}) => updateWalletPolicy(tenantId, appId, data) as Promise<unknown>,
		onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.walletAdmin.all }),
	});
}

export function useAdjustWalletBalance() {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: ({ userId, data }: { userId: string; data: Record<string, unknown> }) =>
			adjustWallet(userId, data),
		onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.walletAdmin.all }),
	});
}
