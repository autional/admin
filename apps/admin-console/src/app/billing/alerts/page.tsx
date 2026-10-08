'use client';

import React, { useState } from 'react';
import { Button, Modal, Form, Input, Select, InputNumber, Space, Popconfirm, Tag } from 'antd';
import { message } from '@/lib/antd-app';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import {
	useBillingAlerts,
	useCreateBillingAlert,
	useUpdateBillingAlert,
	useDeleteBillingAlert,
	alertChannelsFromCsv,
	type BillingAlertItem,
} from '@/hooks/use-billing-admin';
import { handleApiError } from '@/lib/error-handler';
import { PageError, DataTable } from '@autional/ui/antd';
import { AppPageHeader } from '@autional/ui';
import { useTranslation } from 'react-i18next';
import { usePageTitle } from '@autional/shared';

function formatDateTime(v?: string) {
	if (!v) return '-';
	return new Date(v).toLocaleString();
}

export default function BillingAlertsPage() {
	const { t } = useTranslation();
	usePageTitle(t('billingAlerts.title'));
	// A-426③：服务端分页接线（服务端默认 page_size=20 + 旧本地 10/页 ⇒ >20 条不可达）
	const [page, setPage] = useState(1);
	const [pageSize, setPageSize] = useState(10);
	const {
		data: alertResult,
		isLoading,
		error,
		refetch,
	} = useBillingAlerts({ page, page_size: pageSize });
	const alerts = alertResult?.items ?? [];
	const total = alertResult?.pagination?.total ?? 0;
	const createMut = useCreateBillingAlert();
	const updateMut = useUpdateBillingAlert();
	const deleteMut = useDeleteBillingAlert();

	const [modalOpen, setModalOpen] = useState(false);
	const [editing, setEditing] = useState<BillingAlertItem | null>(null);
	const [form] = Form.useForm();

	const RESOURCE_TYPE_OPTIONS = [
		{ value: 'api_calls', label: t('billingAlerts.resource.apiCalls') },
		{ value: 'storage', label: t('billingAlerts.resource.storage') },
		{ value: 'users', label: t('billingAlerts.resource.users') },
		{ value: 'sms', label: t('billingAlerts.resource.sms') },
		{ value: 'email', label: t('billingAlerts.resource.email') },
	];

	const CHANNEL_OPTIONS = [
		{ value: 'email', label: t('billingAlerts.channel.email') },
		{ value: 'sms', label: t('billingAlerts.channel.sms') },
		{ value: 'in_app', label: t('billingAlerts.channel.inApp') },
		{ value: 'webhook', label: t('billingAlerts.channel.webhook') },
	];

	const STATUS_TAG_MAP: Record<string, { color: string; label: string }> = {
		active: { color: 'success', label: t('billingAlerts.status.active') },
		triggered: { color: 'error', label: t('billingAlerts.status.triggered') },
		disabled: { color: 'default', label: t('billingAlerts.status.disabled') },
	};

	const handleSave = async (values: Record<string, unknown>) => {
		try {
			if (editing) {
				await updateMut.mutateAsync({ id: editing.id, data: values });
				message.success(t('billingAlerts.updated'));
			} else {
				await createMut.mutateAsync(values);
				message.success(t('billingAlerts.created'));
			}
			setModalOpen(false);
			form.resetFields();
			setEditing(null);
		} catch (err) {
			handleApiError(err, t('billingAlerts.saveFailed'));
		}
	};

	const handleDelete = async (id: string) => {
		try {
			await deleteMut.mutateAsync(id);
			message.success(t('billingAlerts.deleted'));
		} catch (err) {
			handleApiError(err, t('billingAlerts.deleteFailed'));
		}
	};

	const columns = [
		{ title: t('billingAlerts.column.name'), dataIndex: 'name', key: 'name' },
		{
			title: t('billingAlerts.column.metric'),
			dataIndex: 'resourceType',
			key: 'resourceType',
			width: 120,
			render: (v: string) => {
				const opt = RESOURCE_TYPE_OPTIONS.find((o) => o.value === v);
				return opt?.label ?? v;
			},
		},
		{
			title: t('billingAlerts.column.threshold'),
			dataIndex: 'thresholdPercent',
			key: 'thresholdPercent',
			width: 100,
			render: (v: number) => `${v}%`,
		},
		{
			title: t('billingAlerts.column.channels'),
			dataIndex: 'notificationChannels',
			key: 'notificationChannels',
			width: 160,
			render: (v: string) => {
				// TASK-AB1-22 / A-423：wire 逗号串 → 数组的转换单点在 hook（本页不手写 split）
				const channels = alertChannelsFromCsv(v);
				if (channels.length === 0) return '-';
				return channels.map((ch) => (
					<Tag key={ch} className="mb-0.5">
						{CHANNEL_OPTIONS.find((o) => o.value === ch)?.label ?? ch}
					</Tag>
				));
			},
		},
		{
			title: t('billingAlerts.column.status'),
			dataIndex: 'status',
			key: 'status',
			width: 100,
			render: (v: string) => {
				const cfg = STATUS_TAG_MAP[v] ?? { color: 'default', label: v };
				return <Tag color={cfg.color}>{cfg.label}</Tag>;
			},
		},
		{
			title: t('billingAlerts.column.lastTriggered'),
			dataIndex: 'lastTriggeredAt',
			key: 'lastTriggeredAt',
			width: 170,
			render: formatDateTime,
		},
		{
			title: t('billingAlerts.column.created'),
			dataIndex: 'createdAt',
			key: 'createdAt',
			width: 170,
			render: formatDateTime,
		},
		{
			title: t('billingAlerts.column.actions'),
			key: 'action',
			width: 140,
			render: (_: unknown, record: BillingAlertItem) => (
				<Space size="small">
					<Button
						type="link"
						icon={<Pencil size="1em" />}
						onClick={() => {
							setEditing(record);
							form.setFieldsValue({
								name: record.name,
								resourceType: record.resourceType,
								thresholdPercent: record.thresholdPercent,
								// TASK-AB1-22 / A-423：CSV → string[] 回显（否则多选显单 tag，且后续改动产生混合值）
								notificationChannels: alertChannelsFromCsv(record.notificationChannels),
								status: record.status,
							});
							setModalOpen(true);
						}}
					>
						{t('billingAlerts.edit')}
					</Button>
					<Popconfirm
						title={t('billingAlerts.confirmDelete')}
						onConfirm={() => handleDelete(record.id)}
						okText={t('billingAlerts.okText')}
						cancelText={t('billingAlerts.cancelText')}
					>
						<Button type="link" danger icon={<Trash2 size="1em" />}>
							{t('billingAlerts.delete')}
						</Button>
					</Popconfirm>
				</Space>
			),
		},
	];

	return (
		<div>
			<AppPageHeader
				title={t('billingAlerts.title')}
				actions={
					<>
						<Button
							type="primary"
							icon={<Plus size="1em" />}
							onClick={() => {
								setEditing(null);
								form.resetFields();
								setModalOpen(true);
							}}
						>
							{t('billingAlerts.createBtn')}
						</Button>
					</>
				}
			/>

			{error && (
				<PageError message={t('billingAlerts.loadError')} retry={refetch} className="mb-4" />
			)}

			<DataTable
				rowKey="id"
				columns={columns}
				dataSource={alerts}
				loading={isLoading}
				// A-426③：受控分页（page/page_size 上行 + total 来自服务端信封）
				pagination={{
					current: page,
					pageSize,
					total,
					showSizeChanger: true,
					onChange: (p, ps) => {
						setPage(p);
						setPageSize(ps);
					},
				}}
				scroll={{ x: 1100 }}
			/>

			<Modal
				title={editing ? t('billingAlerts.editTitle') : t('billingAlerts.createTitle')}
				open={modalOpen}
				onCancel={() => {
					setModalOpen(false);
					setEditing(null);
					form.resetFields();
				}}
				onOk={() => form.submit()}
				confirmLoading={createMut.isPending || updateMut.isPending}
				width={560}
				className="w-full max-w-[560px]"
			>
				<Form form={form} layout="vertical" onFinish={handleSave}>
					<Form.Item
						name="name"
						label={t('billingAlerts.form.name')}
						rules={[{ required: true, message: t('billingAlerts.validation.nameRequired') }]}
					>
						<Input placeholder={t('billingAlerts.form.namePlaceholder')} />
					</Form.Item>
					<Form.Item
						name="resourceType"
						label={t('billingAlerts.form.metricType')}
						rules={[{ required: true, message: t('billingAlerts.validation.metricRequired') }]}
					>
						<Select
							options={RESOURCE_TYPE_OPTIONS}
							placeholder={t('billingAlerts.form.metricPlaceholder')}
							disabled={!!editing}
						/>
					</Form.Item>
					<Form.Item
						name="thresholdPercent"
						label={t('billingAlerts.form.threshold')}
						rules={[{ required: true, message: t('billingAlerts.validation.thresholdRequired') }]}
					>
						<InputNumber className="w-full" min={1} max={100} placeholder="80" />
					</Form.Item>
					<Form.Item
						name="notificationChannels"
						label={t('billingAlerts.form.channels')}
						rules={[{ required: true, message: t('billingAlerts.validation.channelsRequired') }]}
					>
						<Select
							mode="multiple"
							options={CHANNEL_OPTIONS}
							placeholder={t('billingAlerts.form.channelsPlaceholder')}
						/>
					</Form.Item>
					{editing && (
						<Form.Item name="status" label={t('billingAlerts.form.status')}>
							<Select
								options={[
									{ value: 'active', label: t('billingAlerts.status.active') },
									{ value: 'triggered', label: t('billingAlerts.status.triggered') },
									{ value: 'disabled', label: t('billingAlerts.status.disabled') },
								]}
							/>
						</Form.Item>
					)}
				</Form>
			</Modal>
		</div>
	);
}
