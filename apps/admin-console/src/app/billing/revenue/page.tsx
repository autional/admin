'use client';

import React, { useState } from 'react';
import { Card, Row, Col, Statistic, Space, Select, Button } from 'antd';
import { SearchOutlined, DollarOutlined } from '@ant-design/icons';
import { useBillingRevenue, type RevenueItem } from '@/hooks/use-billing-admin';
import { PageError, DataTable, DateRangeFilter } from '@autional/ui/antd';
import type { DateRangeValue } from '@autional/ui/antd';
import { AppPageHeader } from '@autional/ui';
import { useTranslation } from 'react-i18next';

/** 该页的筛选口径（收敛前是 `Record<string, unknown>`）。 */
type RevenueFilters = {
	startDate?: string;
	endDate?: string;
};

export default function BillingRevenuePage() {
	const { t } = useTranslation();
	const [filters, setFilters] = useState<RevenueFilters>({});
	const dateRange: DateRangeValue =
		filters.startDate && filters.endDate ? [filters.startDate, filters.endDate] : null;

	const { data: revenues = [], isLoading, error, refetch } = useBillingRevenue(filters);

	const totalRevenue = revenues.reduce((sum, r) => sum + parseFloat(r.totalRevenue || '0'), 0);
	const totalRecognized = revenues.reduce(
		(sum, r) => sum + parseFloat(r.recognizedRevenue || '0'),
		0,
	);
	const totalDeferred = revenues.reduce((sum, r) => sum + parseFloat(r.deferredRevenue || '0'), 0);

	const columns = [
		{ title: t('revenue.column.period'), dataIndex: 'period', key: 'period', width: 120 },
		{
			title: t('revenue.column.planCode'),
			dataIndex: 'planCode',
			key: 'planCode',
			width: 120,
			render: (v: string) => v || '-',
		},
		{
			title: t('revenue.column.totalRevenue'),
			dataIndex: 'totalRevenue',
			key: 'totalRevenue',
			width: 140,
			render: (v: string) => `$${parseFloat(v).toFixed(2)}`,
		},
		{
			title: t('revenue.column.recognizedRevenue'),
			dataIndex: 'recognizedRevenue',
			key: 'recognizedRevenue',
			width: 140,
			render: (v: string) => (v ? `$${parseFloat(v).toFixed(2)}` : '-'),
		},
		{
			title: t('revenue.column.deferredRevenue'),
			dataIndex: 'deferredRevenue',
			key: 'deferredRevenue',
			width: 140,
			render: (v: string) => (v ? `$${parseFloat(v).toFixed(2)}` : '-'),
		},
		{
			title: t('revenue.column.transactionCount'),
			dataIndex: 'transactionCount',
			key: 'transactionCount',
			width: 100,
		},
	];

	return (
		<div>
			<AppPageHeader title={t('revenue.title')} />

			{error && <PageError message={t('revenue.loadError')} retry={refetch} className="mb-4" />}

			<Row gutter={16} className="mb-4">
				<Col xs={24} sm={8}>
					<Card size="small">
						<Statistic
							title={t('revenue.totalRevenue')}
							prefix="$"
							value={totalRevenue}
							precision={2}
							valueStyle={{ color: 'var(--color-success-light)' }}
						/>
					</Card>
				</Col>
				<Col xs={24} sm={8}>
					<Card size="small">
						<Statistic
							title={t('revenue.recognizedRevenue')}
							prefix="$"
							value={totalRecognized}
							precision={2}
						/>
					</Card>
				</Col>
				<Col xs={24} sm={8}>
					<Card size="small">
						<Statistic
							title={t('revenue.deferredRevenue')}
							prefix="$"
							value={totalDeferred}
							precision={2}
							valueStyle={{ color: 'var(--color-info-light)' }}
						/>
					</Card>
				</Col>
			</Row>

			<Card size="small" className="mb-4">
				<Space wrap>
					<DateRangeFilter
						value={dateRange}
						onChange={(range) => {
							if (range) {
								setFilters({ ...filters, startDate: range[0], endDate: range[1] });
							} else {
								const { startDate, endDate, ...rest } = filters;
								setFilters(rest);
							}
						}}
					/>
					<Button type="primary" icon={<SearchOutlined />} onClick={() => refetch()}>
						{t('revenue.query')}
					</Button>
				</Space>
			</Card>

			<DataTable
				rowKey="period"
				columns={columns}
				dataSource={revenues}
				loading={isLoading}
				pagination={{ pageSize: 10 }}
				scroll={{ x: 800 }}
			/>
		</div>
	);
}
