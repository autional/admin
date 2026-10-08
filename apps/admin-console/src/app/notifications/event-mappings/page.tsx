'use client';

import React, { useMemo, useState } from 'react';
import { Button, Space, Tag, Modal, Form, Select, Switch, Popconfirm, Tooltip } from 'antd';
import { message } from '@/lib/antd-app';
import { Pencil, Plus, Tag as TagIcon, Trash2 } from 'lucide-react';
import { useNavigate } from 'react-router';
import { useTranslation } from 'react-i18next';
import { useTenantSlug, usePageTitle } from '@autional/shared';
import { buildNavHref } from '@/lib/nav';
import {
	useEventMappings,
	useCreateEventMapping,
	useUpdateEventMapping,
	useDeleteEventMapping,
} from '@/hooks/use-event-mappings';
// A-164（TASK-AB1-26）：选择器数据源切 /available admin twin（列表端点 TemplateResponse 无 code 字段）
import { useAvailableNotificationTemplates } from '@/hooks/use-notifications';
import { handleApiError } from '@/lib/error-handler';
import { PageError, DataTable } from '@autional/ui/antd';
import { AppPageHeader } from '@autional/ui';

const { Option } = Select;

// A-168：词表与 registry 单源对证（shared/service-core/cross/registry/event_names.go）——
// ① 删幻影 user.email_changed / user.phone_changed（registry 无此二键、全工作区无生产者）；
// ② 补 6 个已有平台默认映射（EventMappingSeeds）的事件：
//    storage.file.shared(:73) / storage.share.cancelled(:90) / secret.expiring_soon(:503) /
//    secret.expired(:502) / secret.rotation_due(:506) / secret.access_denied(:505)。
const EVENT_TYPES = [
	'user.registered',
	'user.password_changed',
	'user.new_device',
	'user.deleted',
	'rbac.approval.requested',
	'auth.login_failed',
	'billing.payment.success',
	'billing.quota.warning',
	'storage.file.shared',
	'storage.share.cancelled',
	'secret.expiring_soon',
	'secret.expired',
	'secret.rotation_due',
	'secret.access_denied',
];

const CHANNELS = ['in_app', 'email', 'sms', 'push'];

const PRIORITIES = ['low', 'medium', 'high', 'critical'];

const SOURCES = ['wallet', 'billing', 'payment', 'point', 'status', 'secret', 'storage', 'saml'];

export default function EventMappingsPage() {
	const { t } = useTranslation();
	// A-169：页面标题（与面包屑同源；原 tab 恒默认站名）
	usePageTitle(t('notifications.eventMappings.title'));
	const [modalVisible, setModalVisible] = useState(false);
	const [editing, setEditing] = useState<Record<string, unknown> | null>(null);
	const [form] = Form.useForm();
	const [sourceFilter, setSourceFilter] = useState<string>('all');
	const navigate = useNavigate();
	const tenantSlug = useTenantSlug();

	const { data = [], isLoading, error, refetch } = useEventMappings();
	const { data: templates = [] } = useAvailableNotificationTemplates();
	const createMut = useCreateEventMapping();
	const updateMut = useUpdateEventMapping();
	const deleteMut = useDeleteEventMapping();

	// A-169：渠道/优先级枚举本地化（原裸显 in_app/medium；未知值回落原枚举）
	const channelLabel = (v: string) => t(`notifications.eventMappings.channel.${v}`, v);
	const priorityLabel = (p: string) => t(`notifications.eventMappings.priority.${p}`, p);

	const filteredData = useMemo(() => {
		if (sourceFilter === 'all') return data;
		return (data as Array<Record<string, unknown>>).filter((item) => {
			const et = item.eventType as string | undefined;
			return et && et.startsWith(sourceFilter + '.');
		});
	}, [data, sourceFilter]);

	const handleSave = async (values: Record<string, unknown>) => {
		try {
			if (editing) {
				await updateMut.mutateAsync({ id: editing.id as string, data: values });
				message.success(t('notifications.eventMappings.updateSuccess'));
			} else {
				await createMut.mutateAsync(values);
				message.success(t('notifications.eventMappings.createSuccess'));
			}
			setModalVisible(false);
			setEditing(null);
			form.resetFields();
		} catch (err) {
			handleApiError(err, t('notifications.eventMappings.saveFailed'));
		}
	};

	const openCreate = () => {
		setEditing(null);
		form.resetFields();
		form.setFieldsValue({ channel: 'in_app', priority: 'medium' });
		setModalVisible(true);
	};

	const openEdit = (record: Record<string, unknown>) => {
		setEditing(record);
		form.setFieldsValue(record);
		setModalVisible(true);
	};

	const columns = [
		{
			title: t('notifications.eventMappings.eventType'),
			dataIndex: 'eventType',
			key: 'eventType',
			width: 220,
		},
		{
			title: t('notifications.eventMappings.templateCode'),
			dataIndex: 'templateCode',
			key: 'templateCode',
			width: 180,
			render: (v: string) => (
				<Button
					type="link"
					size="small"
					icon={<TagIcon size="1em" />}
					onClick={() => navigate(buildNavHref('/notifications/templates', tenantSlug))}
					className="p-0"
				>
					{v}
				</Button>
			),
		},
		{
			title: t('notifications.eventMappings.channel'),
			dataIndex: 'channel',
			key: 'channel',
			width: 100,
			render: (v: string) => <Tag>{channelLabel(v)}</Tag>,
		},
		{
			title: t('notifications.eventMappings.priority'),
			dataIndex: 'priority',
			key: 'priority',
			width: 100,
			render: (v: string) => priorityLabel(v),
		},
		{
			title: t('common.status'),
			dataIndex: 'isEnabled',
			key: 'isEnabled',
			width: 100,
			render: (v: boolean, record: Record<string, unknown>) => (
				<Switch
					checked={v}
					onChange={async (checked: boolean) => {
						try {
							await updateMut.mutateAsync({
								id: record.id as string,
								// RC-5（TASK-AB1-27）：提交侧 camel 书面写（拦截器 snake 化上 wire）
								data: { isEnabled: checked },
							});
							message.success(
								checked
									? t('notifications.eventMappings.enabled')
									: t('notifications.eventMappings.disabled'),
							);
						} catch (err) {
							handleApiError(err, t('notifications.eventMappings.operationFailed'));
						}
					}}
				/>
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
							icon={<Pencil size="1em" />}
							aria-label={t('common.edit')}
							onClick={() => openEdit(record)}
						/>
					</Tooltip>
					<Popconfirm
						title={t('notifications.eventMappings.confirmDelete')}
						onConfirm={async () => {
							try {
								await deleteMut.mutateAsync(record.id as string);
								message.success(t('notifications.eventMappings.deleteSuccess'));
							} catch (err) {
								handleApiError(err, t('notifications.eventMappings.deleteFailed'));
							}
						}}
					>
						<Button size="small" danger icon={<Trash2 size="1em" />} aria-label={t('common.delete')} />
					</Popconfirm>
				</Space>
			),
		},
	];

	return (
		<div>
			<AppPageHeader
				title={t('notifications.eventMappings.title')}
				actions={
					<>
						<Button type="primary" icon={<Plus size="1em" />} onClick={openCreate}>
							{t('notifications.eventMappings.createMapping')}
						</Button>
					</>
				}
			/>
			<div className="mb-4">
				<Select
					value={sourceFilter}
					onChange={setSourceFilter}
					className="w-[180px]"
					placeholder={t('notifications.eventMappings.selectSource')}
				>
					<Option key="all" value="all">
						{t('notifications.eventMappings.allSources')}
					</Option>
					{SOURCES.map((s) => (
						<Option key={s} value={s}>
							{s}
						</Option>
					))}
				</Select>
			</div>
			{error && (
				<PageError
					message={t('notifications.eventMappings.loadError')}
					retry={refetch}
					className="mb-4"
				/>
			)}
			<DataTable
				rowKey="id"
				columns={columns}
				dataSource={filteredData as readonly Record<string, unknown>[]}
				loading={isLoading}
				pagination={{ pageSize: 10 }}
				scroll={{ x: 800 }}
			/>

			<Modal
				title={
					editing
						? t('notifications.eventMappings.editMapping')
						: t('notifications.eventMappings.createMapping')
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
						name="eventType"
						label={t('notifications.eventMappings.eventType')}
						rules={[{ required: true }]}
					>
						<Select showSearch placeholder={t('notifications.eventMappings.selectEventType')}>
							{EVENT_TYPES.map((t) => (
								<Option key={t} value={t}>
									{t}
								</Option>
							))}
						</Select>
					</Form.Item>
					<Form.Item
						name="templateCode"
						label={t('notifications.eventMappings.notificationTemplate')}
						rules={[{ required: true }]}
					>
						{/* A-164（TASK-AB1-26）：数据源 = /available admin twin（条目含 code），value = code */}
						<Select showSearch placeholder={t('notifications.eventMappings.selectTemplate')}>
							{templates.map((tpl) => (
								<Option key={tpl.code} value={tpl.code}>
									{tpl.name}
								</Option>
							))}
						</Select>
					</Form.Item>
					<Form.Item name="channel" label={t('notifications.eventMappings.channel')}>
						<Select>
							{CHANNELS.map((c) => (
								<Option key={c} value={c}>
									{channelLabel(c)}
								</Option>
							))}
						</Select>
					</Form.Item>
					<Form.Item name="priority" label={t('notifications.eventMappings.priority')}>
						<Select>
							{PRIORITIES.map((p) => (
								<Option key={p} value={p}>
									{priorityLabel(p)}
								</Option>
							))}
						</Select>
					</Form.Item>
				</Form>
			</Modal>
		</div>
	);
}
