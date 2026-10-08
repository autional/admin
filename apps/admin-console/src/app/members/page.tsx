'use client';

import React, { useState } from 'react';
import { useCurrentTenantIdOr } from '@autional/shared';
import { Button, Space, Tag, Modal, Form, Input, Select, Empty, Popconfirm } from 'antd';
import { message } from '@/lib/antd-app';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { useMembers, useInviteMember, useUpdateMember, useRemoveMember } from '@/hooks/use-members';

import { handleApiError } from '@/lib/error-handler';
import { PageError, DataTable } from '@autional/ui/antd';
import { AppPageHeader } from '@autional/ui';
import { inviteMemberSchema } from '@/lib/validators';
import { useTranslation } from 'react-i18next';

const { Option } = Select;

interface MemberRecord {
	userId: string;
	username: string;
	email: string;
	role: 'admin' | 'member';
	status: string;
	joinedAt: string;
}

const ROLE_COLORS: Record<string, string> = {
	admin: 'blue',
	member: 'default',
};

export default function MembersPage() {
	const { t } = useTranslation();
	const [inviteVisible, setInviteVisible] = useState(false);
	const [editVisible, setEditVisible] = useState(false);
	const [editingMember, setEditingMember] = useState<MemberRecord | null>(null);
	const [inviteForm] = Form.useForm();
	const [editForm] = Form.useForm();
	const tenantId = useCurrentTenantIdOr('default-tenant');

	const { data = [], isLoading, error, refetch } = useMembers(tenantId);
	const inviteMut = useInviteMember();
	const updateMut = useUpdateMember();
	const removeMut = useRemoveMember();

	const ROLE_LABELS: Record<string, string> = {
		admin: t('members.role.admin'),
		member: t('members.role.member'),
	};

	const STATUS_LABELS: Record<string, string> = {
		active: t('members.status.active'),
		pending: t('members.status.pending'),
	};

	const handleInvite = async (values: { email: string; role: string }) => {
		const result = inviteMemberSchema.safeParse(values);
		if (!result.success) {
			result.error.issues.forEach((i) => message.error(i.message));
			return;
		}
		try {
			await inviteMut.mutateAsync({ tenantId, data: result.data });
			message.success(t('members.inviteSuccess'));
			setInviteVisible(false);
			inviteForm.resetFields();
		} catch (err) {
			handleApiError(err, t('members.inviteFailed'));
		}
	};

	const handleEditRole = async (values: { role: string }) => {
		if (!editingMember) return;
		try {
			await updateMut.mutateAsync({ tenantId, userId: editingMember.userId, data: values });
			message.success(t('members.roleUpdateSuccess'));
			setEditVisible(false);
			setEditingMember(null);
			editForm.resetFields();
		} catch (err) {
			handleApiError(err, t('members.roleUpdateFailed'));
		}
	};

	const handleRemove = async (userId: string) => {
		try {
			await removeMut.mutateAsync({ tenantId, userId });
			message.success(t('members.removeSuccess'));
		} catch (err) {
			handleApiError(err, t('members.removeFailed'));
		}
	};

	const columns = [
		{
			title: t('members.column.user'),
			dataIndex: 'username',
			key: 'username',
			render: (_: string, record: MemberRecord) => (
				<div>
					<div className="font-medium text-sm">{record.username}</div>
					<div className="text-xs text-neutral-600">{record.userId}</div>
				</div>
			),
		},
		{ title: t('common.email'), dataIndex: 'email', key: 'email' },
		{
			title: t('members.column.role'),
			dataIndex: 'role',
			key: 'role',
			render: (role: string) => (
				<Tag color={ROLE_COLORS[role] || 'default'}>{ROLE_LABELS[role] || role}</Tag>
			),
		},
		{
			title: t('common.status'),
			dataIndex: 'status',
			key: 'status',
			render: (status: string) => (
				<Tag color={status === 'active' ? 'success' : status === 'pending' ? 'warning' : 'default'}>
					{STATUS_LABELS[status] || status}
				</Tag>
			),
		},
		{
			title: t('members.column.joinedAt'),
			dataIndex: 'joinedAt',
			key: 'joinedAt',
			render: (v: string) => (v ? new Date(v).toLocaleString('zh-CN') : '-'),
		},
		{
			title: t('common.actions'),
			key: 'action',
			render: (_: any, record: MemberRecord) => (
				<Space size="small">
					<Button
						type="link"
						icon={<Pencil size="1em" />}
						onClick={() => {
							setEditingMember(record);
							editForm.setFieldsValue({ role: record.role });
							setEditVisible(true);
						}}
					>
						{t('members.editRole')}
					</Button>
					<Popconfirm
						title={t('members.confirmRemoveTitle')}
						description={t('members.confirmRemoveDesc')}
						okText={t('members.confirmRemoveOk')}
						okButtonProps={{ danger: true }}
						onConfirm={() => handleRemove(record.userId)}
					>
						<Button type="link" danger icon={<Trash2 size="1em" />}>
							{t('members.removeMember')}
						</Button>
					</Popconfirm>
				</Space>
			),
		},
	];

	return (
		<div>
			{error && <PageError message={t('members.loadError')} retry={refetch} className="mb-4" />}

			<AppPageHeader
				title={t('members.title')}
				actions={
					<>
						<Button
							type="primary"
							icon={<Plus size="1em" />}
							onClick={() => {
								inviteForm.resetFields();
								setInviteVisible(true);
							}}
						>
							{t('members.inviteBtn')}
						</Button>
					</>
				}
			/>

			{data.length === 0 && !isLoading ? (
				<Empty description={t('members.noData')} className="py-12" />
			) : (
				<DataTable
					rowKey="userId"
					columns={columns}
					dataSource={data}
					loading={isLoading}
					pagination={{ pageSize: 10 }}
					scroll={{ x: 800 }}
				/>
			)}

			<Modal
				title={t('members.inviteTitle')}
				open={inviteVisible}
				onCancel={() => {
					setInviteVisible(false);
					inviteForm.resetFields();
				}}
				onOk={() => inviteForm.submit()}
				destroyOnHidden
				className="w-full max-w-[560px]"
			>
				<Form form={inviteForm} layout="vertical" onFinish={handleInvite}>
					<Form.Item
						name="email"
						label={t('members.form.email')}
						rules={[
							{ required: true, message: t('members.form.emailRequired') },
							{ type: 'email', message: t('members.form.emailInvalid') },
						]}
					>
						<Input placeholder={t('members.form.emailPlaceholder')} />
					</Form.Item>
					<Form.Item
						name="role"
						label={t('members.form.role')}
						rules={[{ required: true }]}
						initialValue="member"
					>
						<Select placeholder={t('members.form.rolePlaceholder')}>
							<Option value="admin">{t('members.form.roleAdmin')}</Option>
							<Option value="member">{t('members.form.roleMember')}</Option>
						</Select>
					</Form.Item>
				</Form>
			</Modal>

			<Modal
				title={t('members.editRoleTitle')}
				open={editVisible}
				onCancel={() => {
					setEditVisible(false);
					setEditingMember(null);
					editForm.resetFields();
				}}
				onOk={() => editForm.submit()}
				destroyOnHidden
				className="w-full max-w-[560px]"
			>
				<Form form={editForm} layout="vertical" onFinish={handleEditRole}>
					<Form.Item name="role" label={t('members.form.role')} rules={[{ required: true }]}>
						<Select placeholder={t('members.form.rolePlaceholder')}>
							<Option value="admin">{t('members.form.roleAdmin')}</Option>
							<Option value="member">{t('members.form.roleMember')}</Option>
						</Select>
					</Form.Item>
				</Form>
			</Modal>
		</div>
	);
}
