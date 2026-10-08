'use client';

import React, { useState } from 'react';
import { useCurrentTenantIdOr } from '@autional/shared';
import { Button, Space, Tag, Modal, Form, Input, Select, Switch, Timeline, Popconfirm, Spin, Empty } from 'antd';
import { message } from '@/lib/antd-app';
import {
	FileText,
	Pencil,
	Plus,
	Send,
	Trash2,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import {
	useWebhooks,
	useCreateWebhook,
	useUpdateWebhook,
	useDeleteWebhook,
	useTestWebhook,
	useWebhookDeliveryLogs,
} from '@/hooks/use-webhooks';
import type { WebhookRecord, DeliveryLog } from '@/hooks/use-webhooks';

import { handleApiError } from '@/lib/error-handler';
import { DataTable, Drawer, PageError } from '@autional/ui/antd';
import { AppPageHeader } from '@autional/ui';
import { createWebhookSchema } from '@/lib/validators';

const { Option } = Select;

const EVENT_OPTIONS = [
	'user.created',
	'user.deleted',
	'user.updated',
	'session.revoked',
	'session.created',
	'tenant.suspended',
	'tenant.activated',
	'mfa.enabled',
	'mfa.disabled',
];

/** A-40：投递状态 → 颜色（Timeline 点 / Tag），值域见 service-tenant domain/webhook.go:26-31。 */
const DELIVERY_STATUS_COLORS: Record<string, { timeline: string; tag: string }> = {
	pending: { timeline: 'gray', tag: 'default' },
	sent: { timeline: 'blue', tag: 'processing' },
	delivered: { timeline: 'green', tag: 'success' },
	failed: { timeline: 'red', tag: 'error' },
	retrying: { timeline: 'orange', tag: 'warning' },
	permanently_failed: { timeline: 'red', tag: 'error' },
};

export default function WebhooksPage() {
	const { t } = useTranslation();
	const [modalVisible, setModalVisible] = useState(false);
	const [logDrawerVisible, setLogDrawerVisible] = useState(false);
	const [editing, setEditing] = useState<WebhookRecord | null>(null);
	const [selectedHookId, setSelectedHookId] = useState<string>('');
	const [form] = Form.useForm();
	const tenantId = useCurrentTenantIdOr('default-tenant');

	const { data = [], isLoading, error, refetch } = useWebhooks(tenantId);
	const createMut = useCreateWebhook();
	const updateMut = useUpdateWebhook();
	const deleteMut = useDeleteWebhook();
	const testMut = useTestWebhook();
	const { data: deliveryLogs = [], isLoading: logsLoading } = useWebhookDeliveryLogs(
		selectedHookId ? tenantId : '',
		selectedHookId,
	);

	const handleSave = async (values: any) => {
		try {
			const result = createWebhookSchema.safeParse(values);
			if (!result.success) {
				result.error.issues.forEach((i) => message.error(i.message));
				return;
			}
			const payload = {
				name: result.data.name,
				url: result.data.url,
				secret: result.data.secret,
				events: result.data.events,
				status: result.data.status ? 'active' : 'inactive',
				retryPolicy: {
					maxRetries: result.data.maxRetries || 3,
					backoff: result.data.backoff || '1s',
				},
			};
			if (editing) {
				await updateMut.mutateAsync({ tenantId, id: editing.id, data: payload });
				message.success(t('webhooks.updateSuccess'));
			} else {
				await createMut.mutateAsync({ tenantId, data: payload });
				message.success(t('webhooks.createSuccess'));
			}
			setModalVisible(false);
			setEditing(null);
			form.resetFields();
		} catch (err) {
			handleApiError(err, t('webhooks.saveFailed'));
		}
	};

	const handleDelete = async (id: string) => {
		try {
			await deleteMut.mutateAsync({ tenantId, id });
			message.success(t('webhooks.deleteSuccess'));
		} catch (err) {
			handleApiError(err, t('webhooks.deleteError'));
		}
	};

	const handleTest = async (record: WebhookRecord) => {
		try {
			await testMut.mutateAsync({ tenantId, id: record.id });
			message.success(t('webhooks.testSuccess'));
		} catch (err) {
			handleApiError(err, t('webhooks.testError'));
		}
	};

	const openLogs = (record: WebhookRecord) => {
		setSelectedHookId(record.id);
		setLogDrawerVisible(true);
	};

	const columns = [
		{ title: t('common.name'), dataIndex: 'name', key: 'name' },
		{
			title: t('webhooks.column.url'),
			dataIndex: 'url',
			key: 'url',
			ellipsis: true,
			render: (v: string) => <span title={v}>{v}</span>,
		},
		{
			title: t('webhooks.column.events'),
			dataIndex: 'events',
			key: 'events',
			render: (events: string[]) => (
				<Space size="small" wrap>
					{events?.map((e) => (
						<Tag key={e}>{e}</Tag>
					))}
				</Space>
			),
		},
		{
			title: t('common.status'),
			dataIndex: 'status',
			key: 'status',
			render: (status: string) => (
				<Tag color={status === 'active' ? 'success' : 'default'}>
					{status === 'active' ? t('common.enable') : t('common.disable')}
				</Tag>
			),
		},
		{
			title: t('webhooks.column.lastDelivery'),
			key: 'lastDelivery',
			render: (_: any, record: WebhookRecord) => (
				<div>
					{record.lastDeliveryStatus && (
						<Tag color={record.lastDeliveryStatus === 'success' ? 'success' : 'error'}>
							{record.lastDeliveryStatus}
						</Tag>
					)}
					{record.lastDeliveryAt && (
						<div className="text-xs text-neutral-600">{record.lastDeliveryAt}</div>
					)}
				</div>
			),
		},
		{
			title: t('common.actions'),
			key: 'action',
			render: (_: any, record: WebhookRecord) => (
				<Space size="small">
					<Button
						type="text"
						size="small"
						icon={<Pencil size="1em" />}
						onClick={() => {
							setEditing(record);
							form.setFieldsValue({
								name: record.name,
								url: record.url,
								secret: record.secret,
								events: record.events,
								status: record.status === 'active',
								maxRetries: record.retryPolicy?.maxRetries || 3,
								backoff: record.retryPolicy?.backoff || '1s',
							});
							setModalVisible(true);
						}}
					>
						{t('common.edit')}
					</Button>
					<Button
						type="text"
						size="small"
						icon={<Send size="1em" />}
						onClick={() => handleTest(record)}
					>
						{t('webhooks.test')}
					</Button>
					<Button
						type="text"
						size="small"
						icon={<FileText size="1em" />}
						onClick={() => openLogs(record)}
					>
						{t('webhooks.logs')}
					</Button>
					<Popconfirm title={t('webhooks.deleteConfirm')} onConfirm={() => handleDelete(record.id)}>
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
			<AppPageHeader
				title={t('webhooks.title')}
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
							{t('webhooks.createWebhook')}
						</Button>
					</>
				}
			/>

			{error && <PageError message={t('webhooks.loadError')} retry={refetch} className="mb-4" />}
			<DataTable
				rowKey="id"
				columns={columns}
				dataSource={data}
				loading={isLoading}
				pagination={{ pageSize: 10 }}
				locale={{ emptyText: <Empty description={t('webhooks.noWebhooks')} /> }}
				scroll={{ x: 800 }}
			/>

			<Modal
				title={editing ? t('webhooks.editWebhook') : t('webhooks.createWebhook')}
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
				<Form form={form} layout="vertical" onFinish={handleSave}>
					<Form.Item name="name" label={t('common.name')} rules={[{ required: true }]}>
						<Input placeholder={t('webhooks.namePlaceholder')} />
					</Form.Item>
					<Form.Item name="url" label={t('webhooks.column.url')} rules={[{ required: true }]}>
						<Input placeholder={t('webhooks.urlPlaceholder')} />
					</Form.Item>
					<Form.Item name="secret" label={t('webhooks.column.secret')}>
						<Input.Password placeholder={t('webhooks.secretPlaceholder')} />
					</Form.Item>
					<Form.Item name="events" label={t('webhooks.column.events')} rules={[{ required: true }]}>
						<Select mode="multiple" placeholder={t('webhooks.eventsPlaceholder')}>
							{EVENT_OPTIONS.map((e) => (
								<Option key={e} value={e}>
									{e}
								</Option>
							))}
						</Select>
					</Form.Item>
					<Form.Item
						name="status"
						label={t('webhooks.statusLabel')}
						valuePropName="checked"
						initialValue={true}
					>
						<Switch checkedChildren={t('common.enable')} unCheckedChildren={t('common.disable')} />
					</Form.Item>
					<Form.Item name="maxRetries" label={t('webhooks.maxRetries')} initialValue={3}>
						<Input type="number" min={0} max={10} />
					</Form.Item>
					<Form.Item name="backoff" label={t('webhooks.backoff')} initialValue="1s">
						<Input placeholder={t('webhooks.backoffPlaceholder')} />
					</Form.Item>
				</Form>
			</Modal>

			<Drawer
				title={t('webhooks.deliveryLogs')}
				size="md"
				open={logDrawerVisible}
				onClose={() => setLogDrawerVisible(false)}
				className="!w-full sm:!w-[480px]"
			>
				{logsLoading ? (
					<Spin className="flex justify-center py-16" />
				) : deliveryLogs.length === 0 ? (
					<Empty description={t('webhooks.noDeliveryLogs')} />
				) : (
					<Timeline mode="left">
						{deliveryLogs.map((log: DeliveryLog) => {
							const statusColor = DELIVERY_STATUS_COLORS[log.status ?? ''];
							return (
								<Timeline.Item
									key={log.id}
									color={statusColor?.timeline ?? 'gray'}
									label={log.createdAt ? new Date(log.createdAt).toLocaleString() : '-'}
								>
									<div className="text-sm">
										<Tag color={statusColor?.tag ?? 'default'}>{log.status || '-'}</Tag>
										{typeof log.durationMs === 'number' && (
											<span className="text-neutral-600 ml-2">{log.durationMs}ms</span>
										)}
									</div>
									<div className="mt-1 text-xs text-neutral-600">
										{log.eventType}
										{typeof log.statusCode === 'number' && ` · HTTP ${log.statusCode}`}
										{typeof log.attempt === 'number' &&
											` · ${t('webhooks.attemptCount', { count: log.attempt })}`}
									</div>
									<div className="mt-2 bg-neutral-50 p-2 rounded-xs text-xs">
										<div className="font-medium">{t('webhooks.request')}</div>
										<pre className="whitespace-pre-wrap break-all">{log.payload || '-'}</pre>
									</div>
									<div className="mt-2 bg-neutral-50 p-2 rounded-xs text-xs">
										<div className="font-medium">{t('webhooks.response')}</div>
										<pre className="whitespace-pre-wrap break-all">{log.response || '-'}</pre>
									</div>
									{log.error && (
										<div className="mt-2 text-xs text-danger-text">
											{t('webhooks.error')}: {log.error}
										</div>
									)}
								</Timeline.Item>
							);
						})}
					</Timeline>
				)}
			</Drawer>
		</div>
	);
}
