'use client';

import { extractList, extractItem } from '@autional/shared';
import { queryKeys } from '@/lib/query-keys';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
	listPayChannels,
	getPayChannel,
	createPayChannel,
	updatePayChannel,
	deletePayChannel,
	getPayReconciliation,
	runPayReconciliation,
	listAdminPayments,
	getAdminPayment,
	getAdminPaymentReceipt,
} from '@/lib/api.generated';

export interface Channel {
	id: string;
	tenantId: string;
	code: string;
	name: string;
	status: string;
	config?: string;
	webhookSecret?: string;
	createdAt: string;
}

export interface PaymentItem {
	paymentId: string;
	tenantId: string;
	appId: string;
	payerId: string;
	channelCode: string;
	amount: string;
	currency: string;
	status: string;
	targetType: string;
	targetId: string;
	receiptNumber: string;
	gatewayReference: string;
	itemDescription: string;
	createdAt: string;
	paidAt: string;
}

export interface ReconciliationRecord {
	id: string;
	channel: string;
	gatewayRef: string;
	gatewayAmount: string;
	internalRef: string;
	internalAmount: string;
	diffAmount: string;
	status: string;
	reconciledAt: string;
}

export interface RefundRecord {
	refundId: string;
	paymentId: string;
	status: string;
	amount: string;
	reason?: string;
	createdAt?: string;
}

export interface Receipt {
	paymentId: string;
	receiptNumber: string;
	tenantId: string;
	amount: string;
	currency: string;
	channelCode: string;
	itemDescription: string;
	createdAt: string;
}

export function usePayChannels(tenantId: string) {
	return useQuery({
		queryKey: queryKeys.pay.channels(tenantId),
		queryFn: async () => {
			const res = await listPayChannels();
			return extractList<Channel>(res);
		},
		enabled: !!tenantId,
	});
}

export function usePayPayments(params?: Record<string, unknown>) {
	return useQuery({
		queryKey: queryKeys.pay.payments(params),
		queryFn: async () => {
			const res = await listAdminPayments(params as any);
			return extractList<PaymentItem>(res);
		},
	});
}

export function usePayPaymentDetail(id: string) {
	return useQuery({
		queryKey: queryKeys.pay.paymentDetail(id),
		queryFn: async () => {
			const res = await getAdminPayment(id);
			return extractItem<PaymentItem>(res);
		},
		enabled: !!id,
	});
}

export function usePayReceipt(id: string) {
	return useQuery({
		queryKey: [...queryKeys.pay.paymentDetail(id), 'receipt'] as const,
		queryFn: async () => {
			const res = await getAdminPaymentReceipt(id);
			return extractItem<Receipt>(res);
		},
		enabled: !!id,
	});
}

export function usePayRefunds(params?: Record<string, unknown>) {
	return useQuery({
		queryKey: queryKeys.pay.refunds(params),
		queryFn: async () => {
			const res = await listAdminPayments({ ...params, status: 'refunded' } as any);
			return extractList<PaymentItem>(res);
		},
	});
}

export function usePayReconciliation(tenantId: string, params?: Record<string, unknown>) {
	return useQuery({
		queryKey: queryKeys.pay.reconciliation(tenantId, params),
		queryFn: async () => {
			const res = await getPayReconciliation(params as any);
			return extractList<ReconciliationRecord>(res);
		},
		enabled: !!tenantId,
	});
}

export function useRunPayReconciliation() {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: (params?: Record<string, unknown>) => runPayReconciliation(params as any),
		onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.pay.all }),
	});
}

export function useCreateChannel() {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: (data: Record<string, unknown>) => createPayChannel(data as any),
		onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.pay.all }),
	});
}

export function useUpdateChannel() {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: ({ id, data }: { id: string; data: Record<string, unknown> }) =>
			updatePayChannel(id, data as any),
		onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.pay.all }),
	});
}

export function useDeleteChannel() {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: (id: string) => deletePayChannel(id),
		onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.pay.all }),
	});
}
