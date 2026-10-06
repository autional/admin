'use client';

import { queryKeys } from '@/lib/query-keys';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
	getBillingSubscription,
	changeBillingPlan,
	getBillingUsage,
	getBillingStatistics,
	getBillingRecords,
} from '@/lib/api.generated';
import { extractItem, extractList } from '@autional/shared';
import * as Generated from '@autional/shared/generated/api';
import type {
	CreatePlanRequest,
	UpdatePlanRequest,
	CreatePaymentGatewayRequest,
	UpdatePaymentGatewayRequest,
	ExecuteRefundRequest,
	DunningSettingsRequest,
} from '@autional/shared/generated/types';

export interface BillingSubscription {
	plan: string;
	planId?: string;
	status: string;
	startDate: string;
	currentPeriodStart?: string;
	currentPeriodEnd: string;
	amount?: number;
	currency?: string;
	billingCycle?: string;
	autoRenew?: boolean;
	cancelAtPeriodEnd?: boolean;
	seats?: number;
	price?: number;
}

export interface BillingUsage {
	total: number;
	quota: number;
	remaining: number;
	smsSent?: number;
	smsQuota?: number;
	emailSent?: number;
	emailQuota?: number;
	apiRequests?: number;
	userCount?: number;
	maxUsers?: number;
	usage: Array<{
		date: string;
		amount: number;
	}>;
}

export interface BillingStatistics {
	totalRevenue?: number;
	activeSubscriptions?: number;
	mrr?: number;
	churnRate?: number;
}

export interface BillingRecord {
	id: string;
	type: string;
	amount: number;
	status: string;
	description: string;
	createdAt: string;
}

export interface Plan {
	id: string;
	name: string;
	code?: string;
	monthlyPrice?: number;
	yearlyPrice?: number;
	features?: string[];
	status?: string;
	description?: string;
	[key: string]: unknown;
}

export interface PaymentGateway {
	id: string;
	name: string;
	channel: string;
	status: string;
	createdAt?: string;
	[key: string]: unknown;
}

export interface RefundApproval {
	id: string;
	amount: number;
	reason: string;
	status: string;
	tenantId?: string;
	transactionId?: string;
	createdAt?: string;
	[key: string]: unknown;
}

export interface DunningSettings {
	gracePeriodDays?: number;
	autoCancelDays?: number;
	status?: string;
	[key: string]: unknown;
}

export function useBillingSubscription(tenantId: string) {
	return useQuery({
		queryKey: queryKeys.billing.subscription(tenantId),
		staleTime: 60000,
		queryFn: async ({ signal }) => {
			const res = await getBillingSubscription(tenantId, signal);
			return extractItem<BillingSubscription>(res);
		},
		enabled: !!tenantId,
	});
}

export function useBillingUsage(tenantId: string) {
	return useQuery({
		queryKey: queryKeys.billing.usage(tenantId),
		staleTime: 60000,
		queryFn: async ({ signal }) => {
			const res = await getBillingUsage(tenantId, signal);
			return extractItem<BillingUsage>(res);
		},
		enabled: !!tenantId,
	});
}

export function useBillingStatistics(tenantId: string) {
	return useQuery({
		queryKey: queryKeys.billing.statistics(tenantId),
		staleTime: 60000,
		queryFn: async ({ signal }) => {
			const res = await getBillingStatistics(tenantId, signal);
			return extractItem<BillingStatistics>(res);
		},
		enabled: !!tenantId,
	});
}

export function useBillingRecords(tenantId: string) {
	return useQuery({
		queryKey: queryKeys.billing.records(tenantId),
		staleTime: 30000,
		queryFn: async ({ signal }) => {
			const res = await getBillingRecords(tenantId, signal);
			return extractList<BillingRecord>(res);
		},
		enabled: !!tenantId,
	});
}

export function useChangeBillingPlan() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: ({ tenantId, data }: { tenantId: string; data: Record<string, unknown> }) =>
			changeBillingPlan(tenantId, data),
		onSuccess: (_, vars) => {
			queryClient.invalidateQueries({ queryKey: queryKeys.billing.subscription(vars.tenantId) });
			queryClient.invalidateQueries({ queryKey: queryKeys.billing.all(vars.tenantId) });
		},
	});
}

export function usePlans() {
	return useQuery({
		queryKey: queryKeys.billing.plans,
		staleTime: 60000,
		queryFn: async ({ signal }) => {
			const res = await Generated.adminBillingPlans();
			return extractList<Plan>(res);
		},
	});
}

export function useCreatePlan() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (data: Record<string, unknown>) =>
			Generated.adminBillingPlansPost(data as unknown as CreatePlanRequest),
		onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.billing.plans }),
	});
}

export function useUpdatePlan() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: ({ id, data }: { id: string; data: Record<string, unknown> }) =>
			Generated.adminBillingPlansByPlansPut(id, data as unknown as UpdatePlanRequest),
		onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.billing.plans }),
	});
}

export function useDeletePlan() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (id: string) => Generated.adminBillingPlansByPlansDelete(id),
		onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.billing.plans }),
	});
}

export function usePaymentGateways() {
	return useQuery({
		queryKey: queryKeys.billing.paymentGateways,
		staleTime: 60000,
		queryFn: async ({ signal }) => {
			const res = await Generated.adminBillingPaymentGateways();
			return extractList<PaymentGateway>(res);
		},
	});
}

export function useCreatePaymentGateway() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (data: Record<string, unknown>) =>
			Generated.adminBillingPaymentGatewaysPost(data as unknown as CreatePaymentGatewayRequest),
		onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.billing.paymentGateways }),
	});
}

export function useUpdatePaymentGateway() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: ({ id, data }: { id: string; data: Record<string, unknown> }) =>
			Generated.adminBillingPaymentGatewaysByPaymentGatewaysPut(
				id,
				data as unknown as UpdatePaymentGatewayRequest,
			),
		onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.billing.paymentGateways }),
	});
}

export function useRefundApprovals() {
	return useQuery({
		queryKey: queryKeys.billing.refundApprovals,
		staleTime: 30000,
		queryFn: async ({ signal }) => {
			const res = await Generated.adminBillingRefundApprovals();
			return extractList<RefundApproval>(res);
		},
	});
}

export function useApproveRefund() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (id: string) => Generated.adminBillingRefundApprovalApproveByRefundApprovalPost(id),
		onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.billing.refundApprovals }),
	});
}

export function useRejectRefund() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (id: string) => Generated.adminBillingRefundApprovalRejectByRefundApprovalPost(id),
		onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.billing.refundApprovals }),
	});
}

export function useExecuteRefund() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: ({ id, data }: { id: string; data: Record<string, unknown> }) =>
			Generated.adminBillingRefundApprovalExecuteByRefundApprovalPost(
				id,
				data as unknown as ExecuteRefundRequest,
			),
		onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.billing.refundApprovals }),
	});
}

export function useDunningSettings(tenantId: string) {
	return useQuery({
		queryKey: queryKeys.billing.dunningSettings(tenantId),
		staleTime: 60000,
		queryFn: async ({ signal }) => {
			const res = await Generated.adminBillingDunningSettingsByDunningSettings(tenantId);
			return extractItem<DunningSettings>(res);
		},
		enabled: !!tenantId,
	});
}

export function useUpdateDunningSettings() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: ({ tenantId, data }: { tenantId: string; data: Record<string, unknown> }) =>
			Generated.adminBillingDunningSettingsByDunningSettingsPut(
				tenantId,
				data as unknown as DunningSettingsRequest,
			),
		onSuccess: (_, vars) => {
			queryClient.invalidateQueries({ queryKey: queryKeys.billing.dunningSettings(vars.tenantId) });
		},
	});
}
