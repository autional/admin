'use client';

import { extractList } from '@autional/shared';
import { queryKeys } from '@/lib/query-keys';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
	getDSARs,
	updateDSAR,
	getErasures,
	createErasure,
	executeErasure,
	getRetentionPolicies,
	getSODRules,
	getISOControls,
} from '@/lib/api.generated';
import * as Generated from '@autional/shared/generated/api';
import type {
	CreateErasureRequest,
	CreateRetentionPolicyRequest,
	UpdateRetentionPolicyRequest,
	CreateConsentRequest,
	RevokeConsentRequest,
} from '@autional/shared/generated/types';

interface DSAR {
	id: string;
	// F-AB2-26-a（TASK-AB2-26）：请求人 = wire `user_id`（后端 dsar.go:49 键集无 requester_email）。
	userId: string;
	type: string;
	status: string;
	createdAt: string;
	description?: string;
}

// A-235/A-241（TASK-AB2-27）：键位对齐 wire（dto.go:411-418 policy_id/data_type/
// retention_period_days/purpose/legal_basis/status；后端不返回 name/id/auto_delete）。
interface RetentionPolicy {
	policyId: string;
	dataType: string;
	retentionPeriodDays: number;
	purpose: string;
	legalBasis: string;
	status: string;
}

interface SODRule {
	id: string;
	name: string;
	roleA: string;
	roleB: string;
	description: string;
}

interface ISOControl {
	id: string;
	controlId: string;
	title: string;
	domain: string;
	complianceStatus: string;
}

// A-239（TASK-AB2-28）：键位对齐 wire（dto.go:188-197 ConsentItem；consent.go:50-53 列表映射
// id/user_id/purpose/granted/granted_at/expired_at——scope/ip/version/revokedAt 后端无此键。
// 注：DTO 的 service/consent_method 两字段 handler 未映射 → wire 恒空串，故列表侧不消费）。
interface Consent {
	id: string;
	userId: string;
	purpose: string;
	granted: boolean;
	grantedAt?: string;
	expiredAt?: string;
}

export function useDSARs() {
	return useQuery({
		queryKey: queryKeys.compliance.dsars,
		queryFn: async () => {
			const res = await getDSARs();
			return extractList<DSAR>(res);
		},
	});
}

export function useUpdateDSAR() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: ({ id, data }: { id: string; data: Record<string, unknown> }) =>
			updateDSAR(id, data),
		onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.compliance.dsars }),
	});
}

/** 擦除请求记录（wire ErasureItem：id/user_id/status/reason/created_at/completed_at）。 */
interface ErasureRecord {
	id: string;
	userId: string;
	status: string;
	reason?: string;
	createdAt?: string;
	completedAt?: string;
}

// A-234（TASK-AB2-26）：擦除请求列表 —— 旧页面无此查询，「执行擦除」亦错接创建端点。
export function useErasures() {
	return useQuery({
		queryKey: queryKeys.compliance.erasures,
		staleTime: 30000,
		queryFn: async () => {
			const res = await getErasures();
			return extractList<ErasureRecord>(res);
		},
	});
}

export function useCreateErasure() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (data: CreateErasureRequest) => createErasure(data),
		onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.compliance.erasures }),
	});
}

// A-234 修正：executeErasure 映射已归位（POST /right-to-erasure/{id}/execute，路径参数），
// 失效目标由 dsars 改为 erasures（状态机推进的是擦除请求自身）。
export function useExecuteErasure() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (id: string) => executeErasure(id),
		onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.compliance.erasures }),
	});
}

export function useRetentionPolicies() {
	return useQuery({
		queryKey: queryKeys.compliance.retentionPolicies,
		staleTime: 300000,
		queryFn: async () => {
			const res = await getRetentionPolicies();
			return extractList<RetentionPolicy>(res);
		},
	});
}

export function useSODRules() {
	return useQuery({
		queryKey: queryKeys.compliance.sodRules,
		staleTime: 300000,
		queryFn: async () => {
			const res = await getSODRules();
			return extractList<SODRule>(res);
		},
	});
}

export function useISOControls() {
	return useQuery({
		queryKey: queryKeys.compliance.isoControls,
		staleTime: 300000,
		queryFn: async () => {
			const res = await getISOControls();
			return extractList<ISOControl>(res);
		},
	});
}

export function useCreateRetentionPolicy() {
	const queryClient = useQueryClient();
	return useMutation({
		// A-235（TASK-AB2-27）：类型对齐 CreateRetentionPolicyRequest（name/data_type/
		// retention_period_days/purpose/legal_basis 必填 + auto_delete 可选），去断言炸弹性。
		mutationFn: (data: CreateRetentionPolicyRequest) =>
			Generated.adminComplianceRetentionPoliciesPost(data),
		onSuccess: () =>
			queryClient.invalidateQueries({ queryKey: queryKeys.compliance.retentionPolicies }),
	});
}

export function useUpdateRetentionPolicy() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: ({ id, data }: { id: string; data: UpdateRetentionPolicyRequest }) =>
			Generated.adminComplianceRetentionPoliciesByRetentionPoliciesPut(id, data),
		onSuccess: () =>
			queryClient.invalidateQueries({ queryKey: queryKeys.compliance.retentionPolicies }),
	});
}

export function useConsents() {
	return useQuery({
		queryKey: queryKeys.compliance.consents,
		staleTime: 30000,
		queryFn: async () => {
			const res = await Generated.adminComplianceGdprConsent();
			return extractList<Consent>(res);
		},
	});
}

export function useCreateConsent() {
	const queryClient = useQueryClient();
	return useMutation({
		// A-239（TASK-AB2-28）：类型对齐 CreateConsentRequest（user_id*/purpose*/service*/granted*
		// + consent_method?），去断言炸弹性。
		mutationFn: (data: CreateConsentRequest) => Generated.adminComplianceGdprConsentPost(data),
		onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.compliance.consents }),
	});
}

export function useRevokeConsent() {
	const queryClient = useQueryClient();
	return useMutation({
		// A-236（TASK-AB2-28）：类型对齐 RevokeConsentRequest（user_id*/purpose* + reason?）。
		mutationFn: (data: RevokeConsentRequest) => Generated.adminComplianceGdprConsentDelete(data),
		onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.compliance.consents }),
	});
}
