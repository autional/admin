'use client';

import React, { useState } from 'react';
import { Button, Space, Tag, Modal, Form, Input, Select, Switch, Popconfirm } from 'antd';
import { message } from '@/lib/antd-app';
import {
	PlusOutlined,
	EditOutlined,
	DeleteOutlined,
	CopyOutlined,
	EyeOutlined,
} from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import {
	useCommunicationTemplates,
	useCreateCommunicationTemplate,
	useUpdateCommunicationTemplate,
	useDeleteCommunicationTemplate,
	useCloneCommunicationTemplate,
	useCommunicationTemplateStats,
} from '@/hooks/use-communication';
import { handleApiError } from '@/lib/error-handler';
import { PageError, DataTable } from '@autional/ui/antd';
import { AppPageHeader } from '@autional/ui';

const { Option } = Select;
const { TextArea } = Input;

interface TemplateRecord {
	id?: string;
	code?: string;
	name?: string;
	channel?: string;
	locale?: string;
	isActive?: boolean;
	version?: number;
	subject?: string;
	content?: string;
	description?: string;
	variables?: string[];
	createdAt?: string;
	updatedAt?: string;
}

const CHANNEL_COLORS: Record<string, string> = { sms: 'orange', email: 'green', push: 'purple' };

export default function CommunicationTemplatesPage() {
	const { t } = useTranslation();
	const [modalVisible, setModalVisible] = useState(false);
	const [cloneModalVisible, setCloneModalVisible] = useState(false);
	const [editing, setEditing] = useState<TemplateRecord | null>(null);
	const [form] = Form.useForm();
	const [cloneForm] = Form.useForm();

	const { data = [], isLoading, error, refetch } = useCommunicationTemplates();
	const { data: stats = [] } = useCommunicationTemplateStats();
	const createMut = useCreateCommunicationTemplate();
	const updateMut = useUpdateCommunicationTemplate();
	const deleteMut = useDeleteCommunicationTemplate();
	const cloneMut = useCloneCommunicationTemplate();

	const CHANNEL_OPTIONS = [
		{ value: 'sms', label: t('communication.templates.channel.sms') },
		{ value: 'email', label: t('communication.templates.channel.email') },
		{ value: 'push', label: t('communication.templates.channel.push') },
	];

	const handleSave = async (values: any) => {
		try {
			const payload = {
				code: values.code,
				name: values.name,
				channel: values.channel,
				content: values.content,
				subject: values.subject,
				description: values.description,
				contentType: values.contentType,
				variables: values.variables
					? values.variables
							.split(',')
							.map((v: string) => v.trim())
							.filter(Boolean)
					: undefined,
			};
			if (editing?.id) {
				await updateMut.mutateAsync({
					id: editing.id,
					data: { ...payload, isActive: values.isActive },
				});
				message.success(t('communication.templates.updateSuccess'));
			} else {
				await createMut.mutateAsync(payload);
				message.success(t('communication.templates.createSuccess'));
			}
			setModalVisible(false);
			setEditing(null);
			form.resetFields();
		} catch (err) {
			handleApiError(err, t('communication.templates.saveFailed'));
		}
	};

	const handleDelete = async (id: string) => {
		try {
			await deleteMut.mutateAsync(id);
			message.success(t('communication.templates.deleteSuccess'));
		} catch (err) {
			handleApiError(err, t('communication.templates.deleteFailed'));
		}
	};

	const handleClone = async (values: { targetLocale: string }) => {
		if (!editing?.id) return;
		try {
			await cloneMut.mutateAsync({ id: editing.id, data: values });
			message.success(t('communication.templates.cloneSuccess'));
			setCloneModalVisible(false);
			setEditing(null);
			cloneForm.resetFields();
		} catch (err) {
			handleApiError(err, t('communication.templates.cloneFailed'));
		}
	};

	const columns = [
		{ title: t('communication.templates.code'), dataIndex: 'code', key: 'code', ellipsis: true },
		{ title: t('communication.templates.name'), dataIndex: 'name', key: 'name', ellipsis: true },
		{
			title: t('communication.channel'),
			dataIndex: 'channel',
			key: 'channel',
			render: (v: string) => <Tag color={CHANNEL_COLORS[v] || 'default'}>{v?.toUpperCase()}</Tag>,
		},
		{
			title: t('common.status'),
			dataIndex: 'isActive',
			key: 'isActive',
			render: (v: boolean) => (
				<Tag color={v ? 'success' : 'default'}>
					{v ? t('communication.templates.enabled') : t('communication.templates.disabled')}
				</Tag>
			),
		},
		{ title: t('communication.templates.version'), dataIndex: 'version', key: 'version' },
		{
			title: t('common.updatedAt'),
			dataIndex: 'updatedAt',
			key: 'updatedAt',
			render: (v?: string) => (v ? v.slice(0, 10) : '-'),
		},
		{
			title: t('common.actions'),
			key: 'action',
			render: (_: any, record: TemplateRecord) => (
				<Space size="small">
					<Button
						type="text"
						size="small"
						icon={<EditOutlined />}
						onClick={() => {
							setEditing(record);
							form.setFieldsValue({
								code: record.code,
								name: record.name,
								channel: record.channel,
								content: record.content,
								subject: record.subject,
								description: record.description,
								isActive: record.isActive,
								variables: record.variables?.join(', '),
							});
							setModalVisible(true);
						}}
					>
						{t('common.edit')}
					</Button>
					<Button
						type="text"
						size="small"
						icon={<CopyOutlined />}
						onClick={() => {
							setEditing(record);
							cloneForm.resetFields();
							setCloneModalVisible(true);
						}}
					>
						{t('communication.templates.cloneLanguage')}
					</Button>
					<Popconfirm
						title={t('communication.templates.confirmDelete')}
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
			<AppPageHeader
				title={t('communication.templates.title')}
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
							{t('communication.templates.createTemplate')}
						</Button>
					</>
				}
			/>

			{error && (
				<PageError
					message={t('communication.templates.loadError')}
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
						? t('communication.templates.editTemplate')
						: t('communication.templates.createTemplate')
				}
				open={modalVisible}
				onCancel={() => {
					setModalVisible(false);
					setEditing(null);
					form.resetFields();
				}}
				onOk={() => form.submit()}
				width={720}
				className="w-full max-w-[720px]"
				destroyOnHidden
			>
				<Form
					form={form}
					layout="vertical"
					onFinish={handleSave}
					initialValues={{ channel: 'email' }}
				>
					<Form.Item
						name="code"
						label={t('communication.templates.code')}
						rules={[{ required: true }]}
					>
						<Input placeholder={t('communication.templates.codePlaceholder')} />
					</Form.Item>
					<Form.Item
						name="name"
						label={t('communication.templates.name')}
						rules={[{ required: true }]}
					>
						<Input placeholder={t('communication.templates.namePlaceholder')} />
					</Form.Item>
					<Form.Item name="channel" label={t('communication.channel')} rules={[{ required: true }]}>
						<Select>
							{CHANNEL_OPTIONS.map((c) => (
								<Option key={c.value} value={c.value}>
									{c.label}
								</Option>
							))}
						</Select>
					</Form.Item>
					<Form.Item name="subject" label={t('communication.templates.subject')}>
						<Input placeholder={t('communication.templates.subjectPlaceholder')} />
					</Form.Item>
					<Form.Item name="description" label={t('communication.templates.description')}>
						<Input placeholder={t('communication.templates.descriptionPlaceholder')} />
					</Form.Item>
					<Form.Item
						name="content"
						label={t('communication.templates.content')}
						rules={[{ required: true }]}
					>
						<TextArea rows={6} placeholder={t('communication.templates.contentPlaceholder')} />
					</Form.Item>
					<Form.Item name="variables" label={t('communication.templates.variables')}>
						<Input placeholder={t('communication.templates.variablesPlaceholder')} />
					</Form.Item>
					{editing?.id && (
						<Form.Item
							name="isActive"
							label={t('communication.templates.activeStatus')}
							valuePropName="checked"
						>
							<Switch />
						</Form.Item>
					)}
				</Form>
			</Modal>

			<Modal
				title={t('communication.templates.cloneToOtherLanguage')}
				open={cloneModalVisible}
				onCancel={() => {
					setCloneModalVisible(false);
					setEditing(null);
					cloneForm.resetFields();
				}}
				onOk={() => cloneForm.submit()}
				destroyOnHidden
				className="w-full max-w-[560px]"
			>
				<Form form={cloneForm} layout="vertical" onFinish={handleClone}>
					<Form.Item
						name="targetLocale"
						label={t('communication.templates.targetLanguage')}
						rules={[{ required: true }]}
					>
						<Select placeholder={t('communication.templates.selectTargetLanguage')}>
							<Option value="en-US">English (en-US)</Option>
							<Option value="zh-CN">{t('communication.templates.langZhCN')}</Option>
							<Option value="ja-JP">{t('communication.templates.langJaJP')}</Option>
							<Option value="ko-KR">{t('communication.templates.langKoKR')}</Option>
						</Select>
					</Form.Item>
				</Form>
			</Modal>
		</div>
	);
}
