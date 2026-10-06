'use client';

import React, { useState } from 'react';
import { Button, Space, Tag, Modal, Form, Input, Select } from 'antd';
import { message } from '@/lib/antd-app';
import { CloseOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { useRoleActivations, useRevokeActivation } from '@/hooks/use-role-activations';
import type { RoleActivation } from '@/hooks/use-role-activations';
import { handleApiError } from '@/lib/error-handler';
import { PageError, DataTable } from '@autional/ui/antd';
import { ConsolePageHeader } from '@autional/ui';

// A-141f（TASK-AB2-17 / ADR-B2-03）：后端创建即 Active（枚举仅三态，见 pim/role_activation.go:13-15），
// 本页为「激活记录」视图，无审批流；未知状态兜底原值透出（防存量脏数据吞行）。
const STATUS_MAP: Record<string, { color: string }> = {
	active: { color: 'green' },
	revoked: { color: 'red' },
	expired: { color: 'default' },
};

export default function RoleActivationsPage() {
	const { t } = useTranslation();
	const [statusFilter, setStatusFilter] = useState<string>('all');
	const [revokeTarget, setRevokeTarget] = useState<string | null>(null);
	const [form] = Form.useForm();

	const {
		data = [],
		isLoading,
		error,
		refetch,
	} = useRoleActivations(statusFilter !== 'all' ? statusFilter : undefined);
	const revokeMut = useRevokeActivation();

	const statusLabels: Record<string, string> = {
		active: t('roleActivations.statusActive'),
		revoked: t('roleActivations.statusRevoked'),
		expired: t('roleActivations.statusExpired'),
	};

	const handleRevoke = async (values: { reason: string }) => {
		if (!revokeTarget) return;
		try {
			await revokeMut.mutateAsync({ id: revokeTarget, reason: values.reason });
			message.success(t('roleActivations.revokeSuccess'));
			setRevokeTarget(null);
			form.resetFields();
		} catch (err) {
			handleApiError(err, t('roleActivations.operationFailed'));
		}
	};

	const confirmRevoke = (id: string) => {
		setRevokeTarget(id);
		form.setFieldsValue({ reason: t('roleActivations.defaultRevokeReason') });
	};

	const truncate = (s: string, len = 8) =>
		s && s.length > len * 2 ? `${s.slice(0, len)}...${s.slice(-len)}` : s;

	const columns = [
		{
			title: t('roleActivations.columnUserId'),
			dataIndex: 'userId',
			key: 'userId',
			width: 200,
			render: (v: string) => (
				<code className="text-xs bg-neutral-200 px-1 rounded">{truncate(v)}</code>
			),
		},
		{
			title: t('roleActivations.columnRoleId'),
			dataIndex: 'roleId',
			key: 'roleId',
			width: 200,
			render: (v: string) => (
				<code className="text-xs bg-neutral-200 px-1 rounded">{truncate(v)}</code>
			),
		},
		{
			title: t('common.status'),
			dataIndex: 'status',
			key: 'status',
			width: 100,
			render: (v: string) => {
				const cfg = STATUS_MAP[v] || { color: 'default' };
				return <Tag color={cfg.color}>{statusLabels[v] || v}</Tag>;
			},
		},
		{
			title: t('roleActivations.columnJustification'),
			dataIndex: 'justification',
			key: 'justification',
			ellipsis: true,
		},
		{
			title: t('roleActivations.columnExpireAt'),
			dataIndex: 'expireAt',
			key: 'expireAt',
			width: 140,
			render: (v: string) => (v ? new Date(v).toLocaleDateString('zh-CN') : '-'),
		},
		{
			title: t('roleActivations.columnCreatedAt'),
			dataIndex: 'createdAt',
			key: 'createdAt',
			width: 140,
			render: (v: string) => (v ? new Date(v).toLocaleDateString('zh-CN') : '-'),
		},
		{
			title: t('common.actions'),
			key: 'action',
			width: 120,
			render: (_: any, record: RoleActivation) => (
				<Space size="small">
					{record.status === 'active' && (
						<Button
							type="link"
							danger
							icon={<CloseOutlined />}
							loading={revokeMut.isPending}
							onClick={() => confirmRevoke(record.id)}
						>
							{t('common.revoke')}
						</Button>
					)}
				</Space>
			),
		},
	];

	return (
		<div>
			<ConsolePageHeader title={t('roleActivations.title')} />

			{error && (
				<PageError message={t('roleActivations.loadError')} retry={refetch} className="mb-4" />
			)}
			<div className="flex gap-4 mb-4 flex-wrap">
				<Select
					placeholder={t('common.status')}
					value={statusFilter}
					onChange={setStatusFilter}
					options={[
						{ label: t('common.all'), value: 'all' },
						{ label: t('roleActivations.statusActive'), value: 'active' },
						{ label: t('roleActivations.statusRevoked'), value: 'revoked' },
						{ label: t('roleActivations.statusExpired'), value: 'expired' },
					]}
					className="w-40"
				/>
			</div>

			<DataTable
				rowKey="id"
				columns={columns}
				dataSource={data as RoleActivation[]}
				loading={isLoading}
				pagination={{ pageSize: 15 }}
				scroll={{ x: 800 }}
			/>

			<Modal
				title={t('roleActivations.modalRevokeTitle')}
				open={!!revokeTarget}
				onCancel={() => {
					setRevokeTarget(null);
					form.resetFields();
				}}
				onOk={() => form.submit()}
				destroyOnHidden
				className="w-full max-w-[560px]"
			>
				<Form form={form} layout="vertical" onFinish={handleRevoke}>
					<Form.Item
						name="reason"
						label={t('roleActivations.reason')}
						rules={[{ required: true, message: t('roleActivations.reasonRequired') }]}
					>
						<Input.TextArea rows={3} placeholder={t('roleActivations.reasonPlaceholder')} />
					</Form.Item>
				</Form>
			</Modal>
		</div>
	);
}
