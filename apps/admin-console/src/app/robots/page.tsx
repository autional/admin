'use client';

import React, { useState } from 'react';
import { DataTable } from '@autional/ui/antd';
import { Button, Space, Modal, Form, Input, Select, Popconfirm, Skeleton } from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined } from '@ant-design/icons';
import { usePageTitle, useTenantSlug, useCurrentTenantId } from '@autional/shared';
import { buildNavHref } from '@/lib/nav';
import { ConsolePageHeader, EmptyState, ErrorState, StatusBadge } from '@autional/ui';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient, extractItem, extractList } from '@autional/shared';
import type { RobotInfo } from '@autional/shared/generated/types';
import {
	adminRobots,
	adminRobotsPost,
	adminRobotsByRobotsDelete,
} from '@autional/shared/generated/api';
import { useNavigate } from 'react-router';
import { useTranslation } from 'react-i18next';
import { message } from '@/lib/antd-app';
import { handleApiError } from '@/lib/error-handler';
import { queryKeys } from '@/lib/query-keys';


// TASK-AB1-27（RC-5 契约收敛）：契约类型直读（generated types，键名 camel）。
// wire 锚：service-identity robot/domain/robot.go:90-92（workload_subtype/firmware_ver snake json tag）
// 经响应拦截器深 camel 化；主键 = identityId（契约无 id）。
type RobotRecord = RobotInfo;

const STATUS_VARIANT: Record<string, 'success' | 'warning' | 'danger' | 'info' | 'neutral'> = {
	active: 'success',
	offline: 'danger',
	maintenance: 'warning',
	provisioning: 'info',
};

function statusVariant(s: string): 'success' | 'warning' | 'danger' | 'info' | 'neutral' {
	return STATUS_VARIANT[s] || 'neutral';
}

function formatDate(iso: string): string {
	if (!iso) return '-';
	return new Date(iso).toLocaleDateString('zh-CN');
}

async function fetchRobots(): Promise<RobotRecord[]> {
	const res = await adminRobots();
	// generated 已解包 + 拦截器 camel：列表归一单点 = extractList
	return extractList<RobotRecord>(res);
}

async function createRobot(values: Record<string, unknown>): Promise<RobotRecord> {
	const res = await adminRobotsPost(values);
	return extractItem(res) ?? ({} as RobotRecord);
}

async function deleteRobot(id: string): Promise<void> {
	await adminRobotsByRobotsDelete(id);
}

export default function RobotsPage() {
	const { t } = useTranslation();
	usePageTitle(t('robots.title'));
	const navigate = useNavigate();
	const tenantSlug = useTenantSlug();
	const queryClient = useQueryClient();
	const tenantId = useCurrentTenantId() ?? '';
	const [modalVisible, setModalVisible] = useState(false);
	const [form] = Form.useForm();

	const {
		data: robots = [],
		isLoading,
		error,
		refetch,
	} = useQuery({
		queryKey: queryKeys.robots.all(tenantId),
		queryFn: fetchRobots,
		staleTime: 300000,
	});

	const createMut = useMutation({
		mutationFn: createRobot,
		onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.robots.all(tenantId) }),
	});

	const deleteMut = useMutation({
		mutationFn: deleteRobot,
		onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.robots.all(tenantId) }),
	});

	const handleCreate = async (values: Record<string, unknown>) => {
		try {
			await createMut.mutateAsync(values);
			message.success(t('robots.createSuccess'));
			setModalVisible(false);
			form.resetFields();
		} catch (err) {
			handleApiError(err, t('robots.createFailed'));
		}
	};

	const handleDelete = async (id: string) => {
		try {
			await deleteMut.mutateAsync(id);
			message.success(t('robots.deleteSuccess'));
		} catch (err) {
			handleApiError(err, t('robots.deleteFailed'));
		}
	};

	const columns = [
		{
			title: t('robots.column.name'),
			dataIndex: 'name',
			key: 'name',
			render: (v: string, record: RobotRecord) => (
				<a onClick={() => navigate(buildNavHref(`/robots/${record.identityId ?? ''}`, tenantSlug))} className="font-medium">
					{v}
				</a>
			),
		},
		{
			title: t('robots.column.model'),
			dataIndex: 'model',
			key: 'model',
			render: (v: string) => v || '-',
		},
		{
			title: t('robots.column.location'),
			dataIndex: 'location',
			key: 'location',
			render: (v: string) => v || '-',
		},
		{
			title: t('robots.column.status'),
			dataIndex: 'status',
			key: 'status',
			render: (v: string) => (
				<StatusBadge variant={statusVariant(v)}>
					{t(`robots.status.${v}`, { defaultValue: v || '-' })}
				</StatusBadge>
			),
		},
		{
			title: t('robots.column.owner'),
			dataIndex: 'ownerId',
			key: 'ownerId',
			render: (v: string) => v || '-',
		},
		{
			title: t('robots.column.created'),
			dataIndex: 'createdAt',
			key: 'createdAt',
			render: (v: string) => formatDate(v),
		},
		{
			title: t('robots.column.actions'),
			key: 'action',
			render: (_: unknown, record: RobotRecord) => (
				<Space size="small">
					<Button
						type="link"
						icon={<EditOutlined />}
						onClick={(e) => {
							e.stopPropagation();
							navigate(buildNavHref(`/robots/${record.identityId ?? ''}`, tenantSlug));
						}}
					>
						{t('common.edit')}
					</Button>
					<Popconfirm
						title={t('robots.confirmDelete')}
						description={t('robots.deleteWarning')}
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
				title={t('robots.title')}
				description={t('robots.subtitle')}
				actions={
					<Button
						type="primary"
						icon={<PlusOutlined />}
						onClick={() => {
							form.resetFields();
							setModalVisible(true);
						}}
					>
						{t('robots.createBtn')}
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
					title={t('robots.loadError')}
					message={t('robots.loadErrorHint')}
					onRetry={() => refetch()}
				/>
			)}

			{!isLoading && !error && robots.length === 0 && (
				<div className="flex flex-col items-center gap-4">
					<EmptyState title={t('robots.emptyTitle')} description={t('robots.emptyDesc')} />
					<Button
						type="primary"
						icon={<PlusOutlined />}
						onClick={() => {
							form.resetFields();
							setModalVisible(true);
						}}
					>
						{t('robots.createBtn')}
					</Button>
				</div>
			)}

			{!isLoading && !error && robots.length > 0 && (
				<DataTable
					rowKey="identityId"
					columns={columns}
					dataSource={robots}
					pagination={{ pageSize: 10 }}
					scroll={{ x: 800 }}
					onRow={(record) => ({
						onClick: () => navigate(buildNavHref(`/robots/${record.identityId ?? ''}`, tenantSlug)),
						style: { cursor: 'pointer' },
					})}
				/>
			)}

			<Modal
				title={t('robots.createBtn')}
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
						<Input placeholder={t('robots.form.namePlaceholder')} />
					</Form.Item>
					<Form.Item name="model" label={t('robots.form.model')}>
						<Input placeholder={t('robots.form.modelPlaceholder')} />
					</Form.Item>
					<Form.Item name="location" label={t('robots.form.location')}>
						<Input placeholder={t('robots.form.locationPlaceholder')} />
					</Form.Item>
					<Form.Item
						name="workloadSubtype"
						label={t('robots.form.subtype')}
						rules={[{ required: true }]}
						initialValue="industrial"
					>
						<Select
							options={[
								{ value: 'industrial', label: t('robotDetail.subtype.industrial') },
								{ value: 'vehicle', label: t('robotDetail.subtype.vehicle') },
								{ value: 'drone', label: t('robotDetail.subtype.drone') },
							]}
						/>
					</Form.Item>
					<Form.Item name="firmwareVer" label={t('robots.form.firmware')}>
						<Input placeholder={t('robots.form.firmwarePlaceholder')} />
					</Form.Item>
				</Form>
			</Modal>
		</div>
	);
}
