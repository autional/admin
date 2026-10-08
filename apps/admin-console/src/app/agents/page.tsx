'use client';

import React, { useState } from 'react';
import { DataTable } from '@autional/ui/antd';
import { Button, Space, Tag, Modal, Form, Input, InputNumber, Select, Popconfirm, Skeleton } from 'antd';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import {
	usePageTitle,
	useTenantSlug,
	useCurrentTenantId,
	extractItem,
	toPageParams,
	fromPageResult,
} from '@autional/shared';
import { buildNavHref } from '@/lib/nav';
import { AppPageHeader, EmptyState, ErrorState, StatusBadge } from '@autional/ui';
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
import { useOwnerDisplay } from '@/hooks/use-owner-display';
import { AGENT_STATUS_VARIANT, statusVariantOf } from '@/lib/nhi';
import type { AgentInfo, CreateAgentRequest } from '@autional/shared/generated/types';

/** 列表行 = 生成契约 AgentInfo（identity_id / rotation_days / jit_ttl 等经拦截器深 camel；列表 id 即 identityId）。 */
type AgentRecord = AgentInfo & { ownerPrincipalId?: string };

/** agent 状态选项 = 后端 AgentStatus 枚举全量（agent/domain/agent.go:17-24）单点。 */
const AGENT_STATUS_OPTIONS = ['provisioning', 'active', 'rotating', 'revoked', 'deleted'] as const;

const SUBTYPE_COLORS: Record<string, string> = {
	agent: 'blue',
	service_account: 'green',
	automation: 'orange',
};

function formatDate(iso: string): string {
	if (!iso) return '-';
	return new Date(iso).toLocaleDateString('zh-CN');
}

interface AgentsQuery {
	page: number;
	pageSize: number;
	status?: string;
}

async function fetchAgents(
	tenantId: string,
	params: AgentsQuery,
): Promise<{ items: AgentRecord[]; total: number }> {
	// A-76：服务端分页契约（toPageParams 单点转 wire page/page_size + status 透传；
	// 旧实现无参调用 → 后端默认 page_size=20 截断，21 条起永不可达）。
	const res = await adminAgents({
		tenant_id: tenantId,
		...toPageParams({ page: params.page, pageSize: params.pageSize }),
		...(params.status ? { status: params.status } : {}),
	});
	const paged = fromPageResult<AgentRecord>(res);
	return { items: paged.items, total: paged.total };
}

async function createAgent(values: CreateAgentRequest): Promise<AgentRecord | null> {
	// TASK-AB1-20 / A-74：去类型断言 —— camel 书面键经拦截器 snake 化上 wire（rotation_days / jit_ttl 为 number）。
	return extractItem<AgentRecord>(await adminAgentsPost(values));
}

async function revokeAgent(id: string): Promise<void> {
	// A-77：DELETE = RevokeAgent 软删除（status→revoked，handler:189-197），非物理删除。
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

	// A-76/A-77：服务端分页 + 状态筛选状态
	const [page, setPage] = useState(1);
	const [pageSize, setPageSize] = useState(10);
	const [statusFilter, setStatusFilter] = useState<string | undefined>(undefined);
	const queryParams: AgentsQuery = { page, pageSize, status: statusFilter };

	// A-78：owner_principal_id → 成员显示名解析（单点 hook，列表/详情共用）
	const { resolve: resolveOwner } = useOwnerDisplay();

	const {
		data,
		isLoading,
		error,
		refetch,
	} = useQuery({
		queryKey: queryKeys.agents.list(tenantId, queryParams),
		queryFn: () => fetchAgents(tenantId, queryParams),
		staleTime: 300000,
	});
	const agents = data?.items ?? [];
	const total = data?.total ?? 0;

	const createMut = useMutation({
		mutationFn: createAgent,
		onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.agents.all(tenantId) }),
	});

	const revokeMut = useMutation({
		mutationFn: revokeAgent,
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

	const handleRevoke = async (id: string) => {
		try {
			await revokeMut.mutateAsync(id);
			message.success(t('agents.revokeSuccess'));
		} catch (err) {
			handleApiError(err, t('agents.revokeFailed'));
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
					{t(`agents.type.${v}`, { defaultValue: v || '-' })}
				</Tag>
			),
		},
		{
			title: t('agents.column.status'),
			dataIndex: 'status',
			key: 'status',
			render: (v: string) => (
				<StatusBadge variant={statusVariantOf(AGENT_STATUS_VARIANT, v)}>
					{t(`agents.status.${v}`, { defaultValue: v || '-' })}
				</StatusBadge>
			),
		},
		{
			// A-78：owner 显示名（owner_principal_id 优先；历史行回退 owner_id；均无 → '-'）
			title: t('agents.column.owner'),
			key: 'owner',
			render: (_: unknown, record: AgentRecord) =>
				resolveOwner(record.ownerPrincipalId, record.ownerId),
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
						icon={<Pencil size="1em" />}
						onClick={(e) => {
							e.stopPropagation();
							navigate(buildNavHref(`/agents/${record.identityId ?? ''}`, tenantSlug));
						}}
					>
						{t('common.edit')}
					</Button>
					{/* A-77：DELETE 实为吊销（软删除 status→revoked），文案对齐语义 */}
					<Popconfirm
						title={t('agents.confirmRevoke')}
						description={t('agents.revokeWarning')}
						onConfirm={() => handleRevoke(record.identityId ?? '')}
						okText={t('agents.revoke')}
						okButtonProps={{ danger: true }}
						cancelText={t('common.cancel')}
					>
						<Button
							type="link"
							danger
							icon={<Trash2 size="1em" />}
							onClick={(e) => e.stopPropagation()}
						>
							{t('agents.revoke')}
						</Button>
					</Popconfirm>
				</Space>
			),
		},
	];

	return (
		<div>
			<AppPageHeader
				title={t('agents.title')}
				description={t('agents.subtitle')}
				actions={
					<Space>
						{/* A-77：状态筛选（后端 ListAgents status 过滤接线；旧实现无筛选 → 无法过滤已吊销） */}
						<Select
							allowClear
							placeholder={t('agents.filter.status')}
							value={statusFilter}
							onChange={(v) => {
								setStatusFilter(v);
								setPage(1);
							}}
							className="w-40"
							options={AGENT_STATUS_OPTIONS.map((s) => ({
								label: t(`agents.status.${s}`),
								value: s,
							}))}
						/>
						<Button
							type="primary"
							icon={<Plus size="1em" />}
							onClick={() => {
								form.resetFields();
								setModalVisible(true);
							}}
						>
							{t('agents.createBtn')}
						</Button>
					</Space>
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

			{/* A-80：删空态重复 CTA（页头 CTA 已同屏可复用） */}
			{!isLoading && !error && agents.length === 0 && (
				<EmptyState title={t('agents.emptyTitle')} description={t('agents.emptyDesc')} />
			)}

			{!isLoading && !error && agents.length > 0 && (
				<DataTable
					rowKey="identityId"
					columns={columns}
					dataSource={agents}
					pagination={{
						current: page,
						pageSize,
						total,
						showSizeChanger: false,
						onChange: (p, ps) => {
							setPage(p);
							setPageSize(ps);
						},
					}}
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
								{ value: 'agent', label: t('agents.type.agent') },
								{ value: 'service_account', label: t('agents.type.service_account') },
								{ value: 'automation', label: t('agents.type.automation') },
							]}
						/>
					</Form.Item>
					<Form.Item name="rotationDays" label={t('agents.form.rotationDays')} initialValue={90}>
						{/* TASK-AB1-20 / A-74：InputNumber（value 恒 number）；范围对齐后端 binding omitempty,min=1,max=3650 */}
						<InputNumber min={1} max={3650} placeholder="90" className="w-full" />
					</Form.Item>
					{/* A-78：JIT TTL label 收编 i18n（旧硬编码 "JIT TTL" 字符串） */}
					<Form.Item name="jitTtl" label={t('agents.form.jitTtl')} initialValue={3600}>
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
