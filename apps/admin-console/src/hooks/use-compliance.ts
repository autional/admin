'use client';

import { apiClient, API_PATHS, extractItem, extractList, fromPageResult, toPageParams } from '@autional/shared';
import { queryKeys } from '@/lib/query-keys';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
	getDSARs,
	updateDSAR,
	getErasures,
	createErasure,
	executeErasure,
	getRetentionPolicies,
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

// A-243（W4-01）：键位对齐 wire（service-audit advanced_types.go:285-292 SoDRule{name / roles_a[] /
// roles_b[] / enabled}）——旧本地类型 roleA/roleB 单值与响应不符 → 列表两列恒空（批 2 listRender 同款修法）。
interface SODRule {
	id: string;
	name: string;
	rolesA: string[];
	rolesB: string[];
	enabled: boolean;
	description?: string;
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

/** W4-01（A-244）：列表分页入参（camel 书面；wire 键经 toPageParams 单点转 snake）。 */
export interface CompliancePageParams {
	page?: number;
	pageSize?: number;
}

/** W4-01（A-244/A-245）：DSAR 列表过滤入参——status=pending 供首页「待处理 DSAR」卡取 total。 */
export interface DSARQueryParams extends CompliancePageParams {
	status?: string;
}

// W4-01（A-244）：DSAR 列表服务端分页——发 page/page_size，total 由 ListResponse 回传
// （旧实现无参单拉，超一页即截断且分页器假全量）。
export function useDSARs(params?: DSARQueryParams) {
	return useQuery({
		// 分页/过滤参数入 key（同端点各页各成缓存条目）；前缀 [compliance,dsars] 仍被失效命中。
		queryKey: [...queryKeys.compliance.dsars, params],
		queryFn: async () => {
			const res = await getDSARs({
				...toPageParams({ page: params?.page, pageSize: params?.pageSize }),
				status: params?.status,
			});
			return fromPageResult<DSAR>(res);
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

// W4-01（A-244）：留存策略列表服务端分页（后端已支持 page/page_size——generated api.ts:2983-2989）。
export function useRetentionPolicies(params?: CompliancePageParams) {
	return useQuery({
		queryKey: [...queryKeys.compliance.retentionPolicies, params],
		staleTime: 300000,
		queryFn: async () => {
			const res = await getRetentionPolicies(
				toPageParams({ page: params?.page, pageSize: params?.pageSize }),
			);
			return fromPageResult<RetentionPolicy>(res);
		},
	});
}

// W4-01（A-244，Q-02 = 扩展）：sod-rules 生成签名无分页参数（api.ts:353-356 无参）→ 后端已随本 ITEM
// 扩展（service-audit handler/repository 收 page/page_size + NewListResponse 携 total），前端走裸
// apiClient 发 wire 参数（生成签名收敛前不改造生成层）。
export function useSODRules(params?: CompliancePageParams) {
	return useQuery({
		queryKey: [...queryKeys.compliance.sodRules, params],
		staleTime: 300000,
		queryFn: async () => {
			const res = await apiClient.get(API_PATHS.AUDIT.ADMIN_COMPLIANCE_SOD_RULES, {
				params: toPageParams({ page: params?.page, pageSize: params?.pageSize }),
			});
			return fromPageResult<SODRule>(res.data);
		},
	});
}

// W4-01（A-244）：ISO27001 控制项列表服务端分页（generated api.ts:2612-2618 收 page/page_size）。
export function useISOControls(params?: CompliancePageParams) {
	return useQuery({
		queryKey: [...queryKeys.compliance.isoControls, params],
		staleTime: 300000,
		queryFn: async () => {
			const res = await getISOControls(
				toPageParams({ page: params?.page, pageSize: params?.pageSize }),
			);
			return fromPageResult<ISOControl>(res);
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

// W4-01（A-244）：同意记录列表服务端分页（generated api.ts:2438-2448 收 page/page_size）。
export function useConsents(params?: CompliancePageParams) {
	return useQuery({
		queryKey: [...queryKeys.compliance.consents, params],
		staleTime: 30000,
		queryFn: async () => {
			const res = await Generated.adminComplianceGdprConsent(
				toPageParams({ page: params?.page, pageSize: params?.pageSize }),
			);
			return fromPageResult<Consent>(res);
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

// ========== W4-01（A-245）：首页两卡查询（旧 useEffect 静默 catch → 403/失败伪 0） ==========

/** 租户合规自评分（wire {tenant_id, overall_score, grade}——grade 旧实现零渲染，本批补）。 */
export interface ComplianceScore {
	tenantId?: string;
	overallScore?: number;
	grade?: string;
}

/** 合规策略框架（standards 数组——「遵守标准」卡计数来源）。 */
export interface CompliancePolicy {
	standards?: unknown[];
}

// A-245（W4-01）：自评分卡查询——error/forbidden 态由消费方经 QueryStateFallback 成态，
// 不再 `?? 0` 伪 0（旧实现 catch 仅 DEV console.error，失败静默显示 0 分）。
export function useComplianceScore() {
	return useQuery({
		queryKey: [...queryKeys.compliance.status, 'score'],
		queryFn: async () => {
			const res = await apiClient.get(API_PATHS.COMPLIANCE.ADMIN_TENANT_SELF_SCORE);
			return extractItem<ComplianceScore>(res.data);
		},
	});
}

// A-245（W4-01）：策略框架查询（standards 计数卡）。
export function useCompliancePolicy() {
	return useQuery({
		queryKey: [...queryKeys.compliance.status, 'policy'],
		queryFn: async () => {
			const res = await apiClient.get(API_PATHS.COMPLIANCE.ADMIN_TENANT_SELF_POLICY);
			return extractItem<CompliancePolicy>(res.data);
		},
	});
}
