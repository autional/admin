'use client';
// @generated-api-exempt: 2 key(s) [COMPLIANCE.ADMIN_TENANT_SELF_POLICY, COMPLIANCE.ADMIN_TENANT_SELF_SCORE] lack generated func

import React, { useState } from 'react';
import { Tabs, Card, Tag, Button, Statistic, Row, Col, Space, Modal, Form, Input, InputNumber, Select, Switch, Empty, Progress, Badge, Popconfirm } from 'antd';
import { message, modal } from '@/lib/antd-app';
import {
	BadgeCheck,
	Eye,
	Pencil,
	Plus,
	RefreshCw,
	Settings,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import {
	useDSARs,
	useUpdateDSAR,
	useErasures,
	useCreateErasure,
	useExecuteErasure,
	useRetentionPolicies,
	useSODRules,
	useISOControls,
	useCreateRetentionPolicy,
	useUpdateRetentionPolicy,
	useConsents,
	useCreateConsent,
	useRevokeConsent,
	useComplianceScore,
	useCompliancePolicy,
} from '@/hooks/use-compliance';
import { handleApiError } from '@/lib/error-handler';
import { DataTable, Drawer, PageError } from '@autional/ui/antd';
import { useIsAuditRestricted, AuditStatsOnly, useTenantSlug, usePageTitle } from '@autional/shared';
import { QueryStateFallback } from '@/components/common/QueryStateFallback';
import type { CreateRetentionPolicyRequest, UpdateRetentionPolicyRequest } from '@autional/shared/generated/types';
import { AppPageHeader } from '@autional/ui';
import { buildNavHref } from '@/lib/nav';
import { useNavigate } from 'react-router';
import { useIsAdminRole } from '@/hooks/use-is-admin-role';

// W4-01（A-244 分页家族）：五表服务端分页——wire 契约 page/page_size（service-core base/dto/page.go
// 默认 20 上限 100），分页器 current/pageSize/total 全接服务端值（旧实现本地伪分页 + 单拉截断）。
const COMPLIANCE_PAGE_SIZE = 10;

/** A-243（W4-01，批 2 listRender 同款）：数组列渲染（roles_a/roles_b）→ 逗号连接；空数组/非数组 → '-'。 */
const listRender = (v: unknown) => (Array.isArray(v) && v.length > 0 ? v.join(', ') : '-');

// F-AB2-26-a（TASK-AB2-26 附带修正）：请求人 = wire `user_id`（后端 dsar.go:49 键集无 requester_email，
// 旧接口 `requesterEmail` 列恒空）。AC-B2-047 预填亦依赖此键。
interface DSARRecord {
	id: string;
	userId: string;
	type: string;
	status: string;
	createdAt: string;
	description?: string;
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

// A-235/A-241（TASK-AB2-27）：键位对齐 wire（dto.go:411-418 policy_id/data_type/
// retention_period_days/purpose/legal_basis/status；无 name/id/auto_delete）。
interface RetentionPolicy {
	policyId: string;
	dataType: string;
	retentionPeriodDays: number;
	purpose: string;
	legalBasis: string;
	status: string;
}

// A-243（W4-01）：键位对齐 wire（SoDRule{name / roles_a[] / roles_b[] / enabled}；旧本地单值
// roleA/roleB 与响应不符 → 两列恒空——批 2 listRender（数组 join）同款修法 + 补 enabled 列）。
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

// A-236/A-239（TASK-AB2-28）：键位对齐 wire（dto.go:188-197 ConsentItem；consent.go:50-53 列表映射
// id/user_id/purpose/granted/granted_at——scope/ipAddress/version/revokedAt 后端无此键）。
interface ConsentRecord {
	id: string;
	userId: string;
	purpose: string;
	granted: boolean;
	grantedAt?: string;
}

export default function CompliancePage() {
	const { t } = useTranslation();
	// W4-01（AC-B4-W4-01-7 / A-245）：页面标题落位（旧实现无 usePageTitle）。
	usePageTitle(t('compliance.title'));
	const isRestricted = useIsAuditRestricted();
	// A-232/A-233（TASK-AB1-15）：写控件按精确角色门控（admin/super_admin 可见；security_admin 只读）
	const isAdminRole = useIsAdminRole();
	const [activeTab, setActiveTab] = useState('dashboard');
	const navigate = useNavigate();
	const tenantSlug = useTenantSlug();
	const [dsarDrawer, setDsarDrawer] = useState(false);
	const [currentDsar, setCurrentDsar] = useState<DSARRecord | null>(null);

	// W4-01（A-244）：五表服务端分页页码（翻页即重发 page/page_size）。
	const [dsarPage, setDsarPage] = useState(1);
	const [consentPage, setConsentPage] = useState(1);
	const [retentionPage, setRetentionPage] = useState(1);
	const [sodPage, setSodPage] = useState(1);
	const [isoPage, setIsoPage] = useState(1);

	const [policyModal, setPolicyModal] = useState(false);
	const [policyForm] = Form.useForm();
	const [editingPolicy, setEditingPolicy] = useState<RetentionPolicy | null>(null);

	const [consentModal, setConsentModal] = useState(false);
	const [consentForm] = Form.useForm();

	const [erasureModal, setErasureModal] = useState(false);
	const [erasureForm] = Form.useForm();

	// W4-01（A-244）：五表服务端分页——请求经 toPageParams 发 page/page_size，响应经 fromPageResult
	// 归一取 items/total（旧实现无参单拉 + 本地伪分页）。
	const {
		data: dsarResult,
		isLoading: dsarLoading,
		error: dsarError,
		refetch: dsarRefetch,
	} = useDSARs({ page: dsarPage, pageSize: COMPLIANCE_PAGE_SIZE });
	const dsars = dsarResult?.items ?? [];
	const dsarTotal = dsarResult?.total ?? 0;
	const {
		data: policyResult,
		isLoading: policyLoading,
		error: policyError,
		refetch: policyRefetch,
	} = useRetentionPolicies({ page: retentionPage, pageSize: COMPLIANCE_PAGE_SIZE });
	const policies = policyResult?.items ?? [];
	const policyTotal = policyResult?.total ?? 0;
	const {
		data: sodResult,
		isLoading: sodLoading,
		error: sodError,
		refetch: sodRefetch,
	} = useSODRules({ page: sodPage, pageSize: COMPLIANCE_PAGE_SIZE });
	const sodRules = sodResult?.items ?? [];
	const sodTotal = sodResult?.total ?? 0;
	const {
		data: isoResult,
		isLoading: isoLoading,
		error: isoError,
		refetch: isoRefetch,
	} = useISOControls({ page: isoPage, pageSize: COMPLIANCE_PAGE_SIZE });
	const isoControls = isoResult?.items ?? [];
	const isoTotal = isoResult?.total ?? 0;
	const {
		data: consentResult,
		isLoading: consentLoading,
		error: consentError,
		refetch: consentRefetch,
	} = useConsents({ page: consentPage, pageSize: COMPLIANCE_PAGE_SIZE });
	const consents = consentResult?.items ?? [];
	const consentTotal = consentResult?.total ?? 0;
	const {
		data: erasures = [],
		isLoading: erasureLoading,
		error: erasureError,
		refetch: erasureRefetch,
	} = useErasures();
	const updateDsarMut = useUpdateDSAR();
	const createErasureMut = useCreateErasure();
	const erasureMut = useExecuteErasure();
	const createPolicyMut = useCreateRetentionPolicy();
	const updatePolicyMut = useUpdateRetentionPolicy();
	const createConsentMut = useCreateConsent();
	const revokeConsentMut = useRevokeConsent();

	// A-245（W4-01）：自评分/策略框架两卡查询（旧 useEffect 静默 catch → 失败静默伪 0，本批成态）。
	const {
		data: complianceScore,
		isLoading: scoreLoading,
		error: scoreError,
		refetch: scoreRefetch,
	} = useComplianceScore();
	const {
		data: compliancePolicy,
		isLoading: frameworkLoading,
		error: frameworkError,
		refetch: frameworkRefetch,
	} = useCompliancePolicy();
	const standardCount = compliancePolicy?.standards?.length ?? 0;
	// A-245：待处理 DSAR 计数——服务端分页后不能再从当前页数组 filter（且列表被 403 时同样失真），
	// 专发 status=pending&page_size=1 直读 ListResponse.total（后端 ListDSAR 支持 status 过滤）。
	const {
		data: pendingDsarResult,
		isLoading: pendingDsarLoading,
		error: pendingDsarError,
		refetch: pendingDsarRefetch,
	} = useDSARs({ page: 1, pageSize: 1, status: 'pending' });
	const pendingDsarCount = pendingDsarResult?.total ?? 0;

	const handleProcessDsar = async (id: string, statusVal: string) => {
		try {
			await updateDsarMut.mutateAsync({ id, data: { status: statusVal } });
			message.success(t('compliance.dsar.updateSuccess'));
		} catch (err) {
			handleApiError(err, t('compliance.updateFailed'));
		}
	};

	// A-234（TASK-AB2-26）：执行擦除——id 为**擦除请求 id**（路径参数），确认由 Popconfirm 承担；
	// 旧实现把 DSAR id 当 body 发创建端点（必败 400）。
	const handleExecuteErasure = async (id: string) => {
		try {
			await erasureMut.mutateAsync(id);
			message.success(t('compliance.erasure.executeSuccess'));
		} catch (err) {
			handleApiError(err, t('compliance.erasure.executeFailed'));
		}
	};

	// AC-B2-047：DSAR 行「发起擦除」→ 预填该 DSAR 的 userId（Tab 入口则不预填）。
	const openErasureModal = (presetUserId?: string) => {
		erasureForm.resetFields();
		if (presetUserId) {
			erasureForm.setFieldsValue({ userId: presetUserId });
		}
		setErasureModal(true);
	};

	const handleCreateErasure = async (values: {
		userId: string;
		dataCategories: string[];
		reason?: string;
	}) => {
		try {
			await createErasureMut.mutateAsync({
				userId: values.userId,
				dataCategories: values.dataCategories,
				reason: values.reason,
			});
			message.success(t('compliance.erasure.createSuccess'));
			setErasureModal(false);
			erasureForm.resetFields();
		} catch (err) {
			handleApiError(err, t('compliance.erasure.createFailed'));
		}
	};

	const handleSavePolicy = async (values: any) => {
		try {
			if (editingPolicy) {
				// A-241：PUT 携 wire 真键（data_type/retention_period_days/purpose/legal_basis）；
				// name 留空不提交（列表 wire 无 name 无回显源）；auto_delete 仅显式触碰才提交
				// （列表 wire 无 auto_delete 无回显源，未触碰盲提交会静默覆写存量值）。
				const payload: UpdateRetentionPolicyRequest = {
					dataType: values.dataType,
					retentionPeriodDays: Number(values.retentionPeriodDays),
					purpose: values.purpose,
					legalBasis: values.legalBasis,
				};
				if (typeof values.name === 'string' && values.name.trim()) {
					payload.name = values.name.trim();
				}
				if (policyForm.isFieldTouched('autoDelete')) {
					payload.autoDelete = values.autoDelete;
				}
				await updatePolicyMut.mutateAsync({ id: editingPolicy.policyId, data: payload });
				message.success(t('compliance.retention.updateSuccess'));
			} else {
				// A-235：创建 payload 对齐 DTO 必填五键（缺任一 → required binding 必 400）。
				const payload: CreateRetentionPolicyRequest = {
					name: values.name,
					dataType: values.dataType,
					retentionPeriodDays: Number(values.retentionPeriodDays),
					purpose: values.purpose,
					legalBasis: values.legalBasis,
					autoDelete: values.autoDelete ?? false,
				};
				await createPolicyMut.mutateAsync(payload);
				message.success(t('compliance.retention.createSuccess'));
			}
			setPolicyModal(false);
			policyForm.resetFields();
			setEditingPolicy(null);
		} catch (err) {
			handleApiError(err, t('compliance.retention.saveFailed'));
		}
	};

	// A-239（TASK-AB2-28）：service/consentMethod 改显式输入（原硬编码 'admin-console'/'manual'）；
	// service 为后端 binding 必填（dto.go:229），consentMethod 对齐契约值域 explicit/implicit。
	const handleCreateConsent = async (values: {
		userId: string;
		scope: string;
		service: string;
		consentMethod: string;
		granted: boolean;
	}) => {
		try {
			await createConsentMut.mutateAsync({
				userId: values.userId,
				purpose: values.scope,
				service: values.service,
				granted: values.granted,
				consentMethod: values.consentMethod,
			});
			message.success(t('compliance.consent.createSuccess'));
			setConsentModal(false);
			consentForm.resetFields();
		} catch (err) {
			handleApiError(err, t('compliance.consent.createFailed'));
		}
	};

	const handleRevokeConsent = (record: ConsentRecord) => {
		modal.confirm({
			title: t('compliance.consent.confirmRevoke'),
			content: t('compliance.consent.revokeMessage', {
				userId: record.userId,
				purpose: record.purpose,
			}),
			okText: t('compliance.consent.revoke'),
			okButtonProps: { danger: true },
			onOk: async () => {
				try {
					// A-236（TASK-AB2-28）：purpose 取 record.purpose（旧 record.scope 无此键 → undefined 被
					// JSON.stringify 丢弃 → RevokeConsentRequest.purpose binding 必 400）。
					await revokeConsentMut.mutateAsync({ userId: record.userId, purpose: record.purpose });
					message.success(t('compliance.consent.revokeSuccess'));
				} catch (err) {
					handleApiError(err, t('compliance.consent.revokeFailed'));
				}
			},
		});
	};

	const dsarColumns = [
		{ title: t('compliance.dsar.requester'), dataIndex: 'userId', key: 'userId' },
		{
			title: t('common.type'),
			dataIndex: 'type',
			key: 'type',
			render: (v: string) => <Tag>{v}</Tag>,
		},
		{
			title: t('common.status'),
			dataIndex: 'status',
			key: 'status',
			render: (v: string) => (
				<Tag color={v === 'completed' ? 'success' : v === 'pending' ? 'warning' : 'default'}>
					{v}
				</Tag>
			),
		},
		{ title: t('common.createdAt'), dataIndex: 'createdAt', key: 'createdAt' },
		{
			title: t('common.actions'),
			key: 'action',
			render: (_: any, record: DSARRecord) => (
				<Space size="small">
					<Button
						type="link"
						icon={<Eye size="1em" />}
						onClick={() => {
							setCurrentDsar(record);
							setDsarDrawer(true);
						}}
					>
						{t('compliance.dsar.viewDetail')}
					</Button>
					{isAdminRole && (
						<Button type="link" onClick={() => handleProcessDsar(record.id, 'completed')}>
							{t('compliance.dsar.markComplete')}
						</Button>
					)}
					{isAdminRole && (
						<Button type="link" onClick={() => openErasureModal(record.userId)}>
							{t('compliance.dsar.initiateErasure')}
						</Button>
					)}
				</Space>
			),
		},
	];

	// A-234（TASK-AB2-26）：擦除请求列——终态展示（completed/rejected 无行操作）；
	// 仅 pending 可执行（后端 ExecuteErasure 状态机 pending→processing→completed，终态拒绝）。
	const erasureColumns = [
		{ title: t('compliance.erasure.requester'), dataIndex: 'userId', key: 'userId', ellipsis: true },
		{
			title: t('common.status'),
			dataIndex: 'status',
			key: 'status',
			render: (v: string) => (
				<Tag
					color={
						v === 'completed'
							? 'success'
							: v === 'pending'
								? 'warning'
								: v === 'processing'
									? 'processing'
									: v === 'rejected'
										? 'error'
										: 'default'
					}
				>
					{v}
				</Tag>
			),
		},
		{ title: t('common.createdAt'), dataIndex: 'createdAt', key: 'createdAt' },
		{
			title: t('compliance.erasure.completedAt'),
			dataIndex: 'completedAt',
			key: 'completedAt',
			render: (v: string) => v || '-',
		},
		{
			title: t('common.actions'),
			key: 'action',
			render: (_: any, record: ErasureRecord) =>
				record.status === 'pending' && isAdminRole ? (
					<Popconfirm
						title={t('compliance.erasure.executeConfirm')}
						description={t('compliance.erasure.executeWarning')}
						okText={t('common.confirm')}
						cancelText={t('common.cancel')}
						okButtonProps={{ danger: true }}
						onConfirm={() => handleExecuteErasure(record.id)}
					>
						<Button type="link" danger>
							{t('compliance.erasure.execute')}
						</Button>
					</Popconfirm>
				) : null,
		},
	];

	// A-241（TASK-AB2-27）：列键对齐 wire（旧 name/resourceType/retentionDays/actionAfterExpiry 恒空）。
	const policyColumns = [
		{ title: t('compliance.retention.policyId'), dataIndex: 'policyId', key: 'policyId' },
		{ title: t('compliance.retention.dataType'), dataIndex: 'dataType', key: 'dataType' },
		{
			title: t('compliance.retention.retentionPeriodDays'),
			dataIndex: 'retentionPeriodDays',
			key: 'retentionPeriodDays',
		},
		{ title: t('compliance.retention.purpose'), dataIndex: 'purpose', key: 'purpose' },
		{ title: t('compliance.retention.legalBasis'), dataIndex: 'legalBasis', key: 'legalBasis' },
		{
			title: t('common.status'),
			dataIndex: 'status',
			key: 'status',
			render: (v: string) => <Tag color={v === 'active' ? 'success' : 'default'}>{v}</Tag>,
		},
		{
			title: t('common.actions'),
			key: 'action',
			render: (_: any, record: RetentionPolicy) =>
				isAdminRole ? (
					<Space size="small">
						<Button
							type="link"
							icon={<Pencil size="1em" />}
							onClick={() => {
								// A-241：只预填 wire 回传四键（name/autoDelete 无回显源不预填，
								// 提交侧独立门控——见 handleSavePolicy）。
								policyForm.resetFields();
								policyForm.setFieldsValue({
									dataType: record.dataType,
									retentionPeriodDays: record.retentionPeriodDays,
									purpose: record.purpose,
									legalBasis: record.legalBasis,
								});
								setEditingPolicy(record);
								setPolicyModal(true);
							}}
						>
							{t('common.edit')}
						</Button>
					</Space>
				) : null,
		},
	];

	// A-243（W4-01）：列键对齐 wire SoDRule{name / rolesA[] / rolesB[] / enabled}——旧 dataIndex
	// roleA/roleB 单值与响应 roles_a/roles_b 数组不符 → 两列恒空；数组经 listRender join；补 enabled 列。
	const sodColumns = [
		{ title: t('compliance.sod.ruleName'), dataIndex: 'name', key: 'name' },
		{ title: t('compliance.sod.roleA'), dataIndex: 'rolesA', key: 'rolesA', render: listRender },
		{ title: t('compliance.sod.roleB'), dataIndex: 'rolesB', key: 'rolesB', render: listRender },
		{
			title: t('compliance.sod.enabled'),
			dataIndex: 'enabled',
			key: 'enabled',
			render: (v: boolean) => (v ? t('common.yes') : t('common.no')),
		},
		{
			title: t('common.description'),
			dataIndex: 'description',
			key: 'description',
			ellipsis: true,
		},
	];

	const isoColumns = [
		{ title: t('compliance.iso.controlId'), dataIndex: 'controlId', key: 'controlId' },
		{ title: t('compliance.iso.title'), dataIndex: 'title', key: 'title' },
		{ title: t('compliance.iso.domain'), dataIndex: 'domain', key: 'domain' },
		{
			title: t('compliance.iso.complianceStatus'),
			dataIndex: 'complianceStatus',
			key: 'complianceStatus',
			render: (v: string) => (
				<Tag color={v === 'compliant' ? 'success' : v === 'non_compliant' ? 'error' : 'warning'}>
					{v}
				</Tag>
			),
		},
	];

	// A-239（TASK-AB2-28）：列对齐 wire——scope→purpose、recordedAt→grantedAt；ip/version 列删除
	//（ConsentItem 无此键；domain IPAddress/PolicyVersion 均 json:"-" 未暴露）。
	const consentColumns = [
		{ title: t('compliance.consent.userId'), dataIndex: 'userId', key: 'userId', ellipsis: true },
		{
			title: t('compliance.consent.purposeColumn'),
			dataIndex: 'purpose',
			key: 'purpose',
			render: (v: string) => <Tag>{v || '-'}</Tag>,
		},
		{
			title: t('common.status'),
			key: 'status',
			render: (_: any, r: ConsentRecord) => (
				<Tag color={r.granted ? 'success' : 'error'}>
					{r.granted ? t('compliance.consent.granted') : t('compliance.consent.revokedStatus')}
				</Tag>
			),
		},
		{
			title: t('compliance.consent.grantedAt'),
			dataIndex: 'grantedAt',
			key: 'grantedAt',
			render: (v: string) => (v ? new Date(v).toLocaleString('zh-CN') : '-'),
		},
		{
			title: t('common.actions'),
			key: 'action',
			render: (_: any, record: ConsentRecord) =>
				record.granted && isAdminRole ? (
					<Button type="link" danger onClick={() => handleRevokeConsent(record)}>
						{t('compliance.consent.revoke')}
					</Button>
				) : null,
		},
	];

	// A-245（W4-01，AC-B4-W4-01-4/6）：三卡统计块——dashboard Tab 与 isRestricted 锁卡 children 共用；
	// 三卡各自成态：403/失败经 QueryStateFallback（无权限文案、403 不接重试）；score 卡不再 `?? 0` 伪 0
	// （失败显式成态、缺值显 '-'），grade 响应字段补渲染。
	const dashboardStats = (
		<Row gutter={16}>
			<Col xs={24} md={6}>
				<Card loading={scoreLoading}>
					{scoreError ? (
						<QueryStateFallback
							isLoading={scoreLoading}
							error={scoreError}
							data={complianceScore}
							errorMessage={t('compliance.scoreLoadError')}
							onRetry={scoreRefetch}
						/>
					) : (
						<>
							<Statistic
								title={t('compliance.score')}
								value={complianceScore?.overallScore ?? '-'}
								suffix="/ 100"
								valueStyle={{
									color:
										(complianceScore?.overallScore ?? 0) >= 80
											? 'var(--color-success-light)'
											: 'var(--color-error-light)',
								}}
								prefix={<BadgeCheck size="1em" />}
							/>
							{complianceScore?.grade && (
								<div className="mt-2 text-sm text-neutral-600">
									{t('compliance.scoreGrade')}: <Tag color="blue">{complianceScore.grade}</Tag>
								</div>
							)}
						</>
					)}
				</Card>
			</Col>
			<Col xs={24} md={6}>
				<Card loading={frameworkLoading}>
					{frameworkError ? (
						<QueryStateFallback
							isLoading={frameworkLoading}
							error={frameworkError}
							data={compliancePolicy}
							errorMessage={t('compliance.loadError')}
							onRetry={frameworkRefetch}
						/>
					) : (
						<Statistic
							title={t('compliance.standardsCount')}
							value={standardCount}
							suffix={t('compliance.standardsUnit')}
						/>
					)}
					{isAdminRole && (
						<Button
							type="link"
							size="small"
							icon={<Settings size="1em" />}
							onClick={() => navigate(buildNavHref('/compliance/policy', tenantSlug))}
						>
							{t('compliance.managePolicy')}
						</Button>
					)}
				</Card>
			</Col>
			<Col xs={24} md={6}>
				<Card loading={pendingDsarLoading}>
					{pendingDsarError ? (
						<QueryStateFallback
							isLoading={pendingDsarLoading}
							error={pendingDsarError}
							data={pendingDsarResult}
							errorMessage={t('compliance.loadError')}
							onRetry={pendingDsarRefetch}
						/>
					) : (
						<Statistic
							title={t('compliance.pendingDsar')}
							value={pendingDsarCount}
							valueStyle={{
								color:
									pendingDsarCount > 0
										? 'var(--color-error-light)'
										: 'var(--color-success-light)',
							}}
						/>
					)}
				</Card>
			</Col>
		</Row>
	);

	if (isRestricted) {
		// A-245（W4-01，AC-B4-W4-01-6）：锁卡携统计 children（旧实现零统计——children 通道现成）。
		return <AuditStatsOnly title={t('compliance.title')}>{dashboardStats}</AuditStatsOnly>;
	}

	return (
		<div>
			<AppPageHeader title={t('compliance.title')} />

			<Tabs
				activeKey={activeTab}
				onChange={setActiveTab}
				items={[
					{
						key: 'dashboard',
						label: t('compliance.tabDashboard'),
						children: dashboardStats,
					},
					{
						key: 'dsar',
						label: t('compliance.tabDsar'),
						// W4-01（AC-B4-W4-01-2/5）：服务端分页 + 失败≠空态（403 经 QueryStateFallback 分流无权限态）。
						children: dsarError ? (
							<QueryStateFallback
								isLoading={dsarLoading}
								error={dsarError}
								data={dsars}
								errorMessage={t('compliance.loadError')}
								onRetry={dsarRefetch}
							/>
						) : (
							<DataTable
								rowKey="id"
								columns={dsarColumns}
								dataSource={dsars}
								loading={dsarLoading}
								pagination={{
									current: dsarPage,
									pageSize: COMPLIANCE_PAGE_SIZE,
									total: dsarTotal,
									onChange: (page) => setDsarPage(page),
									showSizeChanger: false,
									showTotal: (total) => t('paginationTotal', { total }),
								}}
								scroll={{ x: 800 }}
							/>
						),
					},
					// A-234（TASK-AB2-26 / ADR-B2-06）：擦除请求 Tab（create → pending 列表 → execute → 终态）。
					{
						key: 'erasure',
						label: t('compliance.tabErasure'),
						children: (
							<>
								<div className="flex justify-end gap-2 mb-4">
									<Button
										icon={<RefreshCw size="1em" />}
										onClick={() => erasureRefetch()}
									>
										{t('common.refresh')}
									</Button>
									{isAdminRole && (
										<Button
											type="primary"
											icon={<Plus size="1em" />}
											onClick={() => openErasureModal()}
										>
											{t('compliance.erasure.create')}
										</Button>
									)}
								</div>
								{erasureError && (
									<PageError
										message={t('compliance.erasure.loadError')}
										retry={erasureRefetch}
										className="mb-4"
									/>
								)}
								<DataTable
									rowKey="id"
									columns={erasureColumns}
									dataSource={erasures}
									loading={erasureLoading}
									pagination={{ pageSize: 10 }}
									scroll={{ x: 800 }}
									locale={{ emptyText: t('compliance.erasure.empty') }}
								/>
							</>
						),
					},
					{
						key: 'consent',
						label: t('compliance.tabConsent'),
						children: (
							<>
								{isAdminRole && (
									<div className="flex justify-end mb-4">
										<Button
											type="primary"
											icon={<Plus size="1em" />}
											onClick={() => {
												consentForm.resetFields();
												setConsentModal(true);
											}}
										>
											{t('compliance.consent.newConsent')}
										</Button>
									</div>
								)}
								{/* W4-01（AC-B4-W4-01-2/5）：服务端分页 + 失败≠空态（403 分流无权限态）。 */}
								{consentError ? (
									<QueryStateFallback
										isLoading={consentLoading}
										error={consentError}
										data={consents}
										errorMessage={t('compliance.loadError')}
										onRetry={consentRefetch}
									/>
								) : (
									<DataTable
										rowKey="id"
										columns={consentColumns}
										dataSource={consents}
										loading={consentLoading}
										pagination={{
											current: consentPage,
											pageSize: COMPLIANCE_PAGE_SIZE,
											total: consentTotal,
											onChange: (page) => setConsentPage(page),
											showSizeChanger: false,
											showTotal: (total) => t('paginationTotal', { total }),
										}}
										scroll={{ x: 800 }}
									/>
								)}
							</>
						),
					},
					{
						key: 'retention',
						label: t('compliance.tabRetention'),
						children: (
							<>
								{isAdminRole && (
									<div className="flex justify-end mb-4">
										<Button
											type="primary"
											icon={<Plus size="1em" />}
											onClick={() => {
												setEditingPolicy(null);
												policyForm.resetFields();
												setPolicyModal(true);
											}}
										>
											{t('compliance.retention.createBtn')}
										</Button>
									</div>
								)}

								{/* W4-01（AC-B4-W4-01-2/5）：服务端分页 + 失败≠空态（旧 PageError 兄弟位 → 错误态整位替换，
								    403 经 QueryStateFallback 分流无权限态且不接重试）。 */}
								{policyError ? (
									<QueryStateFallback
										isLoading={policyLoading}
										error={policyError}
										data={policies}
										errorMessage={t('compliance.loadError')}
										onRetry={policyRefetch}
									/>
								) : (
									<DataTable
										rowKey="policyId"
										columns={policyColumns}
										dataSource={policies}
										loading={policyLoading}
										pagination={{
											current: retentionPage,
											pageSize: COMPLIANCE_PAGE_SIZE,
											total: policyTotal,
											onChange: (page) => setRetentionPage(page),
											showSizeChanger: false,
											showTotal: (total) => t('paginationTotal', { total }),
										}}
										scroll={{ x: 800 }}
									/>
								)}
							</>
						),
					},
					{
						key: 'sod',
						label: t('compliance.tabSod'),
						// W4-01（AC-B4-W4-01-3/5）：sod-rules 服务端分页（Q-02 Go 扩展配套）+ 失败≠空态。
						children: sodError ? (
							<QueryStateFallback
								isLoading={sodLoading}
								error={sodError}
								data={sodRules}
								errorMessage={t('compliance.loadError')}
								onRetry={sodRefetch}
							/>
						) : (
							<DataTable
								rowKey="id"
								columns={sodColumns}
								dataSource={sodRules}
								loading={sodLoading}
								pagination={{
									current: sodPage,
									pageSize: COMPLIANCE_PAGE_SIZE,
									total: sodTotal,
									onChange: (page) => setSodPage(page),
									showSizeChanger: false,
									showTotal: (total) => t('paginationTotal', { total }),
								}}
								scroll={{ x: 800 }}
							/>
						),
					},
					{
						key: 'iso',
						label: t('compliance.tabIso'),
						// W4-01（AC-B4-W4-01-2/5）：服务端分页 + 失败≠空态。
						children: isoError ? (
							<QueryStateFallback
								isLoading={isoLoading}
								error={isoError}
								data={isoControls}
								errorMessage={t('compliance.loadError')}
								onRetry={isoRefetch}
							/>
						) : (
							<DataTable
								rowKey="id"
								columns={isoColumns}
								dataSource={isoControls}
								loading={isoLoading}
								pagination={{
									current: isoPage,
									pageSize: COMPLIANCE_PAGE_SIZE,
									total: isoTotal,
									onChange: (page) => setIsoPage(page),
									showSizeChanger: false,
									showTotal: (total) => t('paginationTotal', { total }),
								}}
								scroll={{ x: 800 }}
							/>
						),
					},
				]}
			/>

			<Drawer
				title={t('compliance.dsar.detailTitle')}
				size="sm"
				open={dsarDrawer}
				onClose={() => setDsarDrawer(false)}
				className="!w-full sm:!w-[480px]"
			>
				{currentDsar && (
					<div className="space-y-4">
						<Row>
							<Col span={8} className="text-neutral-600">
								{t('common.id')}
							</Col>
							<Col span={16}>{currentDsar.id}</Col>
						</Row>
						<Row>
							<Col span={8} className="text-neutral-600">
								{t('compliance.dsar.requester')}
							</Col>
							<Col span={16}>{currentDsar.userId}</Col>
						</Row>
						<Row>
							<Col span={8} className="text-neutral-600">
								{t('common.type')}
							</Col>
							<Col span={16}>
								<Tag>{currentDsar.type}</Tag>
							</Col>
						</Row>
						<Row>
							<Col span={8} className="text-neutral-600">
								{t('common.status')}
							</Col>
							<Col span={16}>
								<Tag>{currentDsar.status}</Tag>
							</Col>
						</Row>
						<Row>
							<Col span={8} className="text-neutral-600">
								{t('common.createdAt')}
							</Col>
							<Col span={16}>{currentDsar.createdAt}</Col>
						</Row>
						<Row>
							<Col span={8} className="text-neutral-600">
								{t('common.description')}
							</Col>
							<Col span={16}>{currentDsar.description || '-'}</Col>
						</Row>
					</div>
				)}
			</Drawer>

			<Modal
				title={
					editingPolicy
						? t('compliance.retention.modalEdit')
						: t('compliance.retention.modalCreate')
				}
				open={policyModal}
				onCancel={() => {
					setPolicyModal(false);
					setEditingPolicy(null);
					policyForm.resetFields();
				}}
				onOk={() => policyForm.submit()}
				closable={{ 'aria-label': t('common.close') }}
				className="w-full max-w-[560px]"
			>
				<Form form={policyForm} layout="vertical" onFinish={handleSavePolicy}>
					<Form.Item
						name="name"
						label={t('common.name')}
						// A-241：编辑态 name 无回显源（列表 wire 无 name）→ 可选，留空不提交（名称保持原值）。
						rules={
							editingPolicy
								? []
								: [{ required: true, message: t('compliance.retention.nameRequired') }]
						}
					>
						<Input
							placeholder={t(
								editingPolicy
									? 'compliance.retention.nameOptionalPlaceholder'
									: 'compliance.retention.namePlaceholder',
							)}
						/>
					</Form.Item>
					<Form.Item
						name="dataType"
						label={t('compliance.retention.dataType')}
						rules={[{ required: true, message: t('compliance.retention.dataTypeRequired') }]}
					>
						<Input placeholder={t('compliance.retention.dataTypePlaceholder')} />
					</Form.Item>
					<Form.Item
						name="retentionPeriodDays"
						label={t('compliance.retention.retentionPeriodDays')}
						rules={[
							{
								required: true,
								message: t('compliance.retention.retentionPeriodDaysRequired'),
							},
						]}
					>
						<InputNumber min={1} max={36500} style={{ width: '100%' }} placeholder="365" />
					</Form.Item>
					<Form.Item
						name="purpose"
						label={t('compliance.retention.purpose')}
						rules={[{ required: true, message: t('compliance.retention.purposeRequired') }]}
					>
						<Input placeholder={t('compliance.retention.purposePlaceholder')} />
					</Form.Item>
					<Form.Item
						name="legalBasis"
						label={t('compliance.retention.legalBasis')}
						rules={[{ required: true, message: t('compliance.retention.legalBasisRequired') }]}
					>
						<Input placeholder={t('compliance.retention.legalBasisPlaceholder')} />
					</Form.Item>
					<Form.Item
						name="autoDelete"
						label={t('compliance.retention.autoDelete')}
						valuePropName="checked"
					>
						<Switch />
					</Form.Item>
				</Form>
			</Modal>

			<Modal
				title={t('compliance.consent.modalTitle')}
				open={consentModal}
				onCancel={() => {
					setConsentModal(false);
					consentForm.resetFields();
				}}
				onOk={() => consentForm.submit()}
				closable={{ 'aria-label': t('common.close') }}
				className="w-full max-w-[560px]"
			>
				<Form form={consentForm} layout="vertical" onFinish={handleCreateConsent}>
					<Form.Item
						name="userId"
						label={t('compliance.consent.userId')}
						rules={[{ required: true, message: t('compliance.consent.userIdRequired') }]}
					>
						<Input placeholder={t('compliance.consent.userIdPlaceholder')} />
					</Form.Item>
					<Form.Item
						name="scope"
						label={t('compliance.consent.scope')}
						rules={[{ required: true, message: t('compliance.consent.scopeRequired') }]}
					>
						<Select
							placeholder={t('compliance.consent.scopePlaceholder')}
							options={[
								{ value: 'marketing', label: t('compliance.consent.scopeMarketing') },
								{ value: 'analytics', label: t('compliance.consent.scopeAnalytics') },
								{ value: 'third_party', label: t('compliance.consent.scopeThirdParty') },
								{ value: 'terms', label: t('compliance.consent.scopeTerms') },
								{ value: 'privacy', label: t('compliance.consent.scopePrivacy') },
							]}
						/>
					</Form.Item>
					<Form.Item
						name="service"
						label={t('compliance.consent.service')}
						rules={[{ required: true, message: t('compliance.consent.serviceRequired') }]}
					>
						<Input placeholder={t('compliance.consent.servicePlaceholder')} />
					</Form.Item>
					<Form.Item
						name="consentMethod"
						label={t('compliance.consent.consentMethod')}
						rules={[{ required: true }]}
						initialValue="explicit"
					>
						<Select
							options={[
								{ value: 'explicit', label: t('compliance.consent.methodExplicit') },
								{ value: 'implicit', label: t('compliance.consent.methodImplicit') },
							]}
						/>
					</Form.Item>
					<Form.Item
						name="granted"
						label={t('compliance.consent.status')}
						rules={[{ required: true }]}
						initialValue={true}
					>
						<Select
							options={[
								{ value: true, label: t('compliance.consent.granted') },
								{ value: false, label: t('compliance.consent.rejected') },
							]}
						/>
					</Form.Item>
				</Form>
			</Modal>

			{/* A-234（TASK-AB2-26）：创建擦除请求——userId 必填；dataCategories 必填（后端 CreateErasureRequest
			    binding: user_id* data_categories*，dto.go:311-316）；可选 DSAR 行预填 userId。 */}
			<Modal
				title={t('compliance.erasure.createTitle')}
				open={erasureModal}
				onCancel={() => {
					setErasureModal(false);
					erasureForm.resetFields();
				}}
				onOk={() => erasureForm.submit()}
				closable={{ 'aria-label': t('common.close') }}
				className="w-full max-w-[560px]"
			>
				<Form form={erasureForm} layout="vertical" onFinish={handleCreateErasure}>
					<Form.Item
						name="userId"
						label={t('compliance.erasure.userId')}
						rules={[{ required: true, message: t('compliance.erasure.userIdRequired') }]}
					>
						<Input placeholder={t('compliance.erasure.userIdPlaceholder')} />
					</Form.Item>
					<Form.Item
						name="dataCategories"
						label={t('compliance.erasure.dataCategories')}
						rules={[
							{
								required: true,
								type: 'array',
								min: 1,
								message: t('compliance.erasure.dataCategoriesRequired'),
							},
						]}
					>
						<Select
							mode="tags"
							placeholder={t('compliance.erasure.dataCategoriesPlaceholder')}
							options={[
								{ value: 'profile', label: 'profile' },
								{ value: 'history', label: 'history' },
							]}
						/>
					</Form.Item>
					<Form.Item name="reason" label={t('compliance.erasure.reason')}>
						<Input.TextArea
							rows={3}
							placeholder={t('compliance.erasure.reasonPlaceholder')}
						/>
					</Form.Item>
				</Form>
			</Modal>
		</div>
	);
}
