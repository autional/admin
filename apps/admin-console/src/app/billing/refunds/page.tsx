'use client';

import React, { useState } from 'react';
import { Tag, Button, Modal, Form, Input, Select, Space, Card, Descriptions, Popconfirm } from 'antd';
import { message } from '@/lib/antd-app';
import { Check, Eye, X } from 'lucide-react';
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
import { usePageTitle } from '@autional/shared';

// A-409③：状态标签/配色单点（表格与详情弹窗共用，杜绝详情裸显英文原文）
const REFUND_STATUS_COLORS: Record<string, string> = {
	pending: 'processing',
	approved: 'warning',
	rejected: 'error',
	executed: 'success',
	completed: 'success',
};

export default function BillingRefundsPage() {
	const { t } = useTranslation();
	usePageTitle(t('refunds2.title'));
	const [filters, setFilters] = useState<Record<string, unknown>>({});
	const { data: refunds = [], isLoading, error, refetch } = useBillingRefunds(filters);
	const approveMut = useApproveRefund();
	const rejectMut = useRejectRefund();
	const executeMut = useExecuteRefund();

	const [detailModal, setDetailModal] = useState(false);
	const [selected, setSelected] = useState<BillingRefundItem | null>(null);

	// A-407：执行打款需收款用户（wire 必填 user_id）→ 二次确认弹窗（A-408）
	const [executeTarget, setExecuteTarget] = useState<BillingRefundItem | null>(null);
	const [executeForm] = Form.useForm();

	const refundStatusLabels: Record<string, string> = {
		pending: t('refunds2.status.pending'),
		approved: t('refunds2.status.approved'),
		rejected: t('refunds2.status.rejected'),
		executed: t('refunds2.status.executed'),
		completed: t('refunds2.status.completed'),
	};

	const renderRefundStatus = (v: string) => (
		<Tag color={REFUND_STATUS_COLORS[v] ?? 'default'}>{refundStatusLabels[v] ?? v}</Tag>
	);

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

	const handleExecute = async (values: { userId: string }) => {
		if (!executeTarget) return;
		try {
			// A-407：wire 必填 user_id（ExecuteRefundRequest dto.go:619-630）；旧空 body {} 必 400
			await executeMut.mutateAsync({
				id: executeTarget.id,
				data: { userId: values.userId },
			});
			message.success(t('refunds2.executed'));
			setExecuteTarget(null);
			executeForm.resetFields();
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
			// A-409④：wire 全 CNY → 币符 ¥（A-292 $ 家族）
			render: (v: string) => `¥${parseFloat(v).toFixed(2)}`,
		},
		{
			title: t('refunds2.column.status'),
			dataIndex: 'status',
			key: 'status',
			width: 100,
			render: (v: string) => renderRefundStatus(v),
		},
		{ title: t('refunds2.column.reason'), dataIndex: 'reason', key: 'reason', ellipsis: true },
		{
			title: t('refunds2.column.createdAt'),
			dataIndex: 'createdAt',
			key: 'createdAt',
			width: 160,
			// A-409⑤：时间本地化补 locale
			render: (v: string) => (v ? new Date(v).toLocaleString('zh-CN') : '-'),
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
						icon={<Eye size="1em" />}
						onClick={() => {
							setSelected(record);
							setDetailModal(true);
						}}
					>
						{t('refunds2.detail')}
					</Button>
					{record.status === 'pending' && (
						<>
							{/* A-408：资金/审批动作二次确认（旧一键直发不可逆） */}
							<Popconfirm
								title={t('refunds2.approveConfirm')}
								onConfirm={() => handleApprove(record.id)}
								okText={t('refunds2.confirmOk')}
								cancelText={t('refunds2.confirmCancel')}
							>
								<Button type="link" size="small" icon={<Check size="1em" />}>
									{t('refunds2.approve')}
								</Button>
							</Popconfirm>
							<Popconfirm
								title={t('refunds2.rejectConfirm')}
								onConfirm={() => handleReject(record.id)}
								okText={t('refunds2.confirmOk')}
								cancelText={t('refunds2.confirmCancel')}
							>
								<Button type="link" size="small" danger icon={<X size="1em" />}>
									{t('refunds2.reject')}
								</Button>
							</Popconfirm>
						</>
					)}
					{record.status === 'approved' && (
						<Button
							type="primary"
							size="small"
							onClick={() => {
								setExecuteTarget(record);
								executeForm.resetFields();
							}}
						>
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
							{ value: 'completed', label: t('refunds2.status.completed') },
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
							¥{parseFloat(selected.amount).toFixed(2)}
						</Descriptions.Item>
						<Descriptions.Item label={t('refunds2.column.status')}>
							{renderRefundStatus(selected.status)}
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
							{selected.createdAt ? new Date(selected.createdAt).toLocaleString('zh-CN') : '-'}
						</Descriptions.Item>
					</Descriptions>
				)}
			</Modal>

			{/* A-407/A-408：执行打款二次确认弹窗（收款用户必填 → user_id） */}
			<Modal
				title={t('refunds2.executeRefund')}
				open={!!executeTarget}
				onCancel={() => {
					setExecuteTarget(null);
					executeForm.resetFields();
				}}
				onOk={() => executeForm.submit()}
				confirmLoading={executeMut.isPending}
				className="w-full max-w-[560px]"
			>
				<Form form={executeForm} layout="vertical" onFinish={handleExecute}>
					<Form.Item
						name="userId"
						label={t('refunds2.execute.userId')}
						rules={[{ required: true }]}
					>
						<Input placeholder={t('refunds2.execute.userIdPlaceholder')} />
					</Form.Item>
				</Form>
			</Modal>
		</div>
	);
}
