'use client';

import React, { useState } from 'react';
import { Button, Space, Tag, Modal, Form, Input, Select, Popconfirm, Empty, Spin } from 'antd';
import { Plus, Trash2 } from 'lucide-react';
import { message } from '@/lib/antd-app';
import { useTranslation } from 'react-i18next';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/lib/query-keys';
import { getMembers, inviteMember, removeMember } from '@/lib/api.generated';
import { extractList, useCurrentTenantIdOr } from '@autional/shared';

import { handleApiError } from '@/lib/error-handler';
import { PageError, DataTable } from '@autional/ui/antd';
import { AppPageHeader } from '@autional/ui';

const { Option } = Select;

interface TeamMember {
	id: string;
	email: string;
	name?: string;
	role?: string;
	status?: string;
}

export default function TeamPage() {
	const { t } = useTranslation();
	const tenantId = useCurrentTenantIdOr('default-tenant');
	const queryClient = useQueryClient();
	const [modalVisible, setModalVisible] = useState(false);
	const [form] = Form.useForm();

	const {
		data = [],
		isLoading,
		error,
		refetch,
	} = useQuery({
		queryKey: queryKeys.members.all(tenantId),
		queryFn: async () => {
			const res = await getMembers(tenantId);
			return extractList<TeamMember>(res);
		},
		enabled: !!tenantId,
	});

	const inviteMut = useMutation({
		mutationFn: (values: { email: string; role: string }) => inviteMember(tenantId, values),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: queryKeys.members.all(tenantId) });
			message.success(t('team.inviteSuccess'));
			setModalVisible(false);
			form.resetFields();
		},
		onError: (err) => handleApiError(err, t('team.inviteFailed')),
	});

	const removeMut = useMutation({
		mutationFn: (userId: string) => removeMember(tenantId, userId),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: queryKeys.members.all(tenantId) });
			message.success(t('team.removeSuccess'));
		},
		onError: (err) => handleApiError(err, t('team.removeFailed')),
	});

	const columns = [
		{ title: t('team.column.email'), dataIndex: 'email', key: 'email' },
		{
			title: t('team.column.name'),
			dataIndex: 'name',
			key: 'name',
			render: (v: string) => v || '-',
		},
		{
			title: t('team.column.role'),
			dataIndex: 'role',
			key: 'role',
			render: (role: string) => <Tag>{role || '-'}</Tag>,
		},
		{
			title: t('team.column.status'),
			dataIndex: 'status',
			key: 'status',
			render: (status: string) => (
				<Tag color={status === 'active' ? 'success' : 'warning'}>{status || 'pending'}</Tag>
			),
		},
		{
			title: t('common.actions'),
			key: 'action',
			render: (_: any, record: TeamMember) => (
				<Popconfirm title={t('team.confirmRemove')} onConfirm={() => removeMut.mutate(record.id)}>
					<Button type="text" danger size="small" icon={<Trash2 size="1em" />}>
						{t('team.remove')}
					</Button>
				</Popconfirm>
			),
		},
	];

	return (
		<div>
			{error && <PageError message={t('team.loadError')} retry={refetch} className="mb-4" />}

			<AppPageHeader
				title={t('team.title')}
				actions={
					<>
						<Button
							type="primary"
							icon={<Plus size="1em" />}
							onClick={() => {
								setModalVisible(true);
								form.resetFields();
							}}
						>
							{t('team.inviteBtn')}
						</Button>
					</>
				}
			/>

			{isLoading ? (
				<Spin className="flex justify-center py-12" />
			) : data.length === 0 ? (
				<Empty description={t('team.noData')} />
			) : (
				<DataTable
					rowKey="id"
					columns={columns}
					dataSource={data}
					pagination={{ pageSize: 10 }}
					scroll={{ x: 600 }}
				/>
			)}

			<Modal
				title={t('team.inviteBtn')}
				open={modalVisible}
				onCancel={() => {
					setModalVisible(false);
					form.resetFields();
				}}
				onOk={() => form.submit()}
				destroyOnClose
			>
				<Form form={form} layout="vertical" onFinish={(values) => inviteMut.mutate(values)}>
					<Form.Item
						name="email"
						label={t('team.form.email')}
						rules={[{ required: true, type: 'email', message: t('team.form.emailInvalid') }]}
					>
						<Input placeholder={t('team.form.emailPlaceholder')} />
					</Form.Item>
					<Form.Item
						name="role"
						label={t('team.form.role')}
						rules={[{ required: true }]}
						initialValue="member"
					>
						<Select>
							<Option value="admin">Admin</Option>
							<Option value="member">Member</Option>
							<Option value="viewer">Viewer</Option>
						</Select>
					</Form.Item>
				</Form>
			</Modal>
		</div>
	);
}
