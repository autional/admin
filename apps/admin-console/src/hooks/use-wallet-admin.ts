'use client';

import { extractList, extractListResult, extractItem } from '@autional/shared';
import type { ListResult } from '@autional/shared';
import { retryUnlessNotFound } from '@/lib/nhi';
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
	deleteWalletPolicy,
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

// W1-04（A-376）：键对齐 CouponResponse——usage_limit/usage_count 为真源（旧 maxUses/usedCount 无落点恒空）；
// valid_until 为空串表示无到期（NULL）；min_amount 为 wire 键（表单提交侧用 min_spend）。
export interface CouponItem {
	id: string;
	code: string;
	name: string;
	value: string;
	type: string;
	status: string;
	minAmount: string;
	validFrom: string;
	validUntil: string;
	usageLimit: number;
	usageCount: number;
	createdAt: string;
}

// W1-02（A-365/A-367）：对齐 WithdrawalRequestResponse——真源为 withdrawal_requests；
// 旧 walletId/currency/bankAccount/note 字段服务端均无落点（A-367 数据源错位的镜像残留）。
export interface WithdrawalItem {
	id: string;
	userId: string;
	amount: string;
	status: string;
	remark: string;
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
		queryFn: async (): Promise<ListResult<WalletItem>> => {
			// A-362⑥：消费服务端 total（服务端真分页 page/page_size；旧实现只取 items
			// + 本地 10/页 ⇒ 第 21 条起不可达）。
			const res = await Generated.adminWallets(params);
			return extractListResult<WalletItem>(res);
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
	return useQuery({
		queryKey: queryKeys.walletAdmin.withdrawals(params),
		queryFn: async () => {
			// W1-02（A-365）：管理面真源 = GET /admin/wallets/withdrawals（withdrawal_requests），
			// 旧实现走租户交易端点 type=withdraw（列表/审批实体错位）。
			// A-369⑤：透出 pagination（旧 extractList 丢 total ⇒ 本地 10/页伪全量）。
			const res = await Generated.adminWalletsWithdrawals(
				params as { status?: string; page?: number; page_size?: number },
			);
			return extractListResult<WithdrawalItem>(res);
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
		// A-385④：404（尚未配置策略）零重试 —— 消「404 双请求 + console 噪声」（A-86/A-93 同法）。
		retry: retryUnlessNotFound,
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

/** A-385⑥：DELETE /policy 端点接线（此前零 UI 消费；删除后策略回退全局默认）。 */
export function useDeleteWalletPolicy() {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: ({ tenantId, appId }: { tenantId: string; appId: string }) =>
			deleteWalletPolicy(tenantId, appId),
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
