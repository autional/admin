'use client';

import React, { useState } from 'react';
import { Tag, Button, Modal, Form, Input, Select, Space, Card, Descriptions } from 'antd';
import { message } from '@/lib/antd-app';
import { EyeOutlined, CheckOutlined, CloseOutlined } from '@ant-design/icons';
import {
	useBillingRefunds,
	useApproveRefund,
	useRejectRefund,
	useExecuteRefund,
	type BillingRefundItem,
} from '@/hooks/use-billing-admin';
import { handleApiError } from '@/lib/error-handler';
import { PageError, DataTable } from '@autional/ui/antd';
import { AppPageHeader } from '@autional/ui';
import { useTranslation } from 'react-i18next';

export default function BillingRefundsPage() {
	const { t } = useTranslation();
	const [filters, setFilters] = useState<Record<string, unknown>>({});
	const { data: refunds = [], isLoading, error, refetch } = useBillingRefunds(filters);
	const approveMut = useApproveRefund();
	const rejectMut = useRejectRefund();
	const executeMut = useExecuteRefund();

	const [detailModal, setDetailModal] = useState(false);
	const [selected, setSelected] = useState<BillingRefundItem | null>(null);

	const handleApprove = async (id: string) => {
		try {
			await approveMut.mutateAsync(id);
			message.success(t('refunds2.approved'));
		} catch (err) {
			handleApiError(err, t('refunds2.approveFailed'));
		}
	};

	const handleReject = async (id: string) => {
		try {
			await rejectMut.mutateAsync(id);
			message.success(t('refunds2.rejected'));
		} catch (err) {
			handleApiError(err, t('refunds2.rejectFailed'));
		}
	};

	const handleExecute = async (id: string) => {
		try {
			await executeMut.mutateAsync({ id, data: {} });
			message.success(t('refunds2.executed'));
		} catch (err) {
			handleApiError(err, t('refunds2.executeFailed'));
		}
	};

	const columns = [
		{ title: t('refunds2.column.id'), dataIndex: 'id', key: 'id', ellipsis: true, width: 160 },
		{
			title: t('refunds2.column.tenantId'),
			dataIndex: 'tenantId',
			key: 'tenantId',
			ellipsis: true,
			width: 160,
		},
		{
			title: t('refunds2.column.invoiceNumber'),
			dataIndex: 'invoiceNumber',
			key: 'invoiceNumber',
			width: 140,
			render: (v: string) => v || '-',
		},
		{
			title: t('refunds2.column.amount'),
			dataIndex: 'amount',
			key: 'amount',
			width: 100,
			render: (v: string) => `$${parseFloat(v).toFixed(2)}`,
		},
		{
			title: t('refunds2.column.status'),
			dataIndex: 'status',
			key: 'status',
			width: 100,
			render: (v: string) => {
				const colorMap: Record<string, string> = {
					pending: 'processing',
					approved: 'warning',
					rejected: 'error',
					executed: 'success',
					completed: 'success',
				};
				const labelMap: Record<string, string> = {
					pending: t('refunds2.status.pending'),
					approved: t('refunds2.status.approved'),
					rejected: t('refunds2.status.rejected'),
					executed: t('refunds2.status.executed'),
					completed: t('refunds2.status.completed'),
				};
				return <Tag color={colorMap[v] ?? 'default'}>{labelMap[v] ?? v}</Tag>;
			},
		},
		{ title: t('refunds2.column.reason'), dataIndex: 'reason', key: 'reason', ellipsis: true },
		{
			title: t('refunds2.column.createdAt'),
			dataIndex: 'createdAt',
			key: 'createdAt',
			width: 160,
			render: (v: string) => (v ? new Date(v).toLocaleString() : '-'),
		},
		{
			title: t('refunds2.column.actions'),
			key: 'action',
			width: 240,
			render: (_: unknown, record: BillingRefundItem) => (
				<Space size="small">
					<Button
						type="link"
						size="small"
						icon={<EyeOutlined />}
						onClick={() => {
							setSelected(record);
							setDetailModal(true);
						}}
					>
						{t('refunds2.detail')}
					</Button>
					{record.status === 'pending' && (
						<>
							<Button
								type="link"
								size="small"
								icon={<CheckOutlined />}
								onClick={() => handleApprove(record.id)}
							>
								{t('refunds2.approve')}
							</Button>
							<Button
								type="link"
								size="small"
								danger
								icon={<CloseOutlined />}
								onClick={() => handleReject(record.id)}
							>
								{t('refunds2.reject')}
							</Button>
						</>
					)}
					{record.status === 'approved' && (
						<Button type="primary" size="small" onClick={() => handleExecute(record.id)}>
							{t('refunds2.executeRefund')}
						</Button>
					)}
				</Space>
			),
		},
	];

	return (
		<div>
			<AppPageHeader title={t('refunds2.title')} />

			{error && <PageError message={t('refunds2.loadError')} retry={refetch} className="mb-4" />}

			<Card size="small" className="mb-4">
				<Space wrap>
					<Select
						placeholder={t('refunds2.filter.status')}
						allowClear
						className="w-30"
						value={filters.status}
						onChange={(v) => setFilters({ ...filters, status: v })}
						options={[
							{ value: 'pending', label: t('refunds2.status.pending') },
							{ value: 'approved', label: t('refunds2.status.approved') },
							{ value: 'executed', label: t('refunds2.status.executed') },
							{ value: 'rejected', label: t('refunds2.status.rejected') },
						]}
					/>
				</Space>
			</Card>

			<DataTable
				rowKey="id"
				columns={columns}
				dataSource={refunds}
				loading={isLoading}
				pagination={{ pageSize: 10 }}
				scroll={{ x: 1200 }}
			/>

			<Modal
				title={t('refunds2.detailTitle')}
				open={detailModal}
				onCancel={() => {
					setDetailModal(false);
					setSelected(null);
				}}
				footer={null}
				width={560}
				className="w-full max-w-[560px]"
			>
				{selected && (
					<Descriptions column={1} bordered size="small">
						<Descriptions.Item label={t('refunds2.column.id')}>{selected.id}</Descriptions.Item>
						<Descriptions.Item label={t('refunds2.column.tenantId')}>
							{selected.tenantId}
						</Descriptions.Item>
						<Descriptions.Item label={t('refunds2.column.amount')}>
							${parseFloat(selected.amount).toFixed(2)}
						</Descriptions.Item>
						<Descriptions.Item label={t('refunds2.column.status')}>
							<Tag color={selected.status === 'executed' ? 'success' : 'processing'}>
								{selected.status}
							</Tag>
						</Descriptions.Item>
						<Descriptions.Item label={t('refunds2.column.reason')}>
							{selected.reason || '-'}
						</Descriptions.Item>
						<Descriptions.Item label={t('refunds2.detail.requestedBy')}>
							{selected.requestedBy || '-'}
						</Descriptions.Item>
						<Descriptions.Item label={t('refunds2.detail.approvedBy')}>
							{selected.approvedBy || '-'}
						</Descriptions.Item>
						<Descriptions.Item label={t('refunds2.column.createdAt')}>
							{selected.createdAt ? new Date(selected.createdAt).toLocaleString() : '-'}
						</Descriptions.Item>
					</Descriptions>
				)}
			</Modal>
		</div>
	);
}
