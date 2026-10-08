'use client';

import React, { useState } from 'react';
import { Card, Form, Select, Button, Space, Tag } from 'antd';
import { message } from '@/lib/antd-app';
import { DownloadOutlined } from '@ant-design/icons';
import { useTaxExport, type TaxExportItem } from '@/hooks/use-billing-admin';
import { PageError, DataTable, DateRangeFilter } from '@autional/ui/antd';
import type { DateRangeValue } from '@autional/ui/antd';
import { AppPageHeader } from '@autional/ui';
import { useTranslation } from 'react-i18next';

/** 该页的筛选口径（收敛前是 `Record<string, unknown>`；`period` 是 `开始_结束` 的拼接串）。 */
type TaxExportFilters = {
	period?: string;
	format?: string;
};

export default function BillingTaxExportPage() {
	const { t } = useTranslation();
	const [filters, setFilters] = useState<TaxExportFilters>({});
	const { data: exports = [], isLoading, error, refetch } = useTaxExport(filters);

	// `period` 是 `开始_结束` 的拼接串，这里拆回区间给筛选器；拆不出两段就是「未选」。
	const [periodStart, periodEnd] = (filters.period ?? '').split('_');
	const periodRange: DateRangeValue = periodStart && periodEnd ? [periodStart, periodEnd] : null;

	const columns = [
		{ title: t('taxExport.column.id'), dataIndex: 'id', key: 'id', ellipsis: true, width: 160 },
		{ title: t('taxExport.column.period'), dataIndex: 'period', key: 'period', width: 140 },
		{
			title: t('taxExport.column.format'),
			dataIndex: 'format',
			key: 'format',
			width: 80,
			render: (v: string) => v?.toUpperCase() || '-',
		},
		{
			title: t('taxExport.column.status'),
			dataIndex: 'status',
			key: 'status',
			width: 100,
			render: (v: string) => (
				<Tag color={v === 'completed' ? 'success' : v === 'processing' ? 'processing' : 'default'}>
					{v === 'completed'
						? t('taxExport.status.completed')
						: v === 'processing'
							? t('taxExport.status.processing')
							: v}
				</Tag>
			),
		},
		{
			title: t('taxExport.column.createdAt'),
			dataIndex: 'createdAt',
			key: 'createdAt',
			width: 160,
			render: (v: string) => (v ? new Date(v).toLocaleString() : '-'),
		},
		{
			title: t('taxExport.column.actions'),
			key: 'action',
			width: 100,
			render: (_: unknown, record: TaxExportItem) => (
				<Button
					type="link"
					icon={<DownloadOutlined />}
					disabled={record.status !== 'completed' || !record.downloadUrl}
					onClick={() => {
						if (record.downloadUrl) {
							window.open(record.downloadUrl, '_blank');
						}
					}}
				>
					{t('taxExport.download')}
				</Button>
			),
		},
	];

	return (
		<div>
			<AppPageHeader title={t('taxExport.title')} />

			{error && <PageError message={t('taxExport.loadError')} retry={refetch} className="mb-4" />}

			<Card size="small" className="mb-4">
				<Space wrap>
					<DateRangeFilter
						value={periodRange}
						onChange={(range) => {
							if (range) {
								setFilters({ ...filters, period: `${range[0]}_${range[1]}` });
							} else {
								const { period, ...rest } = filters;
								setFilters(rest);
							}
						}}
					/>
					<Select
						placeholder={t('taxExport.formatFilter')}
						allowClear
						className="w-25"
						value={filters.format}
						onChange={(v) => setFilters({ ...filters, format: v })}
						options={[
							{ value: 'csv', label: 'CSV' },
							{ value: 'pdf', label: 'PDF' },
							{ value: 'xml', label: 'XML' },
						]}
					/>
					<Button type="primary" onClick={() => refetch()}>
						{t('taxExport.query')}
					</Button>
				</Space>
			</Card>

			<DataTable
				rowKey="id"
				columns={columns}
				dataSource={exports}
				loading={isLoading}
				pagination={{ pageSize: 10 }}
				scroll={{ x: 800 }}
			/>
		</div>
	);
}
