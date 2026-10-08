'use client';
// @generated-api-exempt: 2 key(s) [PROFILE.ADMIN_APPROVAL_APPROVE, PROFILE.ADMIN_APPROVAL_REJECT] lack generated func

import React, { useState } from 'react';
import { DataTable } from '@autional/ui/antd';
import { Button, Modal, Input, Space, message, Tag } from 'antd';
import { Check, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { AppPageHeader, EmptyState, LoadingScreen, SectionCard } from '@autional/ui';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient, API_PATHS, extractList } from '@autional/shared';
import { adminProfilesApprovalRequests } from '@autional/shared/generated/api';

const STATUS_COLORS: Record<string, string> = {
	pending: 'orange',
	approved: 'green',
	rejected: 'red',
	cancelled: 'default',
};

const { TextArea } = Input;

const fetchApprovalRequests = async () => {
	const res = await adminProfilesApprovalRequests();
	return extractList(res);
};

const approveRequest = (id: string) => apiClient.post(API_PATHS.PROFILE.ADMIN_APPROVAL_APPROVE(id));

const rejectRequest = (id: string, reason: string) =>
	apiClient.post(API_PATHS.PROFILE.ADMIN_APPROVAL_REJECT(id), { reason });

export default function ApprovalPage() {
	const { t } = useTranslation();
	const queryClient = useQueryClient();
	const [rejectModal, setRejectModal] = useState<{ open: boolean; id: string | null }>({
		open: false,
		id: null,
	});
	const [rejectReason, setRejectReason] = useState('');

	const { data: items = [], isLoading } = useQuery({
		queryKey: ['profile-approval-requests'],
		queryFn: fetchApprovalRequests,
	});

	const approveMut = useMutation({
		mutationFn: approveRequest,
		onSuccess: () => {
			message.success(t('profileApproval.approved'));
			queryClient.invalidateQueries({ queryKey: ['profile-approval-requests'] });
		},
		onError: (err: any) => message.error(err?.message || t('profileApproval.approveFailed')),
	});

	const rejectMut = useMutation({
		mutationFn: ({ id, reason }: { id: string; reason: string }) => rejectRequest(id, reason),
		onSuccess: () => {
			message.success(t('profileApproval.rejected'));
			setRejectModal({ open: false, id: null });
			setRejectReason('');
			queryClient.invalidateQueries({ queryKey: ['profile-approval-requests'] });
		},
		onError: (err: any) => message.error(err?.message || t('profileApproval.rejectFailed')),
	});

	const handleApprove = (id: string) => approveMut.mutate(id);

	const handleReject = () => {
		if (!rejectModal.id) return;
		rejectMut.mutate({ id: rejectModal.id, reason: rejectReason });
	};

	if (isLoading) return <LoadingScreen />;

	const columns = [
		{
			title: t('profileApproval.column.user'),
			dataIndex: 'userId',
			key: 'userId',
			width: 200,
			ellipsis: true,
		},
		{
			title: t('profileApproval.column.action'),
			dataIndex: 'action',
			key: 'action',
			width: 120,
			render: (v: string) => <Tag>{v}</Tag>,
		},
		{
			title: t('profileApproval.column.reason'),
			dataIndex: 'reason',
			key: 'reason',
			ellipsis: true,
		},
		{
			title: t('profileApproval.column.status'),
			dataIndex: 'status',
			key: 'status',
			width: 100,
			render: (v: string) => <Tag color={STATUS_COLORS[v] || 'default'}>{v}</Tag>,
		},
		{
			title: t('profileApproval.column.created'),
			dataIndex: 'createdAt',
			key: 'createdAt',
			width: 180,
			render: (v: string) => (v ? new Date(v).toLocaleString() : '-'),
		},
		{
			title: t('profileApproval.column.actions'),
			key: 'actions',
			width: 200,
			render: (_: any, r: any) =>
				r.status === 'pending' ? (
					<Space>
						<Button
							size="small"
							type="primary"
							icon={<Check size="1em" />}
							onClick={() => handleApprove(r.id)}
							loading={approveMut.isPending}
						>
							{t('profileApproval.approve')}
						</Button>
						<Button
							size="small"
							danger
							icon={<X size="1em" />}
							onClick={() => setRejectModal({ open: true, id: r.id })}
						>
							{t('profileApproval.reject')}
						</Button>
					</Space>
				) : null,
		},
	];

	return (
		<div>
			<AppPageHeader title={t('profileApproval.title')} description={t('profileApproval.subtitle')} />
			<SectionCard>
				<DataTable
					columns={columns}
					dataSource={items}
					rowKey="id"
					locale={{
						emptyText: (
							<EmptyState
								title={t('profileApproval.emptyTitle')}
								description={t('profileApproval.emptyDescription')}
							/>
						),
					}}
					scroll={{ x: 800 }}
				/>
			</SectionCard>
			<Modal
				title={t('profileApproval.rejectTitle')}
				open={rejectModal.open}
				onCancel={() => {
					setRejectModal({ open: false, id: null });
					setRejectReason('');
				}}
				onOk={handleReject}
				confirmLoading={rejectMut.isPending}
				className="w-full max-w-[560px]"
			>
				<TextArea
					rows={3}
					placeholder={t('profileApproval.rejectPlaceholder')}
					value={rejectReason}
					onChange={(e) => setRejectReason(e.target.value)}
				/>
			</Modal>
		</div>
	);
}
