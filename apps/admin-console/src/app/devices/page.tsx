'use client';

import React, { useState } from 'react';
import { DataTable } from '@autional/ui/antd';
import { Button, Space, Modal, Form, Input, Select, Popconfirm, Skeleton } from 'antd';
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
import type { DeviceInfo } from '@autional/shared/generated/types';
import {
	adminIots,
	adminIotsPost,
	adminIotsByIotsDelete,
} from '@autional/shared/generated/api';
import { useNavigate } from 'react-router';
import { useTranslation } from 'react-i18next';
import { message } from '@/lib/antd-app';
import { handleApiError } from '@/lib/error-handler';
import { queryKeys } from '@/lib/query-keys';
import { useOwnerDisplay } from '@/hooks/use-owner-display';
import { DEVICE_STATUS_VARIANT, statusVariantOf } from '@/lib/nhi';

// W1b（A-93）：常量收敛 —— 旧实现直连 api-paths 三同 URL 常量（ADMIN_DEVICES/ADMIN_DEVICE/ADMIN_IOT）
// 并挂 generated-api 豁免标记；现改 generated api 单点（adminIots*），豁免标记随之移除（本页零豁免）。

// TASK-AB1-27（RC-5 契约收敛）：契约类型直读（generated types，键名 camel）。
// wire 锚：service-identity device/domain/device.go:86-89（workload_subtype/hardware_id/firmware_ver snake json tag）
// 经响应拦截器深 camel 化；主键 = identityId（契约无 id）。
// W1b（A-89）：owner_principal_id 为 additive 增量键（generated 快照未含）→ 局部增强类型。
type DeviceRecord = DeviceInfo & { ownerPrincipalId?: string };

const TYPE_VARIANT: Record<string, 'success' | 'warning' | 'danger' | 'info' | 'neutral'> = {
	pet: 'info',
	smart_home: 'success',
	office: 'warning',
	sensor: 'info',
};

function typeVariant(s: string): 'success' | 'warning' | 'danger' | 'info' | 'neutral' {
	return TYPE_VARIANT[s] || 'neutral';
}

/** device 状态选项 = 后端 DeviceStatus 实际可写入全量（device/domain/device.go:22-28）。 */
const DEVICE_STATUS_OPTIONS = ['unpaired', 'active', 'transferring'] as const;

function formatDate(iso: string): string {
	if (!iso) return '-';
	return new Date(iso).toLocaleDateString('zh-CN');
}

interface DevicesQuery {
	page: number;
	pageSize: number;
	status?: string;
}

async function fetchDevices(
	params: DevicesQuery,
): Promise<{ items: DeviceRecord[]; total: number }> {
	// A-90：服务端分页契约（toPageParams 单点转 wire page/page_size + status 透传；
	// 旧实现无参调用 → 后端默认 page_size=20 截断，21 条起永不可达）。
	const res = await adminIots({
		...toPageParams({ page: params.page, pageSize: params.pageSize }),
		...(params.status ? { status: params.status } : {}),
	});
	const paged = fromPageResult<DeviceRecord>(res);
	return { items: paged.items, total: paged.total };
}

async function createDevice(values: Record<string, unknown>): Promise<DeviceRecord> {
	const res = await adminIotsPost(values);
	return extractItem(res) ?? ({} as DeviceRecord);
}

async function deleteDevice(id: string): Promise<void> {
	await adminIotsByIotsDelete(id);
}

export default function DevicesPage() {
	const { t } = useTranslation();
	usePageTitle(t('devices.title'));
	const navigate = useNavigate();
	const tenantSlug = useTenantSlug();
	const queryClient = useQueryClient();
	const tenantId = useCurrentTenantId() ?? '';
	const [modalVisible, setModalVisible] = useState(false);
	const [form] = Form.useForm();

	// A-90：服务端分页 + 状态筛选状态
	const [page, setPage] = useState(1);
	const [pageSize, setPageSize] = useState(10);
	const [statusFilter, setStatusFilter] = useState<string | undefined>(undefined);
	const queryParams: DevicesQuery = { page, pageSize, status: statusFilter };

	// A-89：owner_principal_id → 成员显示名解析（列表/详情共用单点 hook）
	const { resolve: resolveOwner } = useOwnerDisplay();

	const {
		data,
		isLoading,
		error,
		refetch,
	} = useQuery({
		queryKey: queryKeys.devices.list(tenantId, queryParams),
		queryFn: () => fetchDevices(queryParams),
		staleTime: 300000,
	});
	const devices = data?.items ?? [];
	const total = data?.total ?? 0;

	const createMut = useMutation({
		mutationFn: createDevice,
		onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.devices.all(tenantId) }),
	});

	const deleteMut = useMutation({
		mutationFn: deleteDevice,
		onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.devices.all(tenantId) }),
	});

	const handleCreate = async (values: Record<string, unknown>) => {
		try {
			await createMut.mutateAsync(values);
			message.success(t('devices.createSuccess'));
			setModalVisible(false);
			form.resetFields();
		} catch (err) {
			handleApiError(err, t('devices.createFailed'));
		}
	};

	const handleDelete = async (id: string) => {
		try {
			await deleteMut.mutateAsync(id);
			message.success(t('devices.deleteSuccess'));
		} catch (err) {
			handleApiError(err, t('devices.deleteFailed'));
		}
	};

	const columns = [
		{
			title: t('devices.column.name'),
			dataIndex: 'name',
			key: 'name',
			render: (v: string, record: DeviceRecord) => (
				<a onClick={() => navigate(buildNavHref(`/devices/${record.identityId ?? ''}`, tenantSlug))} className="font-medium">
					{v}
				</a>
			),
		},
		{
			title: t('devices.column.type'),
			dataIndex: 'workloadSubtype',
			key: 'workloadSubtype',
			render: (v: string) => (
				<StatusBadge variant={typeVariant(v)}>
					{t(`devices.type.${v}`, { defaultValue: v || '-' })}
				</StatusBadge>
			),
		},
		{
			// A-90：补状态列（unpaired/active/transferring 此前不可见）
			title: t('common.status'),
			dataIndex: 'status',
			key: 'status',
			render: (v: string) => (
				<StatusBadge variant={statusVariantOf(DEVICE_STATUS_VARIANT, v)}>
					{t(`devices.status.${v}`, { defaultValue: v || '-' })}
				</StatusBadge>
			),
		},
		{
			// A-89：owner 显示名（owner_principal_id 优先；历史行回退 owner_id；均无 → '-'）
			title: t('devices.column.owner'),
			key: 'owner',
			render: (_: unknown, record: DeviceRecord) =>
				resolveOwner(record.ownerPrincipalId, record.ownerId),
		},
		{
			title: t('devices.column.hardwareId'),
			dataIndex: 'hardwareId',
			key: 'hardwareId',
			render: (v: string) => (v ? <code className="text-xs">{v}</code> : '-'),
		},
		{
			title: t('devices.column.firmware'),
			dataIndex: 'firmwareVer',
			key: 'firmwareVer',
			render: (v: string) => v || '-',
		},
		{
			title: t('devices.column.created'),
			dataIndex: 'createdAt',
			key: 'createdAt',
			render: (v: string) => formatDate(v),
		},
		{
			title: t('devices.column.actions'),
			key: 'action',
			render: (_: unknown, record: DeviceRecord) => (
				<Space size="small">
					<Button
						type="link"
						icon={<Pencil size="1em" />}
						onClick={(e) => {
							e.stopPropagation();
							navigate(buildNavHref(`/devices/${record.identityId ?? ''}`, tenantSlug));
						}}
					>
						{t('common.edit')}
					</Button>
					<Popconfirm
						title={t('devices.confirmDelete')}
						description={t('devices.deleteWarning')}
						onConfirm={() => handleDelete(record.identityId ?? '')}
						okText={t('common.delete')}
						okButtonProps={{ danger: true }}
						cancelText={t('common.cancel')}
					>
						<Button
							type="link"
							danger
							icon={<Trash2 size="1em" />}
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
		<div>
			<AppPageHeader
				title={t('devices.title')}
				description={t('devices.subtitle')}
				actions={
					<Space>
						{/* A-90：状态筛选（后端 ListDevices status 过滤接线；旧实现无筛选） */}
						<Select
							allowClear
							placeholder={t('devices.filter.status')}
							value={statusFilter}
							onChange={(v) => {
								setStatusFilter(v);
								setPage(1);
							}}
							className="w-40"
							options={DEVICE_STATUS_OPTIONS.map((s) => ({
								label: t(`devices.status.${s}`),
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
							{t('devices.createBtn')}
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
					title={t('devices.loadError')}
					message={t('devices.loadErrorHint')}
					onRetry={() => refetch()}
				/>
			)}

			{/* A-93：删空态重复 CTA（页头 CTA 已同屏可复用） */}
			{!isLoading && !error && devices.length === 0 && (
				<EmptyState title={t('devices.emptyTitle')} description={t('devices.emptyDesc')} />
			)}

			{!isLoading && !error && devices.length > 0 && (
				<DataTable
					rowKey="identityId"
					columns={columns}
					dataSource={devices}
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
					scroll={{ x: 960 }}
					onRow={(record) => ({
						onClick: () => navigate(buildNavHref(`/devices/${record.identityId ?? ''}`, tenantSlug)),
						style: { cursor: 'pointer' },
					})}
				/>
			)}

			<Modal
				title={t('devices.createBtn')}
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
						<Input placeholder={t('devices.form.namePlaceholder')} />
					</Form.Item>
					<Form.Item
						name="workloadSubtype"
						label={t('devices.form.subtype')}
						rules={[{ required: true }]}
						// A-92：缺省口径对齐后端（CreateDevice 空值缺省 smart_home，device_service.go:73-75；
						// 旧前端默认 sensor 与后端双缺省漂移）
						initialValue="smart_home"
					>
						<Select
							options={[
								{ value: 'pet', label: t('devices.type.pet') },
								{ value: 'smart_home', label: t('devices.type.smart_home') },
								{ value: 'office', label: t('devices.type.office') },
								{ value: 'sensor', label: t('devices.type.sensor') },
							]}
						/>
					</Form.Item>
					<Form.Item name="hardwareId" label={t('devices.form.hardwareId')}>
						<Input placeholder={t('devices.form.hardwareIdPlaceholder')} />
					</Form.Item>
					<Form.Item name="firmwareVer" label={t('devices.form.firmware')}>
						<Input placeholder={t('devices.form.firmwarePlaceholder')} />
					</Form.Item>
					<Form.Item name="manufacturer" label={t('devices.form.manufacturer')}>
						<Input placeholder={t('devices.form.manufacturerPlaceholder')} />
					</Form.Item>
				</Form>
			</Modal>
		</div>
	);
}
