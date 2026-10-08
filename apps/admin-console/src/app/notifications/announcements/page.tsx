'use client';

import React, { useState } from 'react';
import { Button, Space, Tag, Modal, Form, Input, Select, DatePicker, Popconfirm } from 'antd';
import { message } from '@/lib/antd-app';
import {
	PlusOutlined,
	EditOutlined,
	DeleteOutlined,
	SendOutlined,
	RollbackOutlined,
} from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import dayjs from 'dayjs';
import {
	useAnnouncements,
	useCreateAnnouncement,
	useUpdateAnnouncement,
	useDeleteAnnouncement,
	usePublishAnnouncement,
	useUnpublishAnnouncement,
	type AnnouncementRecord,
} from '@/hooks/use-announcements';
import { handleApiError } from '@/lib/error-handler';
import { PageError, DataTable } from '@autional/ui/antd';
import { AppPageHeader } from '@autional/ui';

const { TextArea } = Input;

const STATUS_COLORS: Record<string, string> = {
	draft: 'default',
	scheduled: 'blue',
	published: 'success',
	expired: 'warning',
};

function formatTime(value?: string) {
	return value ? new Date(value).toLocaleString('zh-CN') : '-';
}

export default function AnnouncementsPage() {
	const { t } = useTranslation();
	const [modalVisible, setModalVisible] = useState(false);
	const [editing, setEditing] = useState<AnnouncementRecord | null>(null);
	const [page, setPage] = useState(1);
	const [pageSize, setPageSize] = useState(10);
	const [statusFilter, setStatusFilter] = useState<string | undefined>(undefined);
	const [search, setSearch] = useState('');
	const [form] = Form.useForm();

	// RC-5（TASK-AB1-27）：查询入参 camel 书面写（分页键经 hook 内 toPageParams 单点转 wire snake）
	const { data, isLoading, error, refetch } = useAnnouncements({
		page,
		pageSize,
		status: statusFilter,
		search: search || undefined,
	});
	const items = data?.items ?? [];
	const total = data?.pagination.total ?? 0;

	const createMut = useCreateAnnouncement();
	const updateMut = useUpdateAnnouncement();
	const deleteMut = useDeleteAnnouncement();
	const publishMut = usePublishAnnouncement();
	const unpublishMut = useUnpublishAnnouncement();

	const statusLabels: Record<string, string> = {
		draft: t('notifications.announcements.status.draft'),
		scheduled: t('notifications.announcements.status.scheduled'),
		published: t('notifications.announcements.status.published'),
		expired: t('notifications.announcements.status.expired'),
	};

	const closeModal = () => {
		setModalVisible(false);
		setEditing(null);
		form.resetFields();
	};

	const openCreate = () => {
		setEditing(null);
		form.resetFields();
		setModalVisible(true);
	};

	const openEdit = (record: AnnouncementRecord) => {
		setEditing(record);
		form.setFieldsValue({
			title: record.title,
			content: record.content,
			targetRoles: record.targetRoles ?? [],
			publishAt: record.publishAt ? dayjs(record.publishAt) : undefined,
			expireAt: record.expireAt ? dayjs(record.expireAt) : undefined,
		});
		setModalVisible(true);
	};

	const handleSave = async (values: any) => {
		try {
			// 提交侧 camel 书面写（拦截器 snake 化上 wire；wire 锚：domain.go:208-210 target_roles/publish_at/expire_at）
			const payload: Record<string, unknown> = {
				title: values.title,
				content: values.content,
				targetRoles: values.targetRoles ?? [],
			};
			if (values.publishAt) payload.publishAt = values.publishAt.toISOString();
			if (values.expireAt) payload.expireAt = values.expireAt.toISOString();

			if (editing) {
				await updateMut.mutateAsync({ id: editing.id, data: payload });
				message.success(t('notifications.announcements.updateSuccess'));
			} else {
				await createMut.mutateAsync(payload);
				message.success(t('notifications.announcements.createSuccess'));
			}
			closeModal();
		} catch (err) {
			handleApiError(err, t('notifications.announcements.saveFailed'));
		}
	};

	const handleDelete = async (id: string) => {
		try {
			await deleteMut.mutateAsync(id);
			message.success(t('notifications.announcements.deleteSuccess'));
		} catch (err) {
			handleApiError(err, t('notifications.announcements.deleteFailed'));
		}
	};

	const handlePublish = async (id: string) => {
		try {
			await publishMut.mutateAsync(id);
			message.success(t('notifications.announcements.publishSuccess'));
		} catch (err) {
			handleApiError(err, t('notifications.announcements.publishFailed'));
		}
	};

	const handleUnpublish = async (id: string) => {
		try {
			await unpublishMut.mutateAsync(id);
			message.success(t('notifications.announcements.unpublishSuccess'));
		} catch (err) {
			handleApiError(err, t('notifications.announcements.unpublishFailed'));
		}
	};

	const columns = [
		{ title: t('notifications.announcements.announcementTitle'), dataIndex: 'title', key: 'title' },
		{
			title: t('common.status'),
			dataIndex: 'status',
			key: 'status',
			width: 110,
			render: (status: string) => (
				<Tag color={STATUS_COLORS[status] || 'default'}>{statusLabels[status] || status}</Tag>
			),
		},
		{
			title: t('notifications.announcements.targetRoles'),
			dataIndex: 'targetRoles',
			key: 'targetRoles',
			width: 200,
			render: (roles?: string[]) =>
				roles && roles.length > 0 ? (
					<Space size={4} wrap>
						{roles.map((r) => (
							<Tag key={r}>{r}</Tag>
						))}
					</Space>
				) : (
					<span className="text-neutral-600">{t('notifications.announcements.allUsers')}</span>
				),
		},
		{
			title: t('notifications.announcements.publishAt'),
			dataIndex: 'publishAt',
			key: 'publishAt',
			width: 180,
			render: formatTime,
		},
		{
			title: t('notifications.announcements.views'),
			dataIndex: 'views',
			key: 'views',
			width: 90,
		},
		{
			title: t('notifications.announcements.updatedAt'),
			dataIndex: 'updatedAt',
			key: 'updatedAt',
			width: 180,
			render: formatTime,
		},
		{
			title: t('common.actions'),
			key: 'action',
			width: 260,
			render: (_: any, record: AnnouncementRecord) => (
				<Space size="small">
					{record.status === 'draft' && (
						<Button
							type="text"
							size="small"
							icon={<EditOutlined />}
							onClick={() => openEdit(record)}
						>
							{t('common.edit')}
						</Button>
					)}
					{(record.status === 'draft' || record.status === 'scheduled') && (
						<Popconfirm
							title={t('notifications.announcements.confirmPublish')}
							onConfirm={() => handlePublish(record.id)}
						>
							<Button type="text" size="small" icon={<SendOutlined />}>
								{t('notifications.announcements.publish')}
							</Button>
						</Popconfirm>
					)}
					{record.status === 'published' && (
						<Popconfirm
							title={t('notifications.announcements.confirmUnpublish')}
							onConfirm={() => handleUnpublish(record.id)}
						>
							<Button type="text" size="small" icon={<RollbackOutlined />}>
								{t('notifications.announcements.unpublish')}
							</Button>
						</Popconfirm>
					)}
					{record.status === 'draft' && (
						<Popconfirm
							title={t('notifications.announcements.confirmDelete')}
							onConfirm={() => handleDelete(record.id)}
						>
							<Button type="text" danger size="small" icon={<DeleteOutlined />}>
								{t('common.delete')}
							</Button>
						</Popconfirm>
					)}
				</Space>
			),
		},
	];

	return (
		<div>
			<AppPageHeader
				title={t('notifications.announcements.title')}
				actions={
					<>
						<Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
							{t('notifications.announcements.createAnnouncement')}
						</Button>
					</>
				}
			/>

			<div className="flex flex-col sm:flex-row gap-3 mb-4">
				<Input.Search
					className="w-full sm:max-w-[280px]"
					placeholder={t('notifications.announcements.searchPlaceholder')}
					allowClear
					onSearch={(value) => {
						setSearch(value);
						setPage(1);
					}}
				/>
				<Select
					className="w-full sm:w-[180px]"
					placeholder={t('notifications.announcements.statusFilter')}
					allowClear
					value={statusFilter}
					onChange={(value) => {
						setStatusFilter(value);
						setPage(1);
					}}
					options={[
						{ value: 'draft', label: t('notifications.announcements.status.draft') },
						{ value: 'scheduled', label: t('notifications.announcements.status.scheduled') },
						{ value: 'published', label: t('notifications.announcements.status.published') },
						{ value: 'expired', label: t('notifications.announcements.status.expired') },
					]}
				/>
			</div>

			{error && (
				<PageError
					message={t('notifications.announcements.loadError')}
					retry={refetch}
					className="mb-4"
				/>
			)}
			<DataTable
				rowKey="id"
				columns={columns}
				dataSource={items}
				loading={isLoading}
				scroll={{ x: 1000 }}
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
			/>

			<Modal
				title={
					editing
						? t('notifications.announcements.editAnnouncement')
						: t('notifications.announcements.createAnnouncement')
				}
				open={modalVisible}
				onCancel={closeModal}
				onOk={() => form.submit()}
				width={720}
				className="w-full max-w-[720px]"
				destroyOnHidden
			>
				<Form form={form} layout="vertical" onFinish={handleSave}>
					<Form.Item
						name="title"
						label={t('notifications.announcements.announcementTitle')}
						rules={[{ required: true }]}
					>
						<Input placeholder={t('notifications.announcements.titlePlaceholder')} />
					</Form.Item>
					<Form.Item
						name="content"
						label={t('notifications.announcements.content')}
						rules={[{ required: true }]}
					>
						<TextArea rows={6} placeholder={t('notifications.announcements.contentPlaceholder')} />
					</Form.Item>
					<Form.Item name="targetRoles" label={t('notifications.announcements.targetRoles')}>
						<Select
							mode="tags"
							placeholder={t('notifications.announcements.targetRolesPlaceholder')}
							options={[]}
						/>
					</Form.Item>
					<Form.Item name="publishAt" label={t('notifications.announcements.publishAt')}>
						<DatePicker showTime className="w-full" />
					</Form.Item>
					<Form.Item name="expireAt" label={t('notifications.announcements.expireAt')}>
						<DatePicker showTime className="w-full" />
					</Form.Item>
				</Form>
			</Modal>
		</div>
	);
}
