'use client';

import React, { useState, useMemo } from 'react';
import { useCurrentTenantId } from '@autional/shared';
import { Button, Modal, Form, Input, Select, Tag, Space, Popconfirm } from 'antd';
import { message } from '@/lib/antd-app';
import { PlusOutlined, EditOutlined, DeleteOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';

import {
	usePayChannels,
	useCreateChannel,
	useUpdateChannel,
	useDeleteChannel,
	type Channel,
} from '@/hooks/use-pay';
import { handleApiError } from '@/lib/error-handler';
import { PageError, DataTable } from '@autional/ui/antd';
import { ConsolePageHeader } from '@autional/ui';

export default function PayChannelsPage() {
	const { t } = useTranslation();
	const tenantId = useCurrentTenantId() ?? '';
	const { data: channels = [], isLoading, error, refetch } = usePayChannels(tenantId);
	const createMut = useCreateChannel();
	const updateMut = useUpdateChannel();
	const deleteMut = useDeleteChannel();

	const [modalOpen, setModalOpen] = useState(false);
	const [editing, setEditing] = useState<Channel | null>(null);
	const [form] = Form.useForm();

	const channelOptions = useMemo(
		() => [
			{ value: 'wechat', label: t('payChannels.channelOption.wechat') },
			{ value: 'alipay', label: t('payChannels.channelOption.alipay') },
			{ value: 'stripe', label: t('payChannels.channelOption.stripe') },
		],
		[t],
	);

	const codeLabels = useMemo(
		() => ({
			wechat: t('payChannels.codeLabel.wechat'),
			alipay: t('payChannels.codeLabel.alipay'),
			stripe: t('payChannels.codeLabel.stripe'),
		}),
		[t],
	);

	const handleSave = async (values: Record<string, unknown>) => {
		try {
			if (editing) {
				await updateMut.mutateAsync({ id: editing.id, data: values });
				message.success(t('payChannels.updateSuccess'));
			} else {
				await createMut.mutateAsync(values);
				message.success(t('payChannels.createSuccess'));
			}
			setModalOpen(false);
			form.resetFields();
			setEditing(null);
		} catch (err) {
			handleApiError(err, t('payChannels.saveFailed'));
		}
	};

	const handleDelete = async (id: string) => {
		try {
			await deleteMut.mutateAsync(id);
			message.success(t('payChannels.deleteSuccess'));
		} catch (err) {
			handleApiError(err, t('payChannels.deleteFailed'));
		}
	};

	const columns = [
		{ title: t('payChannels.name'), dataIndex: 'name', key: 'name' },
		{
			title: t('payChannels.code'),
			dataIndex: 'code',
			key: 'code',
			render: (v: string) => <Tag>{codeLabels[v] ?? v}</Tag>,
		},
		{
			title: t('payChannels.status'),
			dataIndex: 'status',
			key: 'status',
			render: (v: string) => (
				<Tag color={v === 'active' ? 'success' : 'default'}>
					{v === 'active' ? t('payChannels.statusActive') : v}
				</Tag>
			),
		},
		{
			title: t('payChannels.createdAt'),
			dataIndex: 'createdAt',
			key: 'createdAt',
			render: (v: string) => (v ? new Date(v).toLocaleString() : '-'),
		},
		{
			title: t('payChannels.actions'),
			key: 'action',
			render: (_: unknown, record: Channel) => (
				<Space size="small">
					<Button
						type="link"
						icon={<EditOutlined />}
						onClick={() => {
							setEditing(record);
							form.setFieldsValue({
								name: record.name,
								code: record.code,
								config: record.config,
								status: record.status,
								webhook_secret: record.webhookSecret,
							});
							setModalOpen(true);
						}}
					>
						{t('payChannels.edit')}
					</Button>
					<Popconfirm
						title={t('payChannels.confirmDelete')}
						onConfirm={() => handleDelete(record.id)}
						okText={t('payChannels.ok')}
						cancelText={t('payChannels.cancel')}
					>
						<Button type="link" danger icon={<DeleteOutlined />}>
							{t('payChannels.delete')}
						</Button>
					</Popconfirm>
				</Space>
			),
		},
	];

	return (
		<div>
			<ConsolePageHeader
				title={t('payChannels.title')}
				actions={
					<>
						<Button
							type="primary"
							icon={<PlusOutlined />}
							onClick={() => {
								setEditing(null);
								form.resetFields();
								setModalOpen(true);
							}}
						>
							{t('payChannels.createBtn')}
						</Button>
					</>
				}
			/>

			{error && <PageError message={t('payChannels.loadError')} retry={refetch} className="mb-4" />}

			<DataTable
				rowKey="id"
				columns={columns}
				dataSource={channels}
				loading={isLoading}
				pagination={{ pageSize: 10 }}
				scroll={{ x: 800 }}
			/>

			<Modal
				title={editing ? t('payChannels.modalEdit') : t('payChannels.modalCreate')}
				open={modalOpen}
				onCancel={() => {
					setModalOpen(false);
					setEditing(null);
					form.resetFields();
				}}
				onOk={() => form.submit()}
				confirmLoading={createMut.isPending || updateMut.isPending}
				className="w-full max-w-[560px]"
			>
				<Form form={form} layout="vertical" onFinish={handleSave}>
					<Form.Item name="code" label={t('payChannels.code')} rules={[{ required: true }]}>
						<Select
							options={channelOptions}
							placeholder={t('payChannels.placeholder.channel')}
							disabled={!!editing}
						/>
					</Form.Item>
					<Form.Item name="name" label={t('payChannels.channelName')} rules={[{ required: true }]}>
						<Input placeholder={t('payChannels.placeholder.name')} />
					</Form.Item>
					{editing && (
						<Form.Item name="status" label={t('payChannels.status')}>
							<Select
								options={[
									{ value: 'active', label: t('payChannels.statusActive') },
									{ value: 'inactive', label: t('payChannels.statusInactive') },
								]}
							/>
						</Form.Item>
					)}
					<Form.Item name="config" label={t('payChannels.config')}>
						<Input.TextArea rows={4} placeholder='{"app_id":"...","mch_id":"..."}' />
					</Form.Item>
					<Form.Item name="webhook_secret" label={t('payChannels.webhookSecret')}>
						<Input.Password placeholder="whsec_..." />
					</Form.Item>
				</Form>
			</Modal>
		</div>
	);
}
