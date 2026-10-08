'use client';

import React, { useState } from 'react';
import { Button, Space, Tag, Modal, Form, Input, Select, Popconfirm, Empty, Spin } from 'antd';
import { PlusOutlined, DeleteOutlined, SyncOutlined, KeyOutlined } from '@ant-design/icons';
import { message } from '@/lib/antd-app';
import { useTranslation } from 'react-i18next';
import {
	useApiKeys,
	useCreateApiKey,
	useDeleteApiKey,
	useRotateApiKey,
	useUpdateApiKeyStatus,
} from '@/hooks/use-api-keys';
import type { ApiKeyRecord } from '@/hooks/use-api-keys';
import { handleApiError } from '@/lib/error-handler';
import { PageError, DataTable } from '@autional/ui/antd';
import { AppPageHeader } from '@autional/ui';

const { Option } = Select;

export default function ApiKeysPage() {
	const { t } = useTranslation();
	const [modalVisible, setModalVisible] = useState(false);
	const [form] = Form.useForm();

	const { data = [], isLoading, error, refetch } = useApiKeys();
	const createMut = useCreateApiKey();
	const deleteMut = useDeleteApiKey();
	const rotateMut = useRotateApiKey();
	const statusMut = useUpdateApiKeyStatus();

	const handleCreate = async (values: any) => {
		try {
			const payload: Record<string, unknown> = {
				name: values.name,
				scopes: values.scopes || [],
				environment: values.environment,
			};
			if (values.expiresInDays) payload.expiresInDays = values.expiresInDays;
			const res = await createMut.mutateAsync(payload);
			const result = res as any;
			if (result?.data?.key || result?.key) {
				const key = result.data?.key || result.key;
				message.success(t('apiKeys.createSuccess'));
				message.info(`${t('apiKeys.copyKeyHint')}: ${key}`);
			} else {
				message.success(t('apiKeys.createSuccess'));
			}
			setModalVisible(false);
			form.resetFields();
		} catch (err) {
			handleApiError(err, t('apiKeys.createFailed'));
		}
	};

	const handleDelete = async (id: string) => {
		try {
			await deleteMut.mutateAsync(id);
			message.success(t('apiKeys.deleteSuccess'));
		} catch (err) {
			handleApiError(err, t('apiKeys.deleteFailed'));
		}
	};

	const handleRotate = async (id: string) => {
		try {
			const res = await rotateMut.mutateAsync(id);
			const result = res as any;
			if (result?.data?.key || result?.key) {
				const key = result.data?.key || result.key;
				message.success(t('apiKeys.rotateSuccess'));
				message.info(`${t('apiKeys.copyKeyHint')}: ${key}`);
			} else {
				message.success(t('apiKeys.rotateSuccess'));
			}
		} catch (err) {
			handleApiError(err, t('apiKeys.rotateFailed'));
		}
	};

	const handleToggleStatus = async (record: ApiKeyRecord) => {
		const nextStatus = record.status === 'active' ? 'inactive' : 'active';
		try {
			await statusMut.mutateAsync({ id: record.id, status: nextStatus });
			message.success(nextStatus === 'active' ? t('apiKeys.resumed') : t('apiKeys.revoked'));
		} catch (err) {
			handleApiError(err, t('apiKeys.operationFailed'));
		}
	};

	const columns = [
		{ title: t('apiKeys.column.name'), dataIndex: 'name', key: 'name' },
		{
			title: t('apiKeys.column.keyPrefix'),
			dataIndex: 'keyPrefix',
			key: 'keyPrefix',
			render: (v: string) => (
				<code className="text-xs bg-neutral-200 px-1.5 py-0.5 rounded">{v}...</code>
			),
		},
		{
			title: t('apiKeys.column.scopes'),
			dataIndex: 'scopes',
			key: 'scopes',
			render: (scopes: string[]) => (
				<Space size={4} wrap>
					{(scopes || []).map((s) => (
						<Tag key={s} color="blue">
							{s}
						</Tag>
					))}
				</Space>
			),
		},
		{
			title: t('apiKeys.column.environment'),
			dataIndex: 'environment',
			key: 'environment',
			render: (v: string) => (v ? t(`apiKeys.environment.${v}`, { defaultValue: v }) : '-'),
		},
		{
			title: t('common.status'),
			dataIndex: 'status',
			key: 'status',
			render: (status: string) => (
				<Tag color={status === 'active' ? 'success' : 'default'}>
					{t(`apiKeys.status.${status}`, { defaultValue: status })}
				</Tag>
			),
		},
		{
			title: t('common.actions'),
			key: 'action',
			render: (_: any, record: ApiKeyRecord) => (
				<Space size="small">
					<Popconfirm title={t('apiKeys.confirmRotate')} onConfirm={() => handleRotate(record.id)}>
						<Button type="text" size="small" icon={<SyncOutlined />}>
							{t('apiKeys.rotate')}
						</Button>
					</Popconfirm>
					<Popconfirm title={t('apiKeys.confirmRevoke')} onConfirm={() => handleDelete(record.id)}>
						<Button type="text" size="small" danger icon={<DeleteOutlined />}>
							{t('apiKeys.revoke')}
						</Button>
					</Popconfirm>
				</Space>
			),
		},
	];

	return (
		<div>
			{error && <PageError message={t('apiKeys.loadError')} retry={refetch} className="mb-4" />}

			<AppPageHeader
				title={t('apiKeys.title')}
				actions={
					<>
						<Button
							type="primary"
							icon={<PlusOutlined />}
							onClick={() => {
								setModalVisible(true);
								form.resetFields();
							}}
						>
							{t('apiKeys.createBtn')}
						</Button>
					</>
				}
			/>

			{isLoading ? (
				<Spin className="flex justify-center py-12" />
			) : data.length === 0 ? (
				<Empty description={t('apiKeys.noData')} />
			) : (
				<DataTable
					rowKey="id"
					columns={columns}
					dataSource={data}
					pagination={{ pageSize: 10 }}
					scroll={{ x: 800 }}
				/>
			)}

			<Modal
				title={t('apiKeys.createBtn')}
				open={modalVisible}
				onCancel={() => {
					setModalVisible(false);
					form.resetFields();
				}}
				onOk={() => form.submit()}
				destroyOnClose
			>
				<Form form={form} layout="vertical" onFinish={handleCreate}>
					<Form.Item name="name" label={t('apiKeys.form.name')} rules={[{ required: true }]}>
						<Input placeholder={t('apiKeys.form.namePlaceholder')} />
					</Form.Item>
					<Form.Item name="scopes" label={t('apiKeys.form.scopes')}>
						<Select mode="tags" placeholder={t('apiKeys.form.scopesPlaceholder')} />
					</Form.Item>
					<Form.Item
						name="environment"
						label={t('apiKeys.form.environment')}
						rules={[{ required: true, message: t('apiKeys.form.environmentRequired') }]}
					>
						<Select placeholder={t('apiKeys.form.environmentPlaceholder')}>
							<Option value="live">{t('apiKeys.environment.live')}</Option>
							<Option value="test">{t('apiKeys.environment.test', { defaultValue: 'Test' })}</Option>
						</Select>
					</Form.Item>
					<Form.Item name="expiresInDays" label={t('apiKeys.form.expiresInDays')}>
						<Input type="number" min={1} placeholder={t('apiKeys.form.expiresInDaysPlaceholder')} />
					</Form.Item>
				</Form>
			</Modal>
		</div>
	);
}
