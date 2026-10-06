'use client';

import React, { useState } from 'react';
import { Button, Space, Tag, Modal, Form, Input, InputNumber, Select, Popconfirm } from 'antd';
import { message } from '@/lib/antd-app';
import { PlusOutlined, EditOutlined, DeleteOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import {
	useCommunicationProvidersList,
	useCreateCommunicationProvider,
	useUpdateCommunicationProvider,
	useDeleteCommunicationProvider,
} from '@/hooks/use-communication';
import { handleApiError } from '@/lib/error-handler';
import { PageError, DataTable } from '@autional/ui/antd';
import { ConsolePageHeader } from '@autional/ui';

const { Option } = Select;
const { TextArea } = Input;

interface ProviderRecord {
	id?: string;
	channel?: string;
	provider?: string;
	apiKey?: string;
	// A-177（TASK-AB1-09）：服务端 ProviderConfigResponse.config 为字符串（脱敏 JSON 串），
	// 编辑回填按字符串展示；提交时原样透传为 string，不再 JSON.parse 成对象。
	config?: string;
	isActive?: boolean;
	priority?: number;
	updatedAt?: string;
}

const CHANNEL_COLORS: Record<string, string> = { sms: 'orange', email: 'green', push: 'purple' };
const PROVIDER_COLORS: Record<string, string> = {
	aliyun: 'blue',
	tencent: 'cyan',
	sendgrid: 'green',
	fcm: 'orange',
	apns: 'purple',
};

export default function CommunicationProvidersPage() {
	const { t } = useTranslation();
	const [modalVisible, setModalVisible] = useState(false);
	const [editing, setEditing] = useState<ProviderRecord | null>(null);
	const [form] = Form.useForm();

	const { data = [], isLoading, error, refetch } = useCommunicationProvidersList();
	const createMut = useCreateCommunicationProvider();
	const updateMut = useUpdateCommunicationProvider();
	const deleteMut = useDeleteCommunicationProvider();

	const CHANNEL_OPTIONS = [
		{ value: 'sms', label: t('communication.channel.sms') },
		{ value: 'email', label: t('communication.channel.email') },
		{ value: 'push', label: t('communication.channel.push') },
	];

	const providerOptions = [
		{ value: 'aliyun', label: t('communication.providers.provider.aliyun') },
		{ value: 'tencent', label: t('communication.providers.provider.tencent') },
		{ value: 'sendgrid', label: t('communication.providers.provider.sendgrid') },
		{ value: 'fcm', label: t('communication.providers.provider.fcm') },
		{ value: 'apns', label: t('communication.providers.provider.apns') },
	];

	const handleSave = async (values: any) => {
		try {
			// A-177（TASK-AB1-09）：请求体对齐后端 DTO ——
			// create = CreateProviderConfigRequest{channel, provider, config(JSON 字符串), priority}；
			// update = UpdateProviderConfigRequest{config, is_active, priority}（再发 channel/provider
			// 会命中后端 "no fields to update"）。键名一律 camel 书面写，camel→snake 由 shared
			// apiClient 请求拦截器承担（isActive→is_active）。
			const configText: string = values.config || '{}';
			const priority: number = values.priority ?? 0;
			if (editing?.id) {
				await updateMut.mutateAsync({
					id: editing.id,
					data: { config: configText, isActive: values.isActive !== false, priority },
				});
				message.success(t('communication.providers.updateSuccess'));
			} else {
				await createMut.mutateAsync({
					channel: values.channel,
					provider: values.provider,
					config: configText,
					priority,
				});
				message.success(t('communication.providers.createSuccess'));
			}
			setModalVisible(false);
			setEditing(null);
			form.resetFields();
		} catch (err) {
			handleApiError(err, t('communication.providers.saveFailed'));
		}
	};

	const handleDelete = async (id: string) => {
		try {
			await deleteMut.mutateAsync(id);
			message.success(t('communication.providers.deleteSuccess'));
		} catch (err) {
			handleApiError(err, t('communication.providers.deleteFailed'));
		}
	};

	const columns = [
		{
			title: t('communication.providers.channel'),
			dataIndex: 'channel',
			key: 'channel',
			render: (v: string) => <Tag color={CHANNEL_COLORS[v] || 'default'}>{v?.toUpperCase()}</Tag>,
		},
		{
			title: t('communication.providers.provider'),
			dataIndex: 'provider',
			key: 'provider',
			render: (v: string) => <Tag color={PROVIDER_COLORS[v] || 'default'}>{v || '-'}</Tag>,
		},
		{
			title: t('common.status'),
			dataIndex: 'isActive',
			key: 'isActive',
			render: (v: boolean) => (
				<Tag color={v ? 'success' : 'default'}>
					{v ? t('communication.providers.enabled') : t('communication.providers.disabled')}
				</Tag>
			),
		},
		{
			title: t('common.updatedAt'),
			dataIndex: 'updatedAt',
			key: 'updatedAt',
			render: (v?: string) => (v ? v.slice(0, 10) : '-'),
		},
		{
			title: t('common.actions'),
			key: 'action',
			render: (_: any, record: ProviderRecord) => (
				<Space size="small">
					<Button
						type="text"
						size="small"
						icon={<EditOutlined />}
						onClick={() => {
							setEditing(record);
							form.setFieldsValue({
								channel: record.channel,
								provider: record.provider,
								// A-177：config 为字符串（服务端脱敏 JSON 串）→ 原样展示
								config: record.config || '{}',
								isActive: record.isActive,
								priority: record.priority ?? 0,
							});
							setModalVisible(true);
						}}
					>
						{t('common.edit')}
					</Button>
					<Popconfirm
						title={t('communication.providers.confirmDelete')}
						onConfirm={() => record.id && handleDelete(record.id)}
					>
						<Button type="text" danger size="small" icon={<DeleteOutlined />}>
							{t('common.delete')}
						</Button>
					</Popconfirm>
				</Space>
			),
		},
	];

	return (
		<div>
			<ConsolePageHeader
				title={t('communication.providers.title')}
				actions={
					<>
						<Button
							type="primary"
							icon={<PlusOutlined />}
							onClick={() => {
								setEditing(null);
								form.resetFields();
								setModalVisible(true);
							}}
						>
							{t('communication.providers.addProvider')}
						</Button>
					</>
				}
			/>

			{error && (
				<PageError
					message={t('communication.providers.loadError')}
					retry={refetch}
					className="mb-4"
				/>
			)}
			<DataTable
				rowKey="id"
				columns={columns}
				dataSource={data}
				loading={isLoading}
				pagination={{ pageSize: 10 }}
				scroll={{ x: 800 }}
			/>

			<Modal
				title={
					editing?.id
						? t('communication.providers.editProvider')
						: t('communication.providers.addProvider')
				}
				open={modalVisible}
				onCancel={() => {
					setModalVisible(false);
					setEditing(null);
					form.resetFields();
				}}
				onOk={() => form.submit()}
				width={640}
				className="w-full max-w-[640px]"
				destroyOnHidden
			>
				<Form
					form={form}
					layout="vertical"
					onFinish={handleSave}
					initialValues={{ channel: 'email', priority: 0 }}
				>
					<Form.Item
						name="channel"
						label={t('communication.providers.channel')}
						rules={[{ required: true }]}
					>
						<Select>
							{CHANNEL_OPTIONS.map((c) => (
								<Option key={c.value} value={c.value}>
									{c.label}
								</Option>
							))}
						</Select>
					</Form.Item>
					<Form.Item
						name="provider"
						label={t('communication.providers.provider')}
						rules={[{ required: true }]}
					>
						<Select placeholder={t('communication.providers.selectProvider')}>
							{providerOptions.map((p) => (
								<Option key={p.value} value={p.value}>
									{p.label}
								</Option>
							))}
						</Select>
					</Form.Item>
					<Form.Item
						name="config"
						label={t('communication.providers.config')}
						rules={[{ required: true }]}
					>
						<TextArea rows={6} placeholder={t('communication.providers.configPlaceholder')} />
					</Form.Item>
					{/* A-177：priority 对齐后端 DTO（min0 max100，dto.go:582） */}
					<Form.Item
						name="priority"
						label={t('communication.providers.priority')}
						rules={[{ type: 'number', min: 0, max: 100 }]}
					>
						<InputNumber min={0} max={100} className="w-full" />
					</Form.Item>
				</Form>
			</Modal>
		</div>
	);
}
