'use client';

import React, { useState } from 'react';
import { useCurrentTenantIdOr } from '@autional/shared';
import { Button, Space, Tag, Modal, Form, Input, Select, Empty, Tabs, Tooltip, Popconfirm, Descriptions, Divider } from 'antd';
import { message } from '@/lib/antd-app';
import {
	Copy,
	Eye,
	PauseCircle,
	Pencil,
	Play,
	Plus,
	Trash2,
} from 'lucide-react';
import {
	useApplications,
	useAppTypes,
	useCreateApplication,
	useUpdateApplication,
	useDeleteApplication,
	useSuspendApplication,
	useActivateApplication,
} from '@/hooks/use-applications';
import type { AppRecord } from '@/hooks/use-applications';

import { handleApiError } from '@/lib/error-handler';
import { PageError, DataTable } from '@autional/ui/antd';
import { AppPageHeader } from '@autional/ui';
import { useTranslation } from 'react-i18next';
import { createApplicationSchema } from '@/lib/validators';

const { Option } = Select;

/** A-43：内置应用类型（表单固定项；API 自定义类型去重后追加）。 */
const BUILTIN_APP_TYPES = ['oidc', 'saml', 'custom'];

export default function ApplicationsPage() {
	const { t } = useTranslation();
	const [modalVisible, setModalVisible] = useState(false);
	const [editing, setEditing] = useState<AppRecord | null>(null);
	const [detailRecord, setDetailRecord] = useState<AppRecord | null>(null);
	const [form] = Form.useForm();
	const tenantId = useCurrentTenantIdOr('default-tenant');

	const { data = [], isLoading, error, refetch } = useApplications(tenantId);
	// A-43：租户自定义应用类型（type 回显名称 + 表单选项）
	const { data: appTypes = [] } = useAppTypes(tenantId);
	const createMut = useCreateApplication();
	const updateMut = useUpdateApplication();
	const deleteMut = useDeleteApplication();
	const suspendMut = useSuspendApplication();
	const activateMut = useActivateApplication();

	const TYPE_COLORS: Record<string, string> = {
		oidc: 'blue',
		saml: 'purple',
		custom: 'default',
	};

	const TYPE_LABELS: Record<string, string> = {
		oidc: 'OIDC',
		saml: 'SAML',
		custom: t('applications.type.custom'),
	};

	// A-43：类型展示名 = 内置标签 → API 自定义类型名 → 原值兜底
	const typeLabel = (type: string) =>
		TYPE_LABELS[type] || appTypes.find((at) => at.code === type)?.name || type;

	const STATUS_LABELS: Record<string, string> = {
		active: t('applications.status.active'),
		inactive: t('applications.status.inactive'),
		pending: t('applications.status.pending'),
		suspended: t('applications.status.suspended'),
	};

	const handleSave = async (values: any) => {
		const result = createApplicationSchema.safeParse(values);
		if (!result.success) {
			result.error.issues.forEach((i) => message.error(i.message));
			return;
		}
		try {
			if (editing) {
				await updateMut.mutateAsync({ tenantId, id: editing.id, data: result.data });
				message.success(t('applications.updateSuccess'));
			} else {
				await createMut.mutateAsync({ tenantId, data: result.data });
				message.success(t('applications.createSuccess'));
			}
			setModalVisible(false);
			setEditing(null);
			form.resetFields();
		} catch (err) {
			handleApiError(err, t('applications.saveFailed'));
		}
	};

	const handleDelete = async (id: string) => {
		try {
			await deleteMut.mutateAsync({ tenantId, id });
			message.success(t('applications.deleteSuccess'));
		} catch (err) {
			handleApiError(err, t('applications.deleteFailed'));
		}
	};

	const handleCopy = (text: string) => {
		if (typeof navigator !== 'undefined') {
			navigator.clipboard
				.writeText(text)
				.then(() => message.success(t('applications.copiedToClipboard')));
		}
	};

	const handleToggleStatus = async (record: AppRecord) => {
		const nextStatus = record.status === 'active' ? 'suspended' : 'active';
		try {
			if (nextStatus === 'suspended') {
				await suspendMut.mutateAsync({ tenantId, id: record.id });
			} else {
				await activateMut.mutateAsync({ tenantId, id: record.id });
			}
			message.success(
				nextStatus === 'active' ? t('applications.resumedApp') : t('applications.pausedApp'),
			);
		} catch (err) {
			handleApiError(err, t('applications.operationFailed'));
		}
	};

	const columns = [
		{
			title: t('applications.column.name'),
			dataIndex: 'name',
			key: 'name',
			render: (v: string, record: AppRecord) => (
				<div>
					<div className="font-medium text-sm">{v}</div>
					{record.description && <div className="text-xs text-neutral-600">{record.description}</div>}
				</div>
			),
		},
		{
			title: t('common.type'),
			dataIndex: 'type',
			key: 'type',
			render: (type: string) => (
				<Tag color={TYPE_COLORS[type] || 'default'}>{typeLabel(type)}</Tag>
			),
		},
		{
			title: t('applications.column.clientId'),
			dataIndex: 'clientId',
			key: 'clientId',
			render: (v: string, record: AppRecord) => (
				<Space size="small">
					<code className="text-xs bg-neutral-200 px-1.5 py-0.5 rounded-xs">{v || record.code}</code>
					<Tooltip title={t('applications.copy')}>
						<Button
							type="text"
							size="small"
							icon={<Copy size="1em" />}
							aria-label={t('applications.copy')}
							onClick={() => handleCopy(v)}
						/>
					</Tooltip>
				</Space>
			),
		},
		{
			title: t('common.status'),
			dataIndex: 'status',
			key: 'status',
			render: (status: string) => (
				<Tag
					color={status === 'active' ? 'success' : status === 'suspended' ? 'warning' : 'default'}
				>
					{STATUS_LABELS[status] || status}
				</Tag>
			),
		},
		{
			title: t('common.actions'),
			key: 'action',
			render: (_: any, record: AppRecord) => (
				<Space size="small">
					<Tooltip title={t('applications.detail')}>
						<Button
							type="text"
							size="small"
							icon={<Eye size="1em" />}
							aria-label={t('applications.detail')}
							onClick={() => setDetailRecord(record)}
						/>
					</Tooltip>
					<Button
						type="text"
						size="small"
						icon={<Pencil size="1em" />}
						onClick={() => {
							setEditing(record);
							form.setFieldsValue({
								code: record.code,
								name: record.name,
								type: record.type,
								description: record.description,
							});
							setModalVisible(true);
						}}
					>
						{t('common.edit')}
					</Button>
					<Button
						type="text"
						size="small"
						icon={record.status === 'active' ? <PauseCircle size="1em" /> : <Play size="1em" />}
						onClick={() => handleToggleStatus(record)}
					>
						{record.status === 'active' ? t('applications.pause') : t('applications.resume')}
					</Button>
					<Popconfirm
						title={t('applications.confirmDeleteTitle')}
						description={t('applications.confirmDeleteDesc')}
						okText={t('common.delete')}
						okButtonProps={{ danger: true }}
						onConfirm={() => handleDelete(record.id)}
					>
						<Button type="text" danger size="small" icon={<Trash2 size="1em" />}>
							{t('common.delete')}
						</Button>
					</Popconfirm>
				</Space>
			),
		},
	];

	return (
		<div>
			{error && (
				<PageError message={t('applications.loadError')} retry={refetch} className="mb-4" />
			)}

			<AppPageHeader
				title={t('applications.title')}
				actions={
					<>
						<Button
							type="primary"
							icon={<Plus size="1em" />}
							onClick={() => {
								setEditing(null);
								form.resetFields();
								setModalVisible(true);
							}}
						>
							{t('applications.createBtn')}
						</Button>
					</>
				}
			/>

			{data.length === 0 && !isLoading ? (
				<Empty description={t('applications.noData')} className="py-12" />
			) : (
				<DataTable
					rowKey="id"
					columns={columns}
					dataSource={data}
					loading={isLoading}
					pagination={{ pageSize: 10 }}
					scroll={{ x: 800 }}
				/>
			)}

			<Modal
				title={editing ? t('applications.editApp') : t('applications.createApp')}
				open={modalVisible}
				onCancel={() => {
					setModalVisible(false);
					setEditing(null);
					form.resetFields();
				}}
				onOk={() => form.submit()}
				destroyOnHidden
				className="w-full max-w-[560px]"
			>
				<Form form={form} layout="vertical" onFinish={handleSave}>
					<Form.Item
						name="code"
						label={t('applications.form.code')}
						rules={[{ required: true, message: t('applications.form.codeRequired') }]}
						extra={t('applications.form.codeExtra')}
					>
						<Input placeholder={t('applications.form.codePlaceholder')} />
					</Form.Item>
					<Form.Item name="name" label={t('applications.form.name')} rules={[{ required: true }]}>
						<Input
							placeholder={t('applications.form.namePlaceholder')}
							onChange={(e) => {
								if (!editing && !form.getFieldValue('code')) {
									const slug = e.target.value
										.toLowerCase()
										.replace(/[^a-z0-9]+/g, '-')
										.replace(/^-|-$/g, '');
									if (slug) form.setFieldValue('code', slug);
								}
							}}
						/>
					</Form.Item>
					<Form.Item
						name="type"
						label={t('applications.form.type')}
						rules={[{ required: true }]}
						initialValue="oidc"
					>
						<Select placeholder={t('applications.form.typePlaceholder')}>
							<Option value="oidc">OIDC</Option>
							<Option value="saml">SAML</Option>
							<Option value="custom">{t('applications.type.custom')}</Option>
							{/* A-43：租户自定义应用类型（去重内置三项后追加） */}
							{appTypes
								.filter((at) => at.code && !BUILTIN_APP_TYPES.includes(at.code))
								.map((at) => (
									<Option key={at.code} value={at.code}>
										{at.name || at.code}
									</Option>
								))}
						</Select>
					</Form.Item>
					<Form.Item name="description" label={t('applications.form.description')}>
						<Input.TextArea rows={3} placeholder={t('applications.form.descriptionPlaceholder')} />
					</Form.Item>
				</Form>
			</Modal>

			<Modal
				title={t('applications.appDetail')}
				open={!!detailRecord}
				onCancel={() => setDetailRecord(null)}
				footer={null}
				width={560}
				className="w-full max-w-[560px]"
			>
				{detailRecord && (
					<Descriptions column={2} bordered size="small">
						<Descriptions.Item label={t('applications.detail.name')}>
							{detailRecord.name}
						</Descriptions.Item>
						<Descriptions.Item label={t('applications.detail.type')}>
							<Tag color={TYPE_COLORS[detailRecord.type] || 'default'}>
								{typeLabel(detailRecord.type)}
							</Tag>
						</Descriptions.Item>
						<Descriptions.Item label={t('applications.detail.clientId')} span={2}>
							<Space>
								<span className="font-mono text-xs">{detailRecord.clientId}</span>
								<Button
									type="text"
									size="small"
									icon={<Copy size="1em" />}
									onClick={() => {
										navigator.clipboard.writeText(detailRecord.clientId);
										message.success(t('applications.copiedClientId'));
									}}
								/>
							</Space>
						</Descriptions.Item>
						<Descriptions.Item label={t('applications.detail.status')}>
							<Tag color={detailRecord.status === 'active' ? 'success' : 'default'}>
								{STATUS_LABELS[detailRecord.status] || detailRecord.status}
							</Tag>
						</Descriptions.Item>
						<Descriptions.Item label={t('applications.detail.createdAt')}>
							{detailRecord.createdAt ? new Date(detailRecord.createdAt).toLocaleString() : '-'}
						</Descriptions.Item>
						{detailRecord.description && (
							<Descriptions.Item label={t('applications.detail.description')} span={2}>
								{detailRecord.description}
							</Descriptions.Item>
						)}
					</Descriptions>
				)}
			</Modal>
		</div>
	);
}
