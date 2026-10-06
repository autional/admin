'use client';

import React, { useState } from 'react';
import { Button, Space, Tag, Modal, Form, Input, Popconfirm, Tooltip } from 'antd';
import { message } from '@/lib/antd-app';
import { PlusOutlined, EditOutlined, DeleteOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import {
	useGlobalVariables,
	useCreateGlobalVariable,
	useUpdateGlobalVariable,
	useDeleteGlobalVariable,
} from '@/hooks/use-global-variables';
import { handleApiError } from '@/lib/error-handler';
import { PageError, DataTable } from '@autional/ui/antd';
import { ConsolePageHeader } from '@autional/ui';

const { TextArea } = Input;

const PRESET_KEYS = [
	'app_name',
	'company_name',
	'support_email',
	'support_url',
	'logo_url',
	'primary_color',
];

export default function GlobalVariablesPage() {
	const { t } = useTranslation();
	const [modalVisible, setModalVisible] = useState(false);
	const [editing, setEditing] = useState<Record<string, unknown> | null>(null);
	const [form] = Form.useForm();

	const { data = [], isLoading, error, refetch } = useGlobalVariables();
	const createMut = useCreateGlobalVariable();
	const updateMut = useUpdateGlobalVariable();
	const deleteMut = useDeleteGlobalVariable();

	const handleSave = async (values: Record<string, unknown>) => {
		try {
			if (editing) {
				await updateMut.mutateAsync({ id: editing.id as string, data: { value: values.value } });
				message.success(t('notifications.globalVariables.updateSuccess'));
			} else {
				await createMut.mutateAsync(values);
				message.success(t('notifications.globalVariables.createSuccess'));
			}
			setModalVisible(false);
			setEditing(null);
			form.resetFields();
		} catch (err) {
			handleApiError(err, t('notifications.globalVariables.saveFailed'));
		}
	};

	const openCreate = () => {
		setEditing(null);
		form.resetFields();
		setModalVisible(true);
	};

	const openEdit = (record: Record<string, unknown>) => {
		setEditing(record);
		form.setFieldsValue(record);
		setModalVisible(true);
	};

	const columns = [
		{
			title: t('notifications.globalVariables.variableName'),
			dataIndex: 'key',
			key: 'key',
			width: 200,
			render: (v: string) => <Tag color="blue">{v}</Tag>,
		},
		{
			title: t('notifications.globalVariables.variableValue'),
			dataIndex: 'value',
			key: 'value',
			ellipsis: true,
		},
		{
			title: t('notifications.globalVariables.scope'),
			// RC-5（TASK-AB1-27 补）：行契约 camel 直读（拦截器深 camel 化；旧 dataIndex 'app_id' 读 camel 源恒
			// undefined ⇒ 应用级变量被误示「全局」）。
			// wire 锚：service-notification/internal/handler/dto/dto.go:873-879（json app_id）。
			dataIndex: 'appId',
			key: 'appId',
			width: 120,
			render: (v: string) =>
				v ? (
					<Tag>App: {v}</Tag>
				) : (
					<Tag color="green">{t('notifications.globalVariables.globalScopeTag')}</Tag>
				),
		},
		{
			title: t('common.actions'),
			key: 'actions',
			width: 150,
			render: (_: unknown, record: Record<string, unknown>) => (
				<Space>
					<Tooltip title={t('common.edit')}>
						<Button
							size="small"
							icon={<EditOutlined />}
							aria-label={t('common.edit')}
							onClick={() => openEdit(record)}
						/>
					</Tooltip>
					<Popconfirm
						title={t('notifications.globalVariables.confirmDelete')}
						onConfirm={async () => {
							try {
								await deleteMut.mutateAsync(record.id as string);
								message.success(t('notifications.globalVariables.deleteSuccess'));
							} catch (err) {
								handleApiError(err, t('notifications.globalVariables.deleteFailed'));
							}
						}}
					>
						<Button size="small" danger icon={<DeleteOutlined />} aria-label={t('common.delete')} />
					</Popconfirm>
				</Space>
			),
		},
	];

	return (
		<div>
			<ConsolePageHeader
				title={t('notifications.globalVariables.title')}
				actions={
					<>
						<Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
							{t('notifications.globalVariables.createVariable')}
						</Button>
					</>
				}
			/>
			<div className="mb-4 flex gap-2 flex-wrap">
				<span className="text-neutral-600 text-sm">
					{t('notifications.globalVariables.predefinedKeys')}:
				</span>
				{PRESET_KEYS.map((k) => (
					<Tag key={k}>{k}</Tag>
				))}
			</div>
			{error && (
				<PageError
					message={t('notifications.globalVariables.loadError')}
					retry={refetch}
					className="mb-4"
				/>
			)}
			<DataTable
				rowKey="id"
				columns={columns}
				dataSource={data as readonly Record<string, unknown>[]}
				loading={isLoading}
				pagination={{ pageSize: 10 }}
				scroll={{ x: 800 }}
			/>

			<Modal
				title={
					editing
						? t('notifications.globalVariables.editVariable')
						: t('notifications.globalVariables.createVariable')
				}
				open={modalVisible}
				onOk={() => form.submit()}
				onCancel={() => setModalVisible(false)}
				destroyOnHidden
				width={500}
				className="w-full max-w-[500px]"
			>
				<Form form={form} layout="vertical" onFinish={handleSave}>
					<Form.Item
						name="key"
						label={t('notifications.globalVariables.variableName')}
						rules={[{ required: true, message: t('notifications.globalVariables.nameRequired') }]}
					>
						<Input
							placeholder={t('notifications.globalVariables.namePlaceholder')}
							disabled={!!editing}
						/>
					</Form.Item>
					<Form.Item
						name="value"
						label={t('notifications.globalVariables.variableValue')}
						rules={[{ required: true, message: t('notifications.globalVariables.valueRequired') }]}
					>
						<TextArea rows={3} placeholder={t('notifications.globalVariables.valuePlaceholder')} />
					</Form.Item>
				</Form>
			</Modal>
		</div>
	);
}
