'use client';

import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Tag, Button, Modal, Form, Input, Select, Space, Card } from 'antd';
import { message } from '@/lib/antd-app';
import {
	useWithdrawals,
	useApproveWithdrawal,
	useRejectWithdrawal,
	type WithdrawalItem,
} from '@/hooks/use-wallet-admin';
import { handleApiError } from '@/lib/error-handler';
import { PageError, DataTable } from '@autional/ui/antd';
import { AppPageHeader } from '@autional/ui';

export default function WalletWithdrawalsPage() {
	const { t } = useTranslation();
	const [filters, setFilters] = useState<Record<string, unknown>>({});
	const { data: withdrawals = [], isLoading, error, refetch } = useWithdrawals(filters);
	const approveMut = useApproveWithdrawal();
	const rejectMut = useRejectWithdrawal();

	const [rejectModal, setRejectModal] = useState(false);
	const [selectedId, setSelectedId] = useState<string>('');
	const [rejectForm] = Form.useForm();

	const handleApprove = async (id: string) => {
		try {
			await approveMut.mutateAsync({ id, data: {} });
			message.success(t('walletWithdrawals.approved'));
		} catch (err) {
			handleApiError(err, t('walletWithdrawals.approveFailed'));
		}
	};

	const handleReject = async (values: { reason: string }) => {
		try {
			await rejectMut.mutateAsync({ id: selectedId, data: values });
			message.success(t('walletWithdrawals.rejected'));
			setRejectModal(false);
			rejectForm.resetFields();
		} catch (err) {
			handleApiError(err, t('walletWithdrawals.rejectFailed'));
		}
	};

	const columns = [
		{ title: t('walletWithdrawals.colId'), dataIndex: 'id', key: 'id', ellipsis: true, width: 160 },
		{ title: t('walletWithdrawals.colUserId'), dataIndex: 'userId', key: 'userId', width: 120 },
		{
			title: t('walletWithdrawals.colAmount'),
			dataIndex: 'amount',
			key: 'amount',
			width: 120,
			render: (v: string) => `¥${parseFloat(v).toFixed(2)}`,
		},
		{
			title: t('walletWithdrawals.colBankAccount'),
			dataIndex: 'bankAccount',
			key: 'bankAccount',
			width: 160,
			render: (v: string) => v || '-',
		},
		{
			title: t('walletWithdrawals.colStatus'),
			dataIndex: 'status',
			key: 'status',
			width: 100,
			render: (v: string) => {
				const colorMap: Record<string, string> = {
					pending: 'processing',
					approved: 'success',
					rejected: 'error',
				};
				const labelMap: Record<string, string> = {
					pending: t('walletWithdrawals.statusPending'),
					approved: t('walletWithdrawals.statusApproved'),
					rejected: t('walletWithdrawals.statusRejected'),
				};
				return <Tag color={colorMap[v] ?? 'default'}>{labelMap[v] ?? v}</Tag>;
			},
		},
		{ title: t('walletWithdrawals.colNote'), dataIndex: 'note', key: 'note', ellipsis: true },
		{
			title: t('walletWithdrawals.colCreatedAt'),
			dataIndex: 'createdAt',
			key: 'createdAt',
			width: 160,
			render: (v: string) => (v ? new Date(v).toLocaleString() : '-'),
		},
		{
			title: t('walletWithdrawals.colActions'),
			key: 'action',
			width: 160,
			render: (_: unknown, record: WithdrawalItem) => (
				<Space size="small">
					{record.status === 'pending' && (
						<>
							<Button type="link" size="small" onClick={() => handleApprove(record.id)}>
								{t('walletWithdrawals.approve')}
							</Button>
							<Button
								type="link"
								danger
								size="small"
								onClick={() => {
									setSelectedId(record.id);
									rejectForm.resetFields();
									setRejectModal(true);
								}}
							>
								{t('walletWithdrawals.reject')}
							</Button>
						</>
					)}
				</Space>
			),
		},
	];

	return (
		<div>
			<AppPageHeader title={t('walletWithdrawals.title')} />

			{error && (
				<PageError message={t('walletWithdrawals.loadError')} retry={refetch} className="mb-4" />
			)}

			<Card size="small" className="mb-4">
				<Space wrap>
					<Select
						placeholder={t('walletWithdrawals.filterPlaceholder')}
						allowClear
						className="w-30"
						value={filters.status}
						onChange={(v) => setFilters({ ...filters, status: v })}
						options={[
							{ value: 'pending', label: t('walletWithdrawals.statusPending') },
							{ value: 'approved', label: t('walletWithdrawals.statusApproved') },
							{ value: 'rejected', label: t('walletWithdrawals.statusRejected') },
						]}
					/>
				</Space>
			</Card>

			<DataTable
				rowKey="id"
				columns={columns}
				dataSource={withdrawals}
				loading={isLoading}
				pagination={{ pageSize: 10 }}
				scroll={{ x: 1100 }}
			/>

			<Modal
				title={t('walletWithdrawals.rejectTitle')}
				open={rejectModal}
				onCancel={() => {
					setRejectModal(false);
					rejectForm.resetFields();
				}}
				onOk={() => rejectForm.submit()}
				className="w-full max-w-[560px]"
			>
				<Form form={rejectForm} layout="vertical" onFinish={handleReject}>
					<Form.Item
						name="reason"
						label={t('walletWithdrawals.rejectReason')}
						rules={[{ required: true }]}
					>
						<Input.TextArea rows={3} placeholder={t('walletWithdrawals.rejectReasonPlaceholder')} />
					</Form.Item>
				</Form>
			</Modal>
		</div>
	);
}
