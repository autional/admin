'use client';

import React, { useState } from 'react';
import { useCurrentTenantIdOr } from '@autional/shared';
import { Button, Space, Tag, Modal, Form, Input, Select, Empty, Spin, Tooltip } from 'antd';
import { message } from '@/lib/antd-app';
import { Check, CheckCircle2, X } from 'lucide-react';
import {
	usePendingMembers,
	useApproveMember,
	useRejectMember,
	useBatchApproveMembers,
	type PendingMember,
} from '@/hooks/use-members-approval';

import { handleApiError } from '@/lib/error-handler';
import { PageError, DataTable } from '@autional/ui/antd';
import { AppPageHeader } from '@autional/ui';
import { useTranslation } from 'react-i18next';

const { TextArea } = Input;
const { Option } = Select;

export default function ApprovalPage() {
	const { t } = useTranslation();
	const tenantId = useCurrentTenantIdOr('default-tenant');
	const [approveVisible, setApproveVisible] = useState(false);
	const [rejectVisible, setRejectVisible] = useState(false);
	const [selectedMember, setSelectedMember] = useState<PendingMember | null>(null);
	const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([]);
	const [approveForm] = Form.useForm();
	const [rejectForm] = Form.useForm();

	const { data = [], isLoading, error, refetch } = usePendingMembers(tenantId);
	const approveMut = useApproveMember(tenantId);
	const rejectMut = useRejectMember(tenantId);
	const batchApproveMut = useBatchApproveMembers(tenantId);

	const handleApprove = async (values: { role: string; welcomeMessage?: string }) => {
		if (!selectedMember) return;
		try {
			await approveMut.mutateAsync({ memberId: selectedMember.userId, data: values });
			message.success(t('approval.approveSuccess'));
			setApproveVisible(false);
			setSelectedMember(null);
			approveForm.resetFields();
		} catch (err) {
			handleApiError(err, t('approval.approveFailed'));
		}
	};

	const handleReject = async (values: { reason: string }) => {
		if (!selectedMember) return;
		try {
			await rejectMut.mutateAsync({ memberId: selectedMember.userId, data: values });
			message.success(t('approval.rejectSuccess'));
			setRejectVisible(false);
			setSelectedMember(null);
			rejectForm.resetFields();
		} catch (err) {
			handleApiError(err, t('approval.rejectFailed'));
		}
	};

	const handleBatchApprove = async () => {
		if (selectedRowKeys.length === 0) return;
		try {
			await batchApproveMut.mutateAsync({ memberIds: selectedRowKeys });
			message.success(t('approval.batchApproveSuccess', { count: selectedRowKeys.length }));
			setSelectedRowKeys([]);
		} catch (err) {
			handleApiError(err, t('approval.batchApproveFailed'));
		}
	};

	const openApproveModal = (record: PendingMember) => {
		setSelectedMember(record);
		approveForm.setFieldsValue({ role: record.requestedRole || 'member' });
		setApproveVisible(true);
	};

	const openRejectModal = (record: PendingMember) => {
		setSelectedMember(record);
		rejectForm.resetFields();
		setRejectVisible(true);
	};

	const columns = [
		{
			title: t('approval.username'),
			dataIndex: 'username',
			key: 'username',
		},
		{
			title: t('approval.email'),
			dataIndex: 'email',
			key: 'email',
		},
		{
			title: t('approval.requestedRole'),
			dataIndex: 'requestedRole',
			key: 'requestedRole',
			render: (role: string) => <Tag>{role}</Tag>,
		},
		{
			title: t('approval.reason'),
			dataIndex: 'reason',
			key: 'reason',
			ellipsis: true,
			render: (reason: string) => (
				<Tooltip title={reason}>
					<span className="text-sm text-neutral-600">{reason}</span>
				</Tooltip>
			),
		},
		{
			title: t('approval.requestedAt'),
			dataIndex: 'requestedAt',
			key: 'requestedAt',
			render: (v: string) => (v ? new Date(v).toLocaleString('zh-CN') : '-'),
		},
		{
			title: t('approval.daysRemaining'),
			dataIndex: 'daysRemaining',
			key: 'daysRemaining',
			render: (days: number) => {
				if (days <= 0) return <Tag color="error">{t('approval.expired')}</Tag>;
				if (days <= 3) return <Tag color="warning">{t('approval.daysCount', { days })}</Tag>;
				return <Tag color="success">{t('approval.daysCount', { days })}</Tag>;
			},
		},
		{
			title: t('approval.actions'),
			key: 'action',
			width: 180,
			render: (_: any, record: PendingMember) => (
				<Space size="small">
					<Button
						type="link"
						icon={<Check size="1em" />}
						className="!text-success-text"
						onClick={() => openApproveModal(record)}
					>
						{t('approval.approve')}
					</Button>
					<Button
						type="link"
						danger
						icon={<X size="1em" />}
						onClick={() => openRejectModal(record)}
					>
						{t('approval.reject')}
					</Button>
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
			{error && <PageError message={t('approval.loadError')} retry={refetch} className="mb-4" />}

			<AppPageHeader
				title={t('approval.title')}
				actions={
					<>
						{selectedRowKeys.length > 0 && (
							<Button
								type="primary"
								icon={<CheckCircle2 size="1em" />}
								onClick={handleBatchApprove}
								loading={batchApproveMut.isPending}
							>
								{t('approval.batchApproveCount', { count: selectedRowKeys.length })}
							</Button>
						)}
					</>
				}
			/>

			{isLoading ? (
				<div className="flex justify-center py-12">
					<Spin size="large" />
				</div>
			) : error ? (
				<PageError message={t('approval.loadError')} retry={refetch} className="mb-4" />
			) : data.length === 0 ? (
				<Empty description={t('approval.noPending')} className="py-12" />
			) : (
				<DataTable
					rowKey="userId"
					columns={columns}
					dataSource={Array.isArray(data) ? data : []}
					loading={false}
					rowSelection={rowSelection}
					pagination={{ pageSize: 10 }}
					locale={{ emptyText: <Empty description={t('approval.noPending')} /> }}
					scroll={{ x: 800 }}
				/>
			)}

			<Modal
				title={t('approval.approveTitle')}
				open={approveVisible}
				onCancel={() => {
					setApproveVisible(false);
					setSelectedMember(null);
					approveForm.resetFields();
				}}
				onOk={() => approveForm.submit()}
				confirmLoading={approveMut.isPending}
				destroyOnHidden
				className="w-full max-w-[560px]"
			>
				<Form form={approveForm} layout="vertical" onFinish={handleApprove}>
					<Form.Item
						name="role"
						label={t('approval.selectRole')}
						rules={[{ required: true, message: t('approval.roleRequired') }]}
					>
						<Select placeholder={t('approval.rolePlaceholder')}>
							<Option value="admin">{t('approval.roleAdmin')}</Option>
							<Option value="member">{t('approval.roleMember')}</Option>
							<Option value="viewer">{t('approval.roleViewer')}</Option>
						</Select>
					</Form.Item>
					<Form.Item name="welcomeMessage" label={t('approval.welcomeMessage')}>
						<TextArea rows={3} placeholder={t('approval.welcomePlaceholder')} />
					</Form.Item>
				</Form>
			</Modal>

			<Modal
				title={t('approval.rejectTitle')}
				open={rejectVisible}
				onCancel={() => {
					setRejectVisible(false);
					setSelectedMember(null);
					rejectForm.resetFields();
				}}
				onOk={() => rejectForm.submit()}
				confirmLoading={rejectMut.isPending}
				destroyOnHidden
				className="w-full max-w-[560px]"
			>
				<Form form={rejectForm} layout="vertical" onFinish={handleReject}>
					<Form.Item
						name="reason"
						label={t('approval.rejectReason')}
						rules={[{ required: true, message: t('approval.rejectReasonRequired') }]}
					>
						<TextArea rows={4} placeholder={t('approval.rejectPlaceholder')} />
					</Form.Item>
				</Form>
			</Modal>
		</div>
	);
}
