'use client';

import React, { useState } from 'react';
import { Card, Button, Space, Tag } from 'antd';
import { Download } from 'lucide-react';
import { useTaxExport, type TaxExportItem } from '@/hooks/use-billing-admin';
import { PageError, DataTable, DateRangeFilter } from '@autional/ui/antd';
import type { DateRangeValue } from '@autional/ui/antd';
import { AppPageHeader } from '@autional/ui';
import { useTranslation } from 'react-i18next';
import { usePageTitle } from '@autional/shared';

/** 该页的筛选口径（收敛前是 `Record<string, unknown>`；`period` 是 `开始_结束` 的拼接串）。
 *  A-421：`format` 键移除 —— 服务端只读 `period`（tax.go:98），生成层类型亦仅 `{period}`
 *  （shared api.ts:1264-1266），三层全不消费的筛选已退场。 */
type TaxExportFilters = {
	period?: string;
};

export default function BillingTaxExportPage() {
	const { t } = useTranslation();
	usePageTitle(t('taxExport.title'));
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
			// A-422④：status 色映射 completed/processing 为想象值（域无 Status 字段）→ 原样渲染
			render: (v: string) => (v ? <Tag>{v}</Tag> : '-'),
		},
		{
			title: t('taxExport.column.createdAt'),
			dataIndex: 'createdAt',
			key: 'createdAt',
			width: 160,
			// A-422②：时间本地化补 locale
			render: (v: string) => (v ? new Date(v).toLocaleString('zh-CN') : '-'),
		},
		{
			title: t('taxExport.column.actions'),
			key: 'action',
			width: 100,
			render: (_: unknown, record: TaxExportItem) => (
				<Button
					type="link"
					icon={<Download size="1em" />}
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
					{/* A-421：format Select 移除（服务端不读 format，选项 csv/pdf/xml 与文档 csv/json 亦不符）
					    A-422③：查询按钮移除（filters 入 queryKey，变更即自动重查） */}
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
