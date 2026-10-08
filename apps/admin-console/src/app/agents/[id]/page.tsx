'use client';
// @generated-api-exempt: 2 key(s) [IDENTITY.ADMIN_AGENTS_ACTIVITY, IDENTITY.ADMIN_AGENTS_PERMISSIONS] lack generated func

import React, { useState } from 'react';
import { DataTable } from '@autional/ui/antd';
import { useParams, useNavigate } from 'react-router';
import { Button, Tag, Modal, Form, Input, Select, Skeleton, Descriptions } from 'antd';
import { EditOutlined, ArrowLeftOutlined } from '@ant-design/icons';
import { usePageTitle, useTenantSlug, useCurrentTenantId } from '@autional/shared';
import { buildNavHref } from '@/lib/nav';
import { AppPageHeader, EmptyState, ErrorState, SectionCard, StatusBadge } from '@autional/ui';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient, API_PATHS, extractList } from '@autional/shared';
import type {
	AgentInfo,
	AgentActivityInfo,
	AgentCredentialInfo,
	AgentPermissionInfo,
} from '@autional/shared/generated/types';
import {
	adminAgentsByAgents,
	adminAgentsCredentialsByAgents,
	adminAgentsByAgentsPut,
} from '@autional/shared/generated/api';
import { message } from '@/lib/antd-app';
import { handleApiError } from '@/lib/error-handler';
import { queryKeys } from '@/lib/query-keys';

import { useTranslation } from 'react-i18next';

// TASK-AB1-27（RC-5 契约收敛）：契约类型直读（generated types，键名 camel），删除手写 snake 接口。
// wire 锚：service-identity agent/domain/agent.go:76-135 经响应拦截器 camel 化（identityId/workloadSubtype/…）。
type AgentDetail = AgentInfo;
type CredentialRecord = AgentCredentialInfo;
type ActivityRecord = AgentActivityInfo;
type PermissionRecord = AgentPermissionInfo;

const SUBTYPE_LABELS: Record<string, string> = {
	agent: 'Agent',
	service_account: 'Service Account',
	automation: 'Automation',
};

const SUBTYPE_COLORS: Record<string, string> = {
	agent: 'blue',
	service_account: 'green',
	automation: 'orange',
};

const STATUS_VARIANT: Record<string, 'success' | 'warning' | 'danger' | 'info' | 'neutral'> = {
	active: 'success',
	disabled: 'danger',
	suspended: 'warning',
	provisioning: 'info',
};

function statusVariant(s: string): 'success' | 'warning' | 'danger' | 'info' | 'neutral' {
	return STATUS_VARIANT[s] || 'neutral';
}

function formatDate(iso: string): string {
	if (!iso) return '-';
	return new Date(iso).toLocaleDateString('zh-CN');
}

async function fetchAgent(id: string): Promise<AgentDetail> {
	const res = await adminAgentsByAgents(id);
	// RC-5：generated 已解包 + 拦截器深 camel ⇒ res 即 AgentInfo（契约直读，禁止 snake 双读兼容）
	return (res ?? {}) as AgentDetail;
}

async function fetchCredentials(id: string): Promise<CredentialRecord[]> {
	const res = await adminAgentsCredentialsByAgents(id);
	// 列表归一单点 = extractList（信封 items 分支；键名已由拦截器 camel）
	return extractList<CredentialRecord>(res);
}

async function fetchActivity(id: string): Promise<ActivityRecord[]> {
	try {
		const res = await apiClient.get(API_PATHS.IDENTITY.ADMIN_AGENTS_ACTIVITY(id));
		return extractList<ActivityRecord>(res.data);
	} catch (err: any) {
		// 后端暂无该端点 → 404，降级为空列表；其它错误继续抛出
		if (err?.response?.status === 404 || err?.status === 404) return [];
		throw err;
	}
}

async function fetchPermissions(id: string): Promise<PermissionRecord[]> {
	try {
		const res = await apiClient.get(API_PATHS.IDENTITY.ADMIN_AGENTS_PERMISSIONS(id));
		return extractList<PermissionRecord>(res.data);
	} catch (err: any) {
		// 后端暂无该端点 → 404，降级为空列表；其它错误继续抛出
		if (err?.response?.status === 404 || err?.status === 404) return [];
		throw err;
	}
}

async function updateAgent(id: string, values: Record<string, unknown>): Promise<AgentDetail> {
	const res = await adminAgentsByAgentsPut(id, values);
	// generated 已解包 + 拦截器 camel ⇒ res 即 AgentInfo；PUT 契约 UpdateAgentRequest 仅
	// {name,description,callbackUrl}（identity agent.go:104-108），其余提交键后端静默忽略。
	return res as AgentDetail;
}

export default function AgentDetailPage() {
	const { t } = useTranslation();
	const { id } = useParams<{ id: string }>();
	const navigate = useNavigate();
	const tenantSlug = useTenantSlug();
	const queryClient = useQueryClient();
	const tenantId = useCurrentTenantId() ?? '';
	const [editVisible, setEditVisible] = useState(false);
	const [form] = Form.useForm();

	const {
		data: agent,
		isLoading,
		error,
		refetch,
	} = useQuery({
		queryKey: queryKeys.agents.detail(tenantId, id!),
		queryFn: () => fetchAgent(id!),
		enabled: !!id,
		staleTime: 300000,
	});

	const { data: credentials = [], isLoading: credLoading } = useQuery({
		queryKey: queryKeys.agents.credentials(tenantId, id!),
		queryFn: () => fetchCredentials(id!),
		enabled: !!id,
		staleTime: 300000,
	});

	const { data: activity = [], isLoading: actLoading } = useQuery({
		queryKey: queryKeys.agents.activity(tenantId, id!),
		queryFn: () => fetchActivity(id!),
		enabled: !!id,
		staleTime: 60000,
	});

	const { data: permissions = [], isLoading: permLoading } = useQuery({
		queryKey: queryKeys.agents.permissions(tenantId, id!),
		queryFn: () => fetchPermissions(id!),
		enabled: !!id,
		staleTime: 300000,
	});

	const updateMut = useMutation({
		mutationFn: ({ id: agentId, values }: { id: string; values: Record<string, unknown> }) =>
			updateAgent(agentId, values),
		onSuccess: () => {
			queryClient.invalidateQueries({
				queryKey: queryKeys.agents.detail(tenantId, id!) as unknown as readonly unknown[],
			});
			queryClient.invalidateQueries({
				queryKey: queryKeys.agents.all(tenantId) as unknown as readonly unknown[],
			});
		},
	});

	usePageTitle(agent?.name ? `${agent.name} - ${t('agents.title')}` : t('agents.detail.title'));

	const handleEdit = async (values: Record<string, unknown>) => {
		if (!id) return;
		try {
			await updateMut.mutateAsync({ id, values });
			message.success(t('agents.updateSuccess'));
			setEditVisible(false);
		} catch (err) {
			handleApiError(err, t('agents.updateFailed'));
		}
	};

	const openEdit = () => {
		if (!agent) return;
		form.setFieldsValue({
			name: agent.name,
			description: agent.description,
			workloadSubtype: agent.workloadSubtype,
			rotationDays: agent.rotationDays,
			jitTtl: agent.jitTtl,
		});
		setEditVisible(true);
	};

	const credentialColumns = [
		{ title: t('agents.detail.column.name'), dataIndex: 'name', key: 'name' },
		{
			title: t('agents.detail.column.type'),
			dataIndex: 'credType',
			key: 'credType',
			render: (v: string) => <Tag>{v || '-'}</Tag>,
		},
		{
			title: t('agents.detail.column.status'),
			dataIndex: 'status',
			key: 'status',
			render: (v: string) => (
				<StatusBadge variant={v === 'active' ? 'success' : 'neutral'}>
					{t(`agents.status.${v}`, { defaultValue: v || '-' })}
				</StatusBadge>
			),
		},
		// 注：AgentCredentialInfo（generated types.ts:4072-4080）未下发 lastUsedAt/expiresAt，
		// 契约键直读后两列恒 '-'（backend agent.go 无该字段——残留观察，非本 TASK 收敛范围）
		{
			title: t('agents.detail.column.lastUsed'),
			dataIndex: 'lastUsedAt',
			key: 'lastUsedAt',
			render: (v: string) => formatDate(v),
		},
		{
			title: t('agents.detail.column.expires'),
			dataIndex: 'expiresAt',
			key: 'expiresAt',
			render: (v: string) => formatDate(v),
		},
	];

	const activityColumns = [
		{
			title: t('agents.detail.column.action'),
			dataIndex: 'action',
			key: 'action',
			render: (v: string) => <Tag>{v}</Tag>,
		},
		{
			title: t('agents.detail.column.detail'),
			dataIndex: 'detail',
			key: 'detail',
			ellipsis: true,
		},
		{
			title: t('agents.detail.column.time'),
			dataIndex: 'createdAt',
			key: 'createdAt',
			render: (v: string) => formatDate(v),
		},
	];

	const permissionColumns = [
		{ title: t('agents.detail.column.resource'), dataIndex: 'resource', key: 'resource' },
		{
			title: t('agents.detail.column.action'),
			dataIndex: 'action',
			key: 'action',
			render: (v: string) => <Tag color="blue">{v}</Tag>,
		},
	];

	if (!id) {
		return (
			<div className="p-6">
				<ErrorState title={t('agents.detail.invalidId')} message={t('agents.detail.invalidIdMessage')} />
			</div>
		);
	}

	return (
		<div className="p-6">
			<div className="mb-6">
				<Button
					type="text"
					icon={<ArrowLeftOutlined />}
					onClick={() => navigate(buildNavHref('/agents', tenantSlug))}
					className="mb-4 pl-0"
				>
					{t('agents.backToAgents')}
				</Button>
				<div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
					<AppPageHeader
						title={agent?.name || t('agents.detail.title')}
						description={agent?.description || t('common.loading')}
					/>
					{agent && (
						<Button icon={<EditOutlined />} onClick={openEdit}>
							{t('agents.detail.editBtn')}
						</Button>
					)}
				</div>
			</div>

			{isLoading && (
				<div className="space-y-4">
					<Skeleton active paragraph={{ rows: 4 }} />
					<Skeleton active paragraph={{ rows: 3 }} />
					<Skeleton active paragraph={{ rows: 3 }} />
				</div>
			)}

			{!isLoading && error && (
				<ErrorState
					title={t('agents.detail.errorLoad')}
					message={t('agents.detail.errorRetry')}
					onRetry={() => refetch()}
				/>
			)}

			{!isLoading && !error && agent && (
				<>
				<SectionCard title={t('agents.detail.information')} className="mb-6">
					<Descriptions column={2} bordered size="small">
						<Descriptions.Item label={t('agents.detail.label.name')}>{agent.name}</Descriptions.Item>
						<Descriptions.Item label={t('agents.detail.label.status')}>
							<StatusBadge variant={statusVariant(agent.status || '')}>
								{t(`agents.status.${agent.status}`, { defaultValue: agent.status })}
							</StatusBadge>
						</Descriptions.Item>
						<Descriptions.Item label={t('agents.detail.label.subtype')}>
							<Tag color={SUBTYPE_COLORS[agent.workloadSubtype || ''] || 'default'}>
								{t(`agents.type.${agent.workloadSubtype}`, {
									defaultValue: SUBTYPE_LABELS[agent.workloadSubtype || ''] || agent.workloadSubtype,
								})}
							</Tag>
						</Descriptions.Item>
						<Descriptions.Item label={t('agents.detail.label.owner')}>
							{agent.ownerId || '-'}
						</Descriptions.Item>
						<Descriptions.Item label={t('agents.detail.label.rotationDays')}>
							{agent.rotationDays ?? '-'}
						</Descriptions.Item>
						<Descriptions.Item label={t('agents.detail.label.jitTtl')}>
							{agent.jitTtl || '-'}
						</Descriptions.Item>
						<Descriptions.Item label={t('agents.detail.label.created')}>
							{formatDate(agent.createdAt || '')}
						</Descriptions.Item>
						<Descriptions.Item label={t('agents.detail.label.updated')}>
							{formatDate(agent.updatedAt || '')}
						</Descriptions.Item>
					</Descriptions>
				</SectionCard>

					<SectionCard title={t('agents.detail.credentials')} className="mb-6">
						{credLoading ? (
							<Skeleton active paragraph={{ rows: 2 }} />
						) : credentials.length === 0 ? (
							<EmptyState
								title={t('agents.detail.emptyCredentials')}
								description={t('agents.detail.emptyCredentialsDesc')}
							/>
						) : (
							<DataTable
								rowKey="id"
								columns={credentialColumns}
								dataSource={credentials}
								pagination={false}
								size="small"
								scroll={{ x: 800 }}
							/>
						)}
					</SectionCard>

					<SectionCard title={t('agents.detail.activity')} className="mb-6">
						{actLoading ? (
							<Skeleton active paragraph={{ rows: 3 }} />
						) : activity.length === 0 ? (
							<EmptyState
								title={t('agents.detail.emptyActivity')}
								description={t('agents.detail.emptyActivityDesc')}
							/>
						) : (
							<DataTable
								rowKey="createdAt"
								columns={activityColumns}
								dataSource={activity}
								pagination={false}
								size="small"
								scroll={{ x: 800 }}
							/>
						)}
					</SectionCard>

					<SectionCard title={t('agents.detail.permissions')} className="mb-6">
						{permLoading ? (
							<Skeleton active paragraph={{ rows: 2 }} />
						) : permissions.length === 0 ? (
							<EmptyState
								title={t('agents.detail.emptyPermissions')}
								description={t('agents.detail.emptyPermissionsDesc')}
							/>
						) : (
							<DataTable
								rowKey="code"
								columns={permissionColumns}
								dataSource={permissions}
								pagination={false}
								size="small"
								scroll={{ x: 800 }}
							/>
						)}
					</SectionCard>
				</>
			)}

			<Modal
				title={t('agents.detail.editBtn')}
				open={editVisible}
				onCancel={() => {
					setEditVisible(false);
					form.resetFields();
				}}
				onOk={() => form.submit()}
				confirmLoading={updateMut.isPending}
				destroyOnHidden
				className="w-full max-w-[560px]"
			>
				<Form form={form} layout="vertical" onFinish={handleEdit}>
					<Form.Item
						name="name"
						label={t('agents.detail.form.name')}
						rules={[{ required: true }]}
					>
						<Input placeholder={t('agents.detail.form.namePlaceholder')} />
					</Form.Item>
					<Form.Item name="description" label={t('agents.detail.form.description')}>
						<Input.TextArea rows={3} placeholder={t('agents.detail.form.descriptionPlaceholder')} />
					</Form.Item>
					<Form.Item
						name="workloadSubtype"
						label={t('agents.detail.form.subtype')}
						rules={[{ required: true }]}
					>
						<Select
							options={[
								{ value: 'agent', label: t('agents.type.agent') },
								{ value: 'service_account', label: t('agents.type.service_account') },
								{ value: 'automation', label: t('agents.type.automation') },
							]}
						/>
					</Form.Item>
					<Form.Item name="rotationDays" label={t('agents.detail.form.rotationDays')}>
						<Input type="number" placeholder="90" />
					</Form.Item>
					<Form.Item name="jitTtl" label={t('agents.detail.form.jitTtl')}>
						<Input placeholder={t('agents.detail.form.jitTtlPlaceholder')} />
					</Form.Item>
				</Form>
			</Modal>
		</div>
	);
}
