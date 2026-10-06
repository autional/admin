'use client';

import React, { useState } from 'react';
import { DataTable } from '@autional/ui/antd';
import { Button, Space, Tag, Modal, Form, Input, InputNumber, Select, Popconfirm, Skeleton } from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined } from '@ant-design/icons';
import { usePageTitle, useTenantSlug, useCurrentTenantId, extractList, extractItem } from '@autional/shared';
import { buildNavHref } from '@/lib/nav';
import { ConsolePageHeader, EmptyState, ErrorState, StatusBadge } from '@autional/ui';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
	adminAgents,
	adminAgentsPost,
	adminAgentsByAgentsDelete,
} from '@autional/shared/generated/api';
import { useNavigate } from 'react-router';
import { useTranslation } from 'react-i18next';
import { message } from '@/lib/antd-app';
import { handleApiError } from '@/lib/error-handler';
import { queryKeys } from '@/lib/query-keys';
import type { AgentInfo, CreateAgentRequest } from '@autional/shared/generated/types';

/** 列表行 = 生成契约 AgentInfo（identity_id / rotation_days / jit_ttl 等经拦截器深 camel；列表 id 即 identityId）。 */
type AgentRecord = AgentInfo;

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

async function fetchAgents(): Promise<AgentRecord[]> {
	// TASK-AB1-20 / A-74：形状适配单点（extractList 解包 + 契约 camel 字段直读），删除双读兼容分支。
	return extractList<AgentRecord>(await adminAgents());
}

async function createAgent(values: CreateAgentRequest): Promise<AgentRecord | null> {
	// TASK-AB1-20 / A-74：去类型断言 —— camel 书面键经拦截器 snake 化上 wire（rotation_days / jit_ttl 为 number）。
	return extractItem<AgentRecord>(await adminAgentsPost(values));
}

async function deleteAgent(id: string): Promise<void> {
	await adminAgentsByAgentsDelete(id);
}

export default function AgentsPage() {
	const { t } = useTranslation();
	usePageTitle(t('agents.title'));
	const navigate = useNavigate();
	const tenantSlug = useTenantSlug();
	const queryClient = useQueryClient();
	const tenantId = useCurrentTenantId() ?? '';
	const [modalVisible, setModalVisible] = useState(false);
	const [form] = Form.useForm();

	const {
		data: agents = [],
		isLoading,
		error,
		refetch,
	} = useQuery({
		queryKey: queryKeys.agents.all(tenantId),
		queryFn: fetchAgents,
		staleTime: 300000,
	});

	const createMut = useMutation({
		mutationFn: createAgent,
		onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.agents.all(tenantId) }),
	});

	const deleteMut = useMutation({
		mutationFn: deleteAgent,
		onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.agents.all(tenantId) }),
	});

	const handleCreate = async (values: CreateAgentRequest) => {
		try {
			await createMut.mutateAsync(values);
			message.success(t('agents.createSuccess'));
			setModalVisible(false);
			form.resetFields();
		} catch (err) {
			handleApiError(err, t('agents.createFailed'));
		}
	};

	const handleDelete = async (id: string) => {
		try {
			await deleteMut.mutateAsync(id);
			message.success(t('agents.deleteSuccess'));
		} catch (err) {
			handleApiError(err, t('agents.deleteFailed'));
		}
	};

	const columns = [
		{
			title: t('agents.column.name'),
			dataIndex: 'name',
			key: 'name',
			render: (v: string, record: AgentRecord) => (
				<a
					onClick={() => navigate(buildNavHref(`/agents/${record.identityId ?? ''}`, tenantSlug))}
					className="font-medium"
				>
					{v}
				</a>
			),
		},
		{
			title: t('agents.column.subtype'),
			dataIndex: 'workloadSubtype',
			key: 'workloadSubtype',
			render: (v: string) => (
				<Tag color={SUBTYPE_COLORS[v] || 'default'}>
					{t(`agents.type.${v}`, { defaultValue: SUBTYPE_LABELS[v] || v || '-' })}
				</Tag>
			),
		},
		{
			title: t('agents.column.status'),
			dataIndex: 'status',
			key: 'status',
			render: (v: string) => (
				<StatusBadge variant={statusVariant(v)}>
					{t(`agents.status.${v}`, { defaultValue: v || '-' })}
				</StatusBadge>
			),
		},
		{
			title: t('agents.column.owner'),
			dataIndex: 'ownerId',
			key: 'ownerId',
			render: (v: string) => v || '-',
		},
		{
			title: t('agents.column.created'),
			dataIndex: 'createdAt',
			key: 'createdAt',
			render: (v: string | undefined) => formatDate(v ?? ''),
		},
		{
			title: t('agents.column.actions'),
			key: 'action',
			render: (_: unknown, record: AgentRecord) => (
				<Space size="small">
					<Button
						type="link"
						icon={<EditOutlined />}
						onClick={(e) => {
							e.stopPropagation();
							navigate(buildNavHref(`/agents/${record.identityId ?? ''}`, tenantSlug));
						}}
					>
						{t('common.edit')}
					</Button>
					<Popconfirm
						title={t('agents.confirmDelete')}
						description={t('agents.deleteWarning')}
						onConfirm={() => handleDelete(record.identityId ?? '')}
						okText={t('common.delete')}
						okButtonProps={{ danger: true }}
						cancelText={t('common.cancel')}
					>
						<Button
							type="link"
							danger
							icon={<DeleteOutlined />}
							onClick={(e) => e.stopPropagation()}
						>
							{t('common.delete')}
						</Button>
					</Popconfirm>
				</Space>
			),
		},
	];

	return (
		<div className="p-6">
			<ConsolePageHeader
				title={t('agents.title')}
				description={t('agents.subtitle')}
				actions={
					<Button
						type="primary"
						icon={<PlusOutlined />}
						onClick={() => {
							form.resetFields();
							setModalVisible(true);
						}}
					>
						{t('agents.createBtn')}
					</Button>
				}
			/>

			{isLoading && (
				<div className="space-y-3">
					<Skeleton active />
					<Skeleton active />
					<Skeleton active />
				</div>
			)}

			{!isLoading && error && (
				<ErrorState
					title={t('agents.loadError')}
					message={t('agents.loadErrorHint')}
					onRetry={() => refetch()}
				/>
			)}

			{!isLoading && !error && agents.length === 0 && (
				<div className="flex flex-col items-center gap-4">
					<EmptyState title={t('agents.emptyTitle')} description={t('agents.emptyDesc')} />
					<Button
						type="primary"
						icon={<PlusOutlined />}
						onClick={() => {
							form.resetFields();
							setModalVisible(true);
						}}
					>
						{t('agents.createBtn')}
					</Button>
				</div>
			)}

			{!isLoading && !error && agents.length > 0 && (
				<DataTable
					rowKey="identityId"
					columns={columns}
					dataSource={agents}
					pagination={{ pageSize: 10 }}
					scroll={{ x: 800 }}
					onRow={(record) => ({
						onClick: () => navigate(buildNavHref(`/agents/${record.identityId ?? ''}`, tenantSlug)),
						style: { cursor: 'pointer' },
					})}
				/>
			)}

			<Modal
				title={t('agents.createBtn')}
				open={modalVisible}
				onCancel={() => {
					setModalVisible(false);
					form.resetFields();
				}}
				onOk={() => form.submit()}
				confirmLoading={createMut.isPending}
				destroyOnHidden
				className="w-full max-w-[560px]"
			>
				<Form form={form} layout="vertical" onFinish={handleCreate}>
					<Form.Item name="name" label={t('common.name')} rules={[{ required: true }]}>
						<Input placeholder={t('agents.form.namePlaceholder')} />
					</Form.Item>
					<Form.Item name="description" label={t('common.description')}>
						<Input.TextArea rows={3} placeholder={t('agents.form.descPlaceholder')} />
					</Form.Item>
					<Form.Item
						name="workloadSubtype"
						label={t('agents.form.subtype')}
						rules={[{ required: true }]}
						initialValue="agent"
					>
						<Select
							options={[
								{ value: 'agent', label: t('agents.subtype.agent') },
								{ value: 'service_account', label: t('agents.subtype.serviceAccount') },
								{ value: 'automation', label: t('agents.subtype.automation') },
							]}
						/>
					</Form.Item>
					<Form.Item name="rotationDays" label={t('agents.form.rotationDays')} initialValue={90}>
						{/* TASK-AB1-20 / A-74：InputNumber（value 恒 number）；范围对齐后端 binding omitempty,min=1,max=3650 */}
						<InputNumber min={1} max={3650} placeholder="90" className="w-full" />
					</Form.Item>
					<Form.Item name="jitTtl" label="JIT TTL" initialValue={3600}>
						{/* TASK-AB1-20 / A-74：Select 秒值选项（后端 jit_ttl int seconds, min=60）；提交值为 number */}
						<Select
							options={[
								{ value: 300, label: '5m' },
								{ value: 900, label: '15m' },
								{ value: 1800, label: '30m' },
								{ value: 3600, label: '1h' },
							]}
						/>
					</Form.Item>
				</Form>
			</Modal>
		</div>
	);
}
