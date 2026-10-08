'use client';

import React, { useState } from 'react';
import { Tag, Button, Input, Space, Card, Descriptions, Spin, Select } from 'antd';
import { SearchOutlined } from '@ant-design/icons';
import { useCreditBalance, useCreditTransactions } from '@/hooks/use-billing-admin';
import { handleApiError } from '@/lib/error-handler';
import { PageError, DataTable } from '@autional/ui/antd';
import { AppPageHeader } from '@autional/ui';
import { useTranslation } from 'react-i18next';

export default function BillingCreditBalancePage() {
	const { t } = useTranslation();
	const [tenantId, setTenantId] = useState('');
	const [lookupId, setLookupId] = useState('');
	const [sourceFilter, setSourceFilter] = useState<string | undefined>();
	const [page, setPage] = useState(1);
	const [pageSize, setPageSize] = useState(10);

	const {
		data: balance,
		isLoading: balanceLoading,
		error: balanceError,
		refetch: balanceRefetch,
	} = useCreditBalance(lookupId);

	const {
		data: txData,
		isLoading: txLoading,
		error: txError,
		refetch: txRefetch,
	} = useCreditTransactions(lookupId, { page, pageSize, source: sourceFilter });

	const transactions = txData?.items ?? [];
	const total = txData?.total ?? 0;

	const sourceColorMap: Record<string, string> = {
		proration: 'blue',
		refund: 'orange',
		promo: 'green',
		manual_adjust: 'purple',
	};
	const sourceLabelMap: Record<string, string> = {
		proration: t('creditBalance.source.proration'),
		refund: t('creditBalance.source.refund'),
		promo: t('creditBalance.source.promo'),
		manual_adjust: t('creditBalance.source.manualAdjust'),
	};

	const txColumns = [
		{
			title: t('creditBalance.column.time'),
			dataIndex: 'createdAt',
			key: 'createdAt',
			width: 170,
			render: (v: string) => (v ? new Date(v).toLocaleString() : '-'),
		},
		{
			title: t('creditBalance.column.type'),
			dataIndex: 'source',
			key: 'source',
			width: 100,
			render: (v: string) => (
				<Tag color={sourceColorMap[v] ?? 'default'}>{sourceLabelMap[v] ?? v}</Tag>
			),
		},
		{
			title: t('creditBalance.column.amount'),
			dataIndex: 'amount',
			key: 'amount',
			width: 120,
			render: (v: number) => (
				<span className={v > 0 ? 'text-success-text' : 'text-danger-text'}>
					{v > 0 ? '+' : ''}
					{v?.toLocaleString() ?? '-'}
				</span>
			),
		},
		{
			title: t('creditBalance.column.balance'),
			dataIndex: 'balance',
			key: 'balance',
			width: 120,
			render: (v: number) => v?.toLocaleString() ?? '-',
		},
		{ title: t('creditBalance.column.remark'), dataIndex: 'remark', key: 'remark', ellipsis: true },
		{
			title: t('creditBalance.column.sourceId'),
			dataIndex: 'sourceId',
			key: 'sourceId',
			ellipsis: true,
			width: 140,
			render: (v: string) => v || '-',
		},
	];

	return (
		<div>
			<AppPageHeader title={t('creditBalance.title')} />

			<Card size="small" className="mb-4 max-w-xs">
				<div className="flex gap-2 items-end">
					<div className="flex-1">
						<label className="text-xs text-neutral-600 mb-1 block">
							{t('creditBalance.tenantId')}
						</label>
						<Input
							value={tenantId}
							onChange={(e) => setTenantId(e.target.value)}
							placeholder={t('creditBalance.tenantIdPlaceholder')}
							onPressEnter={() => {
								setLookupId(tenantId);
								setPage(1);
							}}
						/>
					</div>
					<Button
						icon={<SearchOutlined />}
						onClick={() => {
							setLookupId(tenantId);
							setPage(1);
						}}
					>
						{t('creditBalance.query')}
					</Button>
				</div>
			</Card>

			{!lookupId ? (
				<div className="text-neutral-600 py-8 text-center">{t('creditBalance.enterTenantIdHint')}</div>
			) : (
				<>
					{balanceError && (
						<PageError
							message={t('creditBalance.balanceLoadError')}
							retry={balanceRefetch}
							className="mb-4"
						/>
					)}

					{balanceLoading ? (
						<div className="flex justify-center py-8">
							<Spin />
						</div>
					) : balance ? (
						<div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
							<Card size="small">
								<Descriptions column={1} size="small">
									<Descriptions.Item label={t('creditBalance.availableBalance')}>
										<span className="text-lg font-semibold text-success-text">
											{balance.balance?.toLocaleString() ?? 0} {balance.currency || ''}
										</span>
									</Descriptions.Item>
								</Descriptions>
							</Card>
							<Card size="small">
								<Descriptions column={1} size="small">
									<Descriptions.Item label={t('creditBalance.tenantIdLabel')}>
										{balance.tenantId || lookupId}
									</Descriptions.Item>
									<Descriptions.Item label={t('creditBalance.updatedAt')}>
										{balance.updatedAt ? new Date(balance.updatedAt).toLocaleString() : '-'}
									</Descriptions.Item>
								</Descriptions>
							</Card>
						</div>
					) : (
						<div className="text-neutral-600 py-4 text-center mb-4">{t('creditBalance.notFound')}</div>
					)}

					{txError && (
						<PageError
							message={t('creditBalance.txLoadError')}
							retry={txRefetch}
							className="mb-4"
						/>
					)}

					<Card size="small" className="mb-4">
						<Space wrap>
							<Select
								placeholder={t('creditBalance.filter.source')}
								allowClear
								className="w-[140px]"
								value={sourceFilter}
								onChange={(v) => {
									setSourceFilter(v);
									setPage(1);
								}}
								options={[
									{ value: 'proration', label: t('creditBalance.source.proration') },
									{ value: 'refund', label: t('creditBalance.source.refund') },
									{ value: 'promo', label: t('creditBalance.source.promo') },
									{ value: 'manual_adjust', label: t('creditBalance.source.manualAdjust') },
								]}
							/>
						</Space>
					</Card>

					<DataTable
						rowKey="id"
						columns={txColumns}
						dataSource={transactions}
						loading={txLoading}
						pagination={{
							current: page,
							pageSize,
							total,
							showSizeChanger: true,
							showTotal: (total) => t('creditBalance.totalItems', { count: total }),
							onChange: (p, ps) => {
								setPage(p);
								setPageSize(ps);
							},
						}}
						scroll={{ x: 900 }}
					/>
				</>
			)}
		</div>
	);
}
