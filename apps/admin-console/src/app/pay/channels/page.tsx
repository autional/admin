'use client';

import React, { useState, useMemo } from 'react';
import { useCurrentTenantId, usePageTitle } from '@autional/shared';
import { Button, Form, Input, Select, Tag, Space, Popconfirm } from 'antd';
import { message } from '@/lib/antd-app';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import {
	usePayChannels,
	useCreateChannel,
	useUpdateChannel,
	useDeleteChannel,
	type Channel,
} from '@/hooks/use-pay';
import { handleApiError } from '@/lib/error-handler';
// A-338③：Modal 走 DS 包装（@autional/ui/antd）——关闭按钮 aria-label 本地化
// （rc-dialog 写死英文 "Close"，仅 closable 的 aria-* 可覆盖；包装内已注入）。
import { PageError, DataTable, Modal } from '@autional/ui/antd';
import { AppPageHeader } from '@autional/ui';

export default function PayChannelsPage() {
	const { t, i18n } = useTranslation();
	usePageTitle(t('payChannels.title')); // A-338①：tab 标题（旧实现恒「Autional 管理控制台」，第 20 例）
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

	// A-336：停用渠道 wire 值 'disabled' 原样英文（statusInactive 键存在但列未映射）；未知值原样兜底
	const statusLabels: Record<string, string> = {
		active: t('payChannels.statusActive'),
		disabled: t('payChannels.statusInactive'),
	};

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
				<Tag color={v === 'active' ? 'success' : 'default'}>{statusLabels[v] ?? v}</Tag>
			),
		},
		{
			title: t('payChannels.createdAt'),
			dataIndex: 'createdAt',
			key: 'createdAt',
			// A-338②：toLocaleString 无 locale（旧恒跑宿主默认）
			render: (v: string) => (v ? new Date(v).toLocaleString(i18n.language) : '-'),
		},
		{
			title: t('payChannels.actions'),
			key: 'action',
			render: (_: unknown, record: Channel) => (
				<Space size="small">
					<Button
						type="link"
						icon={<Pencil size="1em" />}
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
						<Button type="link" danger icon={<Trash2 size="1em" />}>
							{t('payChannels.delete')}
						</Button>
					</Popconfirm>
				</Space>
			),
		},
	];

	return (
		<div>
			<AppPageHeader
				title={t('payChannels.title')}
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
					{/* A-337：编辑态凭证字段服务端不下发（json:"-" 掩蔽 ⇒ 恒空），留空保存=保留旧值；
					    占位提示防误清空，创建态仍给格式示例。 */}
					<Form.Item name="config" label={t('payChannels.config')}>
						<Input.TextArea
							rows={4}
							placeholder={editing ? t('payChannels.keepUnchanged') : '{"app_id":"...","mch_id":"..."}'}
						/>
					</Form.Item>
					<Form.Item name="webhook_secret" label={t('payChannels.webhookSecret')}>
						<Input.Password placeholder={editing ? t('payChannels.keepUnchanged') : 'whsec_...'} />
					</Form.Item>
				</Form>
			</Modal>
		</div>
	);
}
