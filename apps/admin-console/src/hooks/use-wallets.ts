'use client';

import { extractList, extractListResult, extractItem } from '@autional/shared';
import type { ListResult } from '@autional/shared';
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

// W1-03（A-372）：对齐 DisputeListItem——服务端争议无 amount 字段（旧声明 amount:number
// 导致 toFixed 崩溃）；真实字段 = id/transaction_id/user_id/reason/status/created_at。
export interface Dispute {
	id: string;
	transactionId: string;
	userId: string;
	reason: string;
	status: string;
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

// W0-01（AC-B3-W0-01-1）：写路径失败呈现——禁止 catch → {} / [] 静默吞错。
// 请求失败必须冒泡给 react-query（error 态 → 消费页 PageError + retry 重试），
// 否则 401/403/网络错误会被伪装成"空数据"，管理员无从感知失败。
async function fetchWalletSummary(
	tenantId: string,
	signal?: AbortSignal,
): Promise<WalletSummary | Record<string, never>> {
	const res = await getWalletSummary(tenantId);
	return extractItem<WalletSummary>(res) ?? ({} as WalletSummary);
}

async function fetchWalletTransactions(
	tenantId: string,
	params?: Record<string, unknown>,
	signal?: AbortSignal,
): Promise<ListResult<Transaction>> {
	// A-315②：消费服务端分页元数据（旧实现 extractList 只取 items + 页面零参上行
	// ⇒ 服务端默认 20/页 vs 本地 10/页截断）。
	const res = await getWalletTransactions(tenantId, params);
	return extractListResult<Transaction>(res);
}

// A-374④/A-375①：争议列表补 status/page/page_size 上行 + 透出服务端分页
// （旧零参 ⇒ 服务端默认 20/页 vs 本地 10/页截断；错误态上抛由 W0-01 已定，此处不吞错）。
async function fetchWalletDisputes(
	tenantId: string,
	params?: Record<string, unknown>,
	signal?: AbortSignal,
): Promise<ListResult<Dispute>> {
	const res = await getWalletDisputes(
		tenantId,
		params as { status?: string; page?: number; page_size?: number } | undefined,
	);
	return extractListResult<Dispute>(res);
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

export function useWalletDisputes(tenantId: string, params?: Record<string, unknown>) {
	return useQuery({
		// A-375①：status/分页入 queryKey（筛选触发新请求）
		queryKey: queryKeys.wallets.disputes(tenantId, params),
		queryFn: async ({ signal }) => {
			return fetchWalletDisputes(tenantId, params, signal);
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
