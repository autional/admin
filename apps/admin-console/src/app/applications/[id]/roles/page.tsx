'use client';

import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router';
import { Tabs, Button, Space, Tag, Modal, Form, Input, Select, InputNumber, Popconfirm, Card } from 'antd';
import { message } from '@/lib/antd-app';
import { Pencil, Plus, RefreshCw, Trash2 } from 'lucide-react';
import { extractItem, usePageTitle, useAuthStore } from '@autional/shared';
import {
	getAppDefaultRoles,
	createAppDefaultRole,
	updateAppDefaultRole,
	deleteAppDefaultRole,
	getAppMembers,
	assignAppMember,
	revokeAppMember,
} from '@/lib/api.generated';
import { handleApiError } from '@/lib/error-handler';
import { PageError, DataTable } from '@autional/ui/antd';
import { AppPageHeader } from '@autional/ui';
import { useTranslation } from 'react-i18next';

interface AppRole {
	id?: string;
	role?: string;
	description?: string;
	permissions?: string[];
	isSystem?: boolean;
	order?: number;
}

interface AppMember {
	id?: string;
	userId?: string;
	role?: string;
	permissions?: string[];
	isActive?: boolean;
	expiresAt?: string;
}

export default function AppRolesPage() {
	const { t } = useTranslation();
	usePageTitle('Application Roles');
	const { id: appId } = useParams<{ id: string }>();
	const tenantId = useAuthStore((s) => s.currentTenantId) ?? '';
	const [activeTab, setActiveTab] = useState('roles');
	const [roles, setRoles] = useState<AppRole[]>([]);
	const [members, setMembers] = useState<AppMember[]>([]);
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState<Error | null>(null);
	const [modalVisible, setModalVisible] = useState(false);
	const [editingRole, setEditingRole] = useState<AppRole | null>(null);
	const [assignModalVisible, setAssignModalVisible] = useState(false);
	const [roleForm] = Form.useForm<AppRole>();
	const [assignForm] = Form.useForm<{ userId: string; role: string }>();

	const fetchRoles = async () => {
		if (!tenantId || !appId) return;
		setLoading(true);
		setError(null);
		try {
			const res = await getAppDefaultRoles(tenantId, appId);
			const items = extractItem<AppRole[]>(res) ?? [];
			setRoles(Array.isArray(items) ? items : []);
		} catch (err) {
			setError(err instanceof Error ? err : new Error(String(err)));
		} finally {
			setLoading(false);
		}
	};

	const fetchMembers = async () => {
		if (!tenantId || !appId) return;
		setLoading(true);
		setError(null);
		try {
			const res = await getAppMembers(tenantId, appId);
			const items = extractItem<AppMember[]>(res) ?? [];
			setMembers(Array.isArray(items) ? items : []);
		} catch (err) {
			setError(err instanceof Error ? err : new Error(String(err)));
		} finally {
			setLoading(false);
		}
	};

	useEffect(() => {
		if (activeTab === 'roles') fetchRoles();
		else fetchMembers();
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [tenantId, appId, activeTab]);

	const handleCreateRole = async (values: AppRole) => {
		try {
			await createAppDefaultRole(tenantId, appId!, {
				role: values.role!,
				description: values.description,
				permissions: values.permissions,
				isSystem: false,
				order: values.order,
			});
			message.success(t('appRoles.roleCreateSuccess'));
			setModalVisible(false);
			roleForm.resetFields();
			setEditingRole(null);
			fetchRoles();
		} catch (err) {
			handleApiError(err, t('appRoles.createFailed'));
		}
	};

	const handleUpdateRole = async (values: AppRole) => {
		if (!editingRole?.id) return;
		try {
			await updateAppDefaultRole(tenantId, appId!, editingRole.id, {
				role: values.role,
				description: values.description,
				permissions: values.permissions,
				order: values.order,
			});
			message.success(t('appRoles.roleUpdateSuccess'));
			setModalVisible(false);
			roleForm.resetFields();
			setEditingRole(null);
			fetchRoles();
		} catch (err) {
			handleApiError(err, t('appRoles.updateFailed'));
		}
	};

	const handleDeleteRole = async (roleId: string) => {
		try {
			await deleteAppDefaultRole(tenantId, appId!, roleId);
			message.success(t('appRoles.roleDeleted'));
			fetchRoles();
		} catch (err) {
			handleApiError(err, t('appRoles.deleteFailed'));
		}
	};

	const handleAssignMember = async (values: { userId: string; role: string }) => {
		try {
			await assignAppMember(tenantId, appId!, { userId: values.userId, role: values.role });
			message.success(t('appRoles.roleAssignmentSuccess'));
			setAssignModalVisible(false);
			assignForm.resetFields();
			fetchMembers();
		} catch (err) {
			handleApiError(err, t('appRoles.assignmentFailed'));
		}
	};

	const handleRevokeMember = async (roleId: string) => {
		try {
			await revokeAppMember(tenantId, appId!, roleId);
			message.success(t('appRoles.memberRemoved'));
			fetchMembers();
		} catch (err) {
			handleApiError(err, t('appRoles.removeFailed'));
		}
	};

	const openEdit = (role: AppRole) => {
		setEditingRole(role);
		roleForm.setFieldsValue(role);
		setModalVisible(true);
	};

	const openCreate = () => {
		setEditingRole(null);
		roleForm.resetFields();
		setModalVisible(true);
	};

	const roleColumns = [
		{
			title: t('appRoles.column.roleName'),
			dataIndex: 'role',
			key: 'role',
			render: (v: string) => <Tag color="blue">{v}</Tag>,
		},
		{
			title: t('appRoles.column.description'),
			dataIndex: 'description',
			key: 'description',
			render: (v?: string) => v || '-',
		},
		{
			title: t('appRoles.column.permissionCount'),
			dataIndex: 'permissions',
			key: 'permissions',
			render: (v?: string[]) => (v ? v.length : 0),
		},
		{ title: t('appRoles.column.order'), dataIndex: 'order', key: 'order', width: 80 },
		{
			title: t('appRoles.column.actions'),
			key: 'action',
			width: 160,
			render: (_: any, record: AppRole) => (
				<Space size="small">
					<Button type="text" size="small" icon={<Pencil size="1em" />} onClick={() => openEdit(record)}>
						{t('appRoles.edit')}
					</Button>
					<Popconfirm
						title={t('appRoles.confirmDeleteRole')}
						onConfirm={() => handleDeleteRole(record.id!)}
					>
						<Button
							type="text"
							danger
							size="small"
							icon={<Trash2 size="1em" />}
							disabled={record.isSystem}
						>
							{t('appRoles.delete')}
						</Button>
					</Popconfirm>
				</Space>
			),
		},
	];

	const memberColumns = [
		{ title: t('appRoles.column.userId'), dataIndex: 'userId', key: 'userId', ellipsis: true },
		{
			title: t('appRoles.column.role'),
			dataIndex: 'role',
			key: 'role',
			render: (v: string) => <Tag color={v === 'admin' ? 'red' : 'green'}>{v}</Tag>,
		},
		{
			title: t('appRoles.column.status'),
			dataIndex: 'isActive',
			key: 'isActive',
			render: (v: boolean) => (
				<Tag color={v ? 'success' : 'default'}>
					{v ? t('appRoles.active') : t('appRoles.disabled')}
				</Tag>
			),
		},
		{
			title: t('appRoles.column.actions'),
			key: 'action',
			width: 100,
			render: (_: any, record: AppMember) => (
				<Popconfirm
					title={t('appRoles.confirmRemoveMember')}
					onConfirm={() => handleRevokeMember(record.id!)}
				>
					<Button type="text" danger size="small">
						{t('appRoles.remove')}
					</Button>
				</Popconfirm>
			),
		},
	];

	return (
		<div>
			<AppPageHeader
				title={t('appRoles.title')}
				actions={
					<>
						<Button
							icon={<RefreshCw size="1em" />}
							onClick={() => (activeTab === 'roles' ? fetchRoles() : fetchMembers())}
						>
							{t('appRoles.refresh')}
						</Button>
					</>
				}
			/>

			{error && (
				<PageError
					message={t('appRoles.loadFailed')}
					retry={() => (activeTab === 'roles' ? fetchRoles() : fetchMembers())}
					className="mb-4"
				/>
			)}

			<Tabs
				activeKey={activeTab}
				onChange={setActiveTab}
				items={[
					{
						key: 'roles',
						label: t('appRoles.defaultRoles'),
						children: (
							<Card>
								<div className="mb-4">
									<Button type="primary" icon={<Plus size="1em" />} onClick={openCreate}>
										{t('appRoles.createRole')}
									</Button>
								</div>
								<DataTable
									rowKey="id"
									columns={roleColumns}
									dataSource={roles}
									loading={loading}
									pagination={{ pageSize: 10 }}
									locale={{ emptyText: t('appRoles.noRoles') }}
									scroll={{ x: 800 }}
								/>
							</Card>
						),
					},
					{
						key: 'members',
						label: t('appRoles.userAssignment'),
						children: (
							<Card>
								<div className="mb-4">
									<Button
										type="primary"
										icon={<Plus size="1em" />}
										onClick={() => {
											assignForm.resetFields();
											setAssignModalVisible(true);
										}}
									>
										{t('appRoles.assignMember')}
									</Button>
								</div>
								<DataTable
									rowKey="id"
									columns={memberColumns}
									dataSource={members}
									loading={loading}
									pagination={{ pageSize: 10 }}
									locale={{ emptyText: t('appRoles.noMembers') }}
									scroll={{ x: 800 }}
								/>
							</Card>
						),
					},
				]}
			/>

			<Modal
				title={editingRole ? t('appRoles.editRole') : t('appRoles.createRole')}
				open={modalVisible}
				onCancel={() => {
					setModalVisible(false);
					setEditingRole(null);
					roleForm.resetFields();
				}}
				onOk={() => roleForm.submit()}
				destroyOnHidden
				className="w-full max-w-[560px]"
			>
				<Form
					form={roleForm}
					layout="vertical"
					onFinish={editingRole ? handleUpdateRole : handleCreateRole}
				>
					<Form.Item
						name="role"
						label={t('appRoles.form.roleName')}
						rules={[{ required: true, message: t('appRoles.form.roleNameRequired') }]}
					>
						<Input placeholder={t('appRoles.form.roleNamePlaceholder')} />
					</Form.Item>
					<Form.Item name="description" label={t('appRoles.form.description')}>
						<Input.TextArea rows={2} placeholder={t('appRoles.form.descriptionPlaceholder')} />
					</Form.Item>
					<Form.Item name="order" label={t('appRoles.form.order')}>
						<InputNumber min={0} max={9999} className="w-full" />
					</Form.Item>
				</Form>
			</Modal>

			<Modal
				title={t('appRoles.assignMemberTitle')}
				open={assignModalVisible}
				onCancel={() => {
					setAssignModalVisible(false);
					assignForm.resetFields();
				}}
				onOk={() => assignForm.submit()}
				destroyOnHidden
				className="w-full max-w-[560px]"
			>
				<Form form={assignForm} layout="vertical" onFinish={handleAssignMember}>
					<Form.Item
						name="userId"
						label={t('appRoles.form.userId')}
						rules={[{ required: true, message: t('appRoles.form.userIdRequired') }]}
					>
						<Input placeholder={t('appRoles.form.userIdPlaceholder')} />
					</Form.Item>
					<Form.Item
						name="role"
						label={t('appRoles.form.role')}
						rules={[{ required: true, message: t('appRoles.form.roleRequired') }]}
					>
						<Input placeholder={t('appRoles.form.rolePlaceholder')} />
					</Form.Item>
				</Form>
			</Modal>
		</div>
	);
}
