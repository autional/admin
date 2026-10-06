'use client';

import React, { useState } from 'react';
import { Tag, Select, Space, Card, Button, Modal, Descriptions } from 'antd';
import { EyeOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { usePayRefunds, type PaymentItem } from '@/hooks/use-pay';
import { PageError, DataTable } from '@autional/ui/antd';
import { ConsolePageHeader } from '@autional/ui';

export default function PayRefundsPage() {
	const { t } = useTranslation();
	const [filters, setFilters] = useState<Record<string, unknown>>({});
	const [detailModal, setDetailModal] = useState(false);
	const [selected, setSelected] = useState<PaymentItem | null>(null);

	const params: Record<string, unknown> = {};
	if (filters.status) params.status = filters.status;

	const { data: payments = [], isLoading, error, refetch } = usePayRefunds();

	const refundedPayments = payments.filter(
		(p) => p.status === 'refunded' || p.status === 'processing',
	);

	const channelLabels: Record<string, string> = {
		wechat: t('payRefunds.channel.wechat'),
		alipay: t('payRefunds.channel.alipay'),
		stripe: t('payRefunds.channel.stripe'),
	};
	const currLabels: Record<string, string> = { CNY: '¥', USD: '$' };

	const columns = [
		{
			title: t('payRefunds.paymentId'),
			dataIndex: 'paymentId',
			key: 'paymentId',
			ellipsis: true,
			width: 160,
		},
		{
			title: t('payRefunds.userId'),
			dataIndex: 'payerId',
			key: 'payerId',
			ellipsis: true,
			width: 120,
		},
		{
			title: t('payRefunds.channel'),
			dataIndex: 'channelCode',
			key: 'channelCode',
			width: 100,
			render: (v: string) => channelLabels[v] ?? v,
		},
		{
			title: t('payRefunds.amount'),
			dataIndex: 'amount',
			key: 'amount',
			width: 120,
			render: (v: string, r: PaymentItem) =>
				`${currLabels[r.currency] ?? r.currency}${parseFloat(v).toFixed(2)}`,
		},
		{
			title: t('payRefunds.refundStatus'),
			dataIndex: 'status',
			key: 'status',
			width: 100,
			render: (v: string) => (
				<Tag color={v === 'refunded' ? 'success' : v === 'processing' ? 'processing' : 'error'}>
					{v === 'refunded'
						? t('payRefunds.refundStatus.refunded')
						: v === 'processing'
							? t('payRefunds.refundStatus.processing')
							: v}
				</Tag>
			),
		},
		{ title: t('payRefunds.targetType'), dataIndex: 'targetType', key: 'targetType', width: 100 },
		{
			title: t('payRefunds.createdAt'),
			dataIndex: 'createdAt',
			key: 'createdAt',
			width: 160,
			render: (v: string) => (v ? new Date(v).toLocaleString() : '-'),
		},
		{
			title: t('payRefunds.actions'),
			key: 'action',
			width: 80,
			render: (_: unknown, record: PaymentItem) => (
				<Button
					type="link"
					icon={<EyeOutlined />}
					onClick={() => {
						setSelected(record);
						setDetailModal(true);
					}}
				>
					{t('payRefunds.detail')}
				</Button>
			),
		},
	];

	return (
		<div>
			<ConsolePageHeader title={t('payRefunds.title')} />

			{error && <PageError message={t('payRefunds.loadError')} retry={refetch} className="mb-4" />}

			<Card size="small" className="mb-4">
				<Space wrap>
					<Select
						placeholder={t('payRefunds.status')}
						allowClear
						className="w-30"
						value={filters.status}
						onChange={(v) => setFilters({ ...filters, status: v })}
						options={[
							{ value: 'refunded', label: t('payRefunds.status.refunded') },
							{ value: 'processing', label: t('payRefunds.status.processing') },
							{ value: 'failed', label: t('payRefunds.status.failed') },
						]}
					/>
				</Space>
			</Card>

			<DataTable
				rowKey="paymentId"
				columns={columns}
				dataSource={refundedPayments}
				loading={isLoading}
				pagination={{ pageSize: 10 }}
				scroll={{ x: 1000 }}
			/>

			<Modal
				title={t('payRefunds.detailTitle')}
				open={detailModal}
				onCancel={() => {
					setDetailModal(false);
					setSelected(null);
				}}
				footer={null}
				width={640}
				className="w-full max-w-[640px]"
			>
				{selected && (
					<Descriptions column={1} bordered size="small">
						<Descriptions.Item label={t('payRefunds.paymentId')}>
							{selected.paymentId}
						</Descriptions.Item>
						<Descriptions.Item label={t('payRefunds.userId')}>{selected.payerId}</Descriptions.Item>
						<Descriptions.Item label={t('payRefunds.channel')}>
							{channelLabels[selected.channelCode] ?? selected.channelCode}
						</Descriptions.Item>
						<Descriptions.Item label={t('payRefunds.originalAmount')}>
							{currLabels[selected.currency] ?? selected.currency}
							{parseFloat(selected.amount).toFixed(2)}
						</Descriptions.Item>
						<Descriptions.Item label={t('payRefunds.refundStatus')}>
							<Tag color={selected.status === 'refunded' ? 'success' : 'processing'}>
								{selected.status === 'refunded'
									? t('payRefunds.refundStatus.refunded')
									: selected.status}
							</Tag>
						</Descriptions.Item>
						<Descriptions.Item label={t('payRefunds.gatewayRef')}>
							{selected.gatewayReference || '-'}
						</Descriptions.Item>
						<Descriptions.Item label={t('payRefunds.description')}>
							{selected.itemDescription || '-'}
						</Descriptions.Item>
						<Descriptions.Item label={t('payRefunds.paidAt')}>
							{selected.paidAt ? new Date(selected.paidAt).toLocaleString() : '-'}
						</Descriptions.Item>
					</Descriptions>
				)}
			</Modal>
		</div>
	);
}
