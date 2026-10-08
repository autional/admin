'use client';

import { extractList, extractItem, extractListResult } from '@autional/shared';
import { queryKeys } from '@/lib/query-keys';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import * as Generated from '@autional/shared/generated/api';
import {
	getBillingPlans,
	createBillingPlan,
	updateBillingPlan,
	deleteBillingPlan,
	deleteSubscription,
	changeBillingPlan,
	rollbackPlan,
	extendTrial,
	getRevenueAmortization,
	getDunningSettings,
	updateDunningSettings,
	createCreditNote,
	approveRefund,
	rejectRefund,
	executeRefund,
	getCreditBalance,
	getCreditTransactions,
} from '@/lib/api.generated';

export interface PlanItem {
	id: string;
	code: string;
	name: string;
	description?: string;
	billingCycle: string;
	monthlyPrice?: string;
	yearlyPrice?: string;
	quarterlyPrice?: string;
	weeklyPrice?: string;
	features?: unknown;
	status: string;
	isCustom?: boolean;
	createdAt: string;
}

export interface SubscriptionItem {
	id: string;
	tenantId: string;
	planCode: string;
	planName?: string;
	status: string;
	startDate: string;
	currentPeriodStart?: string;
	currentPeriodEnd?: string;
	trialEndDate?: string;
	seats?: number;
	price?: string;
	createdAt: string;
}

export interface BillingRefundItem {
	id: string;
	tenantId: string;
	invoiceNumber?: string;
	amount: string;
	reason?: string;
	status: string;
	requestedBy?: string;
	approvedBy?: string;
	createdAt: string;
}

export interface RevenueItem {
	period: string;
	planCode?: string;
	totalRevenue: string;
	recognizedRevenue?: string;
	deferredRevenue?: string;
	transactionCount?: number;
}

export interface DunningSettings {
	tenantId: string;
	gracePeriodDays: number;
	autoCancelDays: number;
	status: string;
}

export interface TaxExportItem {
	id: string;
	period: string;
	format: string;
	status: string;
	downloadUrl?: string;
	createdAt: string;
}

export interface BillingAlertItem {
	id: string;
	name: string;
	resourceType: string;
	thresholdPercent: number;
	status: string;
	notificationChannels?: string;
	tenantId?: string;
	lastTriggeredAt?: string;
	createdAt: string;
	updatedAt?: string;
}

export function useBillingPlans() {
	return useQuery({
		queryKey: queryKeys.billingAdmin.plans,
		queryFn: async () => {
			const res = await getBillingPlans();
			return extractList<PlanItem>(res);
		},
	});
}

export function useCreatePlan() {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: createBillingPlan,
		onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.billingAdmin.plans }),
	});
}

export function useUpdatePlan() {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: ({ id, data }: { id: string; data: Record<string, unknown> }) =>
			updateBillingPlan(id, data),
		onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.billingAdmin.plans }),
	});
}

export function useDeletePlan() {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: deleteBillingPlan,
		onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.billingAdmin.plans }),
	});
}

export function useBillingSubscriptions(params?: Record<string, unknown>) {
	return useQuery({
		queryKey: queryKeys.billingAdmin.subscriptions(params),
		queryFn: async () => {
			const res = await Generated.adminBillingSubscriptions(
				params as { page?: number; page_size?: number },
			);
			return extractList<SubscriptionItem>(res);
		},
		// A-405⑤：403（入口平面门禁）不重试 —— 避免无意义二次请求放大报错噪音。
		retry: (count, err) =>
			count < 1 && (err as { response?: { status?: number } })?.response?.status !== 403,
	});
}

export function useCancelSubscription() {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: deleteSubscription,
		onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.billingAdmin.all }),
	});
}

export function useChangePlan() {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: ({ tenantId, data }: { tenantId: string; data: Record<string, unknown> }) =>
			changeBillingPlan(tenantId, data),
		onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.billingAdmin.all }),
	});
}

export function useRollbackPlan() {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: rollbackPlan,
		onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.billingAdmin.all }),
	});
}

export function useExtendTrial() {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: ({ tenantId, data }: { tenantId: string; data: Record<string, unknown> }) =>
			extendTrial(tenantId, data),
		onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.billingAdmin.all }),
	});
}

export function useBillingRefunds(params?: Record<string, unknown>) {
	return useQuery({
		queryKey: queryKeys.billingAdmin.refunds(params),
		queryFn: async () => {
			const res = await Generated.adminBillingRefundApprovals(params);
			return extractList<BillingRefundItem>(res);
		},
	});
}

export function useApproveRefund() {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: approveRefund,
		onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.billingAdmin.refunds() }),
	});
}

export function useRejectRefund() {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: rejectRefund,
		onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.billingAdmin.refunds() }),
	});
}

export function useExecuteRefund() {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: ({ id, data }: { id: string; data: Record<string, unknown> }) =>
			executeRefund(id, data),
		onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.billingAdmin.refunds() }),
	});
}

export function useBillingRevenue(params?: Record<string, unknown>) {
	return useQuery({
		queryKey: queryKeys.billingAdmin.revenue(params),
		queryFn: async () => {
			const res = await getRevenueAmortization(params);
			return extractList<RevenueItem>(res);
		},
	});
}

export function useDunningSettings(tenantId: string) {
	return useQuery({
		queryKey: queryKeys.billingAdmin.dunning(tenantId),
		queryFn: async () => {
			const res = await getDunningSettings(tenantId);
			return extractItem<DunningSettings>(res);
		},
		enabled: !!tenantId,
	});
}

export function useUpdateDunningSettings() {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: ({ tenantId, data }: { tenantId: string; data: Record<string, unknown> }) =>
			updateDunningSettings(tenantId, data),
		onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.billingAdmin.all }),
	});
}

export function useTaxExport(params?: Record<string, unknown>) {
	return useQuery({
		queryKey: queryKeys.billingAdmin.taxExport(params),
		queryFn: async () => {
			const res = await Generated.adminBillingTaxExports(params);
			return extractList<TaxExportItem>(res);
		},
	});
}

// TASK-AB1-22 / A-423：用量告警 channels 形状适配单点（数组 ⇄ wire 逗号串）。
// wire 契约 = `notification_channels string`（service-billing dto/dto.go:905/:918/:961，服务端按 ',' split 校验）；
// 表单多选值是 string[]。手写 split/join 只允许出现在本文件这两个函数内（页面零手写互转）。
export function alertChannelsToCsv(channels: unknown): string {
	if (Array.isArray(channels)) {
		return channels
			.map((c) => String(c).trim())
			.filter(Boolean)
			.join(',');
	}
	return typeof channels === 'string' ? channels : '';
}

export function alertChannelsFromCsv(csv?: string): string[] {
	if (!csv) return [];
	return csv
		.split(',')
		.map((c) => c.trim())
		.filter(Boolean);
}

// U316：用量告警读写改接 admin 面（user 面在 admin 平面被入口平面门禁拒 403）
// A-426③：extractListResult 透出 pagination（page/page_size 上行 → 受控分页控件；此前本地分页仅切当前页）
export function useBillingAlerts(params?: Record<string, unknown>) {
	return useQuery({
		queryKey: queryKeys.billingAdmin.alerts(params),
		queryFn: async () => {
			const res = await Generated.adminBillingAlerts(params);
			return extractListResult<BillingAlertItem>(res);
		},
	});
}

export function useCreateBillingAlert() {
	const qc = useQueryClient();
	return useMutation({
		// A-423：表单多选 string[] → wire 逗号串（提交边界单点转换；旧行为直传数组 → JSON 入 Go string 字段 400）
		mutationFn: (data: Record<string, unknown>) =>
			Generated.adminBillingAlertsPost({
				...data,
				notificationChannels: alertChannelsToCsv(data.notificationChannels),
			}),
		onSuccess: () => qc.invalidateQueries({ queryKey: ['billing-admin', 'alerts'] }),
	});
}

export function useUpdateBillingAlert() {
	const qc = useQueryClient();
	return useMutation({
		// A-423：同 create —— 仅在表单携带该键时转换（缺省不注入空串，避免误清渠道）
		mutationFn: ({ id, data }: { id: string; data: Record<string, unknown> }) =>
			Generated.adminBillingAlertsByAlertsPut(id, {
				...data,
				...(data.notificationChannels !== undefined
					? { notificationChannels: alertChannelsToCsv(data.notificationChannels) }
					: {}),
			}),
		onSuccess: () => qc.invalidateQueries({ queryKey: ['billing-admin', 'alerts'] }),
	});
}

export function useDeleteBillingAlert() {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: (id: string) => Generated.adminBillingAlertsByAlertsDelete(id),
		onSuccess: () => qc.invalidateQueries({ queryKey: ['billing-admin', 'alerts'] }),
	});
}

export interface CreditNoteItem {
	creditNoteNumber?: string;
	invoiceNumber?: string;
	// A-434：小数经 Go decimal 序列化为字符串（实测 `"amount":"12.34"`），此前 number 型与 wire 不符
	amount?: string;
	status?: string;
	reason?: string;
	issuedAt?: string;
}

export function useCreditNote(number: string) {
	return useQuery({
		queryKey: queryKeys.billingAdmin.creditNote(number),
		queryFn: async () => {
			const res = await Generated.adminBillingCreditNoteByCreditNote(number);
			return extractItem<CreditNoteItem>(res);
		},
		enabled: !!number,
	});
}

export function useCreateCreditNote() {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: ({
			invoiceNumber,
			data,
		}: {
			invoiceNumber: string;
			data: Record<string, unknown>;
		}) => createCreditNote(invoiceNumber, data),
		onSuccess: () => qc.invalidateQueries({ queryKey: ['billing-admin', 'credit-notes'] }),
	});
}

export function useCancelCreditNote() {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: (number: string) => Generated.adminBillingCreditNoteByCreditNotePut(number),
		onSuccess: () => qc.invalidateQueries({ queryKey: ['billing-admin', 'credit-notes'] }),
	});
}

export function useDeleteCreditNote() {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: (number: string) => Generated.adminBillingCreditNoteByCreditNoteDelete(number),
		onSuccess: () => qc.invalidateQueries({ queryKey: ['billing-admin', 'credit-notes'] }),
	});
}

export interface CreditBalanceItem {
	tenantId?: string;
	// A-434：decimal 序列化为字符串（实测 `"balance":"0"`）；number 型致 `.toLocaleString()` 无效
	balance?: string;
	currency?: string;
	updatedAt?: string;
}

export function useCreditBalance(tenantId: string) {
	return useQuery({
		queryKey: queryKeys.billingAdmin.creditBalance(tenantId),
		queryFn: async () => {
			const res = await getCreditBalance(tenantId);
			return extractItem<CreditBalanceItem>(res);
		},
		enabled: !!tenantId,
	});
}

export interface CreditTransactionItem {
	id?: string;
	tenantId?: string;
	// A-434：decimal 序列化为字符串（同 CreditBalanceItem.balance）
	amount?: string;
	balance?: string;
	source?: string;
	sourceId?: string;
	remark?: string;
	createdAt?: string;
	type?: string;
}

export interface CreditTransactionListData {
	items?: CreditTransactionItem[];
	total?: number;
}

export function useCreditTransactions(
	tenantId: string,
	params?: { page?: number; pageSize?: number; source?: string },
) {
	return useQuery({
		queryKey: queryKeys.billingAdmin.creditTransactions(tenantId, params),
		queryFn: async () => {
			// U316：改接 admin 面（user 面 credit-transactions 在 admin 平面被入口平面门禁拒 403）。
			const res = await getCreditTransactions(tenantId, {
				page: params?.page,
				page_size: params?.pageSize,
				source: params?.source,
			});
			const data = res as CreditTransactionListData;
			return data;
		},
		enabled: !!tenantId,
	});
}
