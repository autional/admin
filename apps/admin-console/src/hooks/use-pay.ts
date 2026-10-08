'use client';

import { extractList, extractItem, extractListResult } from '@autional/shared';
import type { ListResult } from '@autional/shared';
import { queryKeys } from '@/lib/query-keys';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
	listPayChannels,
	createPayChannel,
	updatePayChannel,
	deletePayChannel,
	getPayReconciliation,
	runPayReconciliation,
	listAdminPayments,
	listAdminRefunds,
	getAdminPayment,
	getAdminPaymentReceipt,
} from '@/lib/api.generated';
import * as Generated from '@autional/shared/generated/api';

// A-344②：404 = 确定性结果（支付不存在），全局 retry:1（main.tsx:27）只会把一次 404 放大成双发
// （详情+收据两查询各 ×2 = 实测 4×404）；仅对 404 关闭重试，其余错误仍保留 1 次重试。
function retryUnlessNotFound(failureCount: number, error: unknown): boolean {
	if ((error as { response?: { status?: number } })?.response?.status === 404) return false;
	return failureCount < 1;
}

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
	id: string;
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
		queryFn: async (): Promise<ListResult<PaymentItem>> => {
			// A-341：服务端分页参接线（camel 书面写；拦截器 snake 化上 wire，pageSize→page_size）。
			// generated 该端点入参类型仍为 snake 字面量（签名未收编），故收窄直传。
			const res = await listAdminPayments(params as unknown as {
				app_id?: string;
				status?: string;
				page?: number;
				page_size?: number;
			});
			return extractListResult<PaymentItem>(res);
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
		// A-344②：404 不重试（全局 retry:1 ⇒ 伪 ID 实测 4×404 双发）
		retry: retryUnlessNotFound,
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
		// A-344②：同详情——404 不重试，杜绝收据腿的第二发 404
		retry: retryUnlessNotFound,
	});
}

// W2-01（A-352/A-353）：数据源 = GET /pay/v1/admin/refunds（pay_refund_records 单源，与写链同源）；
// status 入 queryKey（筛选触发新请求）。支付详情页签（A-342）传 payment_id 时按支付单本地过滤
// （admin 端点为租户级，无 payment_id 参数）。
// W4-05（U400①/RC-B4-06）：退款记录遗留键别名与 map 已移除——消费面一律使用契约真键 `id`。
export function usePayRefunds(params?: Record<string, unknown>) {
	const status = typeof params?.status === 'string' ? params.status : undefined;
	const paymentId = typeof params?.payment_id === 'string' ? params.payment_id : undefined;
	return useQuery({
		queryKey: queryKeys.pay.refunds(params),
		queryFn: async () => {
			const res = await listAdminRefunds({ status });
			return extractList<RefundRecord>(res).filter((r) => !paymentId || r.paymentId === paymentId);
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

// A-349：删除对账记录（DELETE 端点 router.go:139 早已存在、生成函数 api.ts:8298 零 UI 消费；
// api.generated.ts 垫片不在本波面，故直读 generated）。
export function useDeletePayReconciliation() {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: (id: string) => Generated.adminPaymentsReconciliationByReconciliationDelete(id),
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
