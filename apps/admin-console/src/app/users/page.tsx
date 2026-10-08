'use client';

import React, { useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { Tag, Button, Input, Space, Popconfirm, Empty, Skeleton, Modal, Form, Checkbox } from 'antd';
import { message } from '@/lib/antd-app';
import {
	AlertTriangle,
	Check,
	Lock,
	Pencil,
	Plus,
	Search,
	Trash2,
	X,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useTenantSlug } from '@autional/shared';
import { buildNavHref } from '@/lib/nav';
import { useUsers, useDeleteUser, useCreateUser, useUpdateUser } from '@/hooks/use-users';
import { handleApiError } from '@/lib/error-handler';
import { PageError, DataTable } from '@autional/ui/antd';
import { AppPageHeader } from '@autional/ui';
import { createUserSchema } from '@/lib/validators';

interface UserRecord {
	id: string;
	username: string;
	email: string;
	status: string;
	createdAt: string;
	passwordStatus?: 'normal' | 'expiring' | 'expired' | 'must_change';
}

export default function UsersPage() {
	const { t } = useTranslation();
	const navigate = useNavigate();
	const tenantSlug = useTenantSlug();
	const [keyword, setKeyword] = useState('');
	const [searchKeyword, setSearchKeyword] = useState('');
	const searchTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
	const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([]);
	const [createModalOpen, setCreateModalOpen] = useState(false);
	const [editModalOpen, setEditModalOpen] = useState(false);
	const [editingUser, setEditingUser] = useState<UserRecord | null>(null);
	const [createForm] = Form.useForm();
	const [editForm] = Form.useForm();

	// ADM-002 / H008（TASK-AB1-17）：服务端分页单点驱动——useUsers 内以 toPageParams 发
	// page/page_size，total 由列表结果（fromPageResult 归一）直接取，不再发独立 total 二次请求。
	const [page, setPage] = useState(1);
	const pageSize = 10;
	const { data, isLoading, error, refetch } = useUsers({
		search: searchKeyword,
		page,
		pageSize,
	});
	const deleteUserMutation = useDeleteUser();
	const createUserMutation = useCreateUser();
	const updateUserMutation = useUpdateUser();

	const handleCreate = async (values: {
		username: string;
		email: string;
		password: string;
		forcePasswordChange?: boolean;
	}) => {
		const result = createUserSchema.passthrough().safeParse(values);
		if (!result.success) {
			result.error.issues.forEach((i) => message.error(i.message));
			return;
		}
		try {
			await createUserMutation.mutateAsync(result.data);
			message.success(t('users.createSuccess'));
			setCreateModalOpen(false);
			createForm.resetFields();
			refetch();
		} catch (err) {
			handleApiError(err, t('users.createError'));
		}
	};

	const handleDelete = async (id: string) => {
		try {
			await deleteUserMutation.mutateAsync(id);
			message.success(t('users.deleteSuccess'));
		} catch (err) {
			handleApiError(err, t('users.deleteError'));
		}
	};

	const handleEdit = async (values: { username: string; email: string; reason?: string }) => {
		if (!editingUser) return;
		try {
			// AC-005/ADR-07：admin 直改 email 必须提供 reason（61002205 拒绝缺失）
			await updateUserMutation.mutateAsync({ id: editingUser.id, data: values });
			message.success(t('users.updateSuccess'));
			setEditModalOpen(false);
			setEditingUser(null);
			editForm.resetFields();
			refetch();
		} catch (err) {
			handleApiError(err, t('users.updateError'));
		}
	};

	const handleBatchDelete = async () => {
		try {
			await Promise.all(selectedRowKeys.map((id) => deleteUserMutation.mutateAsync(id as string)));
			message.success(t('users.batchDeleteSuccess'));
			setSelectedRowKeys([]);
		} catch (err) {
			handleApiError(err, t('users.batchDeleteError'));
		}
	};

	const columns = [
		{ title: t('users.column.id'), dataIndex: 'id', key: 'id', ellipsis: true },
		{ title: t('users.column.username'), dataIndex: 'username', key: 'username' },
		{ title: t('users.column.email'), dataIndex: 'email', key: 'email' },
		{
			title: t('users.column.status'),
			dataIndex: 'status',
			key: 'status',
			render: (status: string) => (
				<Tag
					color={
						status === 'active'
							? 'success'
							: status === 'locked' || status === 'banned' || status === 'suspended'
								? 'error'
								: 'default'
					}
				>
					{status === 'active'
						? t('users.statusActive')
						: status === 'locked'
							? t('users.statusLocked')
							: status === 'banned'
								? t('users.statusBanned')
								: status === 'suspended'
									? t('users.statusSuspended')
									: status === 'deleted'
										? t('users.statusDeleted')
										: status === 'disabled'
											? t('users.statusDisabled')
											: status}
				</Tag>
			),
		},
		{
			title: t('usersTable.passwordStatus'),
			dataIndex: 'passwordStatus',
			key: 'passwordStatus',
			render: (status: string | undefined) => {
				switch (status) {
					case 'normal':
						return (
							<Tag icon={<Check size="1em" />} color="success">
								{t('usersTable.passwordNormal')}
							</Tag>
						);
					case 'expiring':
						return (
							<Tag icon={<AlertTriangle size="1em" />} color="warning">
								{t('usersTable.passwordExpiring')}
							</Tag>
						);
					case 'expired':
						return (
							<Tag icon={<X size="1em" />} color="error">
								{t('usersTable.passwordExpired')}
							</Tag>
						);
					case 'must_change':
						return (
							<Tag icon={<Lock size="1em" />} color="processing">
								{t('usersTable.passwordMustChange')}
							</Tag>
						);
					default:
						return <Tag color="default">{t('usersTable.passwordUnknown')}</Tag>;
				}
			},
		},
		{ title: t('users.column.createdAt'), dataIndex: 'createdAt', key: 'createdAt' },
		{
			title: t('common.actions'),
			key: 'action',
			render: (_: any, record: UserRecord) => (
				<Space size="small">
					<Button type="link" size="small" onClick={() => navigate(buildNavHref(`/users/${record.id}`, tenantSlug))}>
						{t('users.viewDetail')}
					</Button>
					<Button
						type="link"
						size="small"
						icon={<Pencil size="1em" />}
						onClick={() => {
							setEditingUser(record);
							editForm.setFieldsValue({ username: record.username, email: record.email });
							setEditModalOpen(true);
						}}
					>
						{t('common.edit')}
					</Button>
					<Popconfirm title={t('users.deleteConfirm')} onConfirm={() => handleDelete(record.id)}>
						<Button type="link" size="small" danger>
							{t('common.delete')}
						</Button>
					</Popconfirm>
				</Space>
			),
		},
	];

	const rowSelection = {
		selectedRowKeys,
		onChange: (keys: React.Key[]) => setSelectedRowKeys(keys),
	};

	return (
		<div>
			<AppPageHeader
				title={t('nav.users')}
				actions={
					<>
						<Button type="primary" icon={<Plus size="1em" />} onClick={() => setCreateModalOpen(true)}>
							{t('users.createUser')}
						</Button>
					</>
				}
			/>

			{error && <PageError message={t('users.loadError')} retry={refetch} className="mb-4" />}

			{isLoading && !error ? (
				<Skeleton active paragraph={{ rows: 6 }} />
			) : (
				<>
					<div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mb-4">
						<Input.Search
							placeholder={t('users.searchPlaceholder')}
							allowClear
							enterButton={<Search size="1em" />}
							value={keyword}
							onChange={(e) => {
								setKeyword(e.target.value);
								if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
								searchTimerRef.current = setTimeout(() => {
									setSearchKeyword(e.target.value);
									setPage(1);
								}, 300);
							}}
							onSearch={(value) => {
								if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
								setSearchKeyword(value);
								setPage(1);
							}}
							className="max-w-md"
						/>
						{selectedRowKeys.length > 0 && (
							<Popconfirm
								title={t('users.batchDeleteConfirm', { count: selectedRowKeys.length })}
								onConfirm={handleBatchDelete}
							>
								<Button danger icon={<Trash2 size="1em" />}>
									{t('users.batchDelete', { count: selectedRowKeys.length })}
								</Button>
							</Popconfirm>
						)}
					</div>

					<DataTable
						rowKey="id"
						columns={columns}
						dataSource={data?.items || []}
						rowSelection={rowSelection}
						pagination={{
							current: page,
							pageSize,
							total: data?.total ?? 0,
							onChange: (p) => setPage(p),
							showSizeChanger: false,
						}}
						locale={{ emptyText: <Empty description={t('users.noUsers')} /> }}
						scroll={{ x: 800 }}
					/>
				</>
			)}

			<Modal
				title={t('users.createUser')}
				open={createModalOpen}
				onCancel={() => {
					setCreateModalOpen(false);
					createForm.resetFields();
				}}
				onOk={() => createForm.submit()}
				confirmLoading={createUserMutation.isPending}
				destroyOnHidden
				className="w-full max-w-[560px]"
			>
				<Form form={createForm} layout="vertical" onFinish={handleCreate}>
					<Form.Item
						name="username"
						label={t('users.column.username')}
						rules={[{ required: true, message: t('users.usernameRequired') }]}
					>
						<Input placeholder={t('users.usernamePlaceholder')} />
					</Form.Item>
					<Form.Item
						name="email"
						label={t('users.column.email')}
						rules={[{ required: true, type: 'email', message: t('users.emailRequired') }]}
					>
						<Input placeholder={t('users.emailPlaceholder')} />
					</Form.Item>
					<Form.Item
						name="password"
						label={t('users.column.password')}
						rules={[{ required: true, min: 8, message: t('users.passwordRequired') }]}
					>
						<Input.Password placeholder={t('users.passwordPlaceholder')} />
					</Form.Item>
					<Form.Item name="forcePasswordChange" valuePropName="checked">
						<Checkbox>{t('usersTable.forcePasswordChange')}</Checkbox>
					</Form.Item>
				</Form>
			</Modal>

			<Modal
				title={t('users.editUser', { username: editingUser?.username || '' })}
				open={editModalOpen}
				onCancel={() => {
					setEditModalOpen(false);
					setEditingUser(null);
					editForm.resetFields();
				}}
				onOk={() => editForm.submit()}
				confirmLoading={updateUserMutation.isPending}
				destroyOnHidden
				className="w-full max-w-[560px]"
			>
				<Form form={editForm} layout="vertical" onFinish={handleEdit}>
					<Form.Item
						name="username"
						label={t('users.column.username')}
						rules={[{ required: true, message: t('users.usernameRequired') }]}
					>
						<Input placeholder={t('users.usernamePlaceholder')} />
					</Form.Item>
					<Form.Item
						name="email"
						label={t('users.column.email')}
						rules={[{ required: true, type: 'email', message: t('users.emailRequired') }]}
					>
						<Input placeholder={t('users.emailPlaceholder')} />
					</Form.Item>
					<Form.Item
						name="reason"
						label={t('userDetail.changeReasonLabel')}
						rules={[{ required: true, message: t('userDetail.changeReasonRequired') }]}
					>
						<Input.TextArea
							rows={2}
							placeholder={t('userDetail.changeReasonPlaceholder')}
							maxLength={500}
						/>
					</Form.Item>
				</Form>
			</Modal>
		</div>
	);
}
