'use client';

import React, { useState } from 'react';
import { useCurrentTenantId } from '@autional/shared';
import { Tag, Select, Space, Card, Row, Col, Statistic, Button } from 'antd';
import { RetweetOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';

import {
	usePayReconciliation,
	useRunPayReconciliation,
	type ReconciliationRecord,
} from '@/hooks/use-pay';
import { PageError, DataTable, DateRangeFilter } from '@autional/ui/antd';
import type { DateRangeValue } from '@autional/ui/antd';
import { AppPageHeader } from '@autional/ui';

/** 该页的筛选口径（收敛前是 `Record<string, unknown>`，于是 RangePicker 那边只能靠 `dates[0]?.format()` 现场拼）。 */
type ReconFilters = {
	channel?: string;
	startDate?: string;
	endDate?: string;
};

export default function PayReconciliationPage() {
	const { t } = useTranslation();
	const tenantId = useCurrentTenantId() ?? '';
	const [filters, setFilters] = useState<ReconFilters>({});
	const dateRange: DateRangeValue =
		filters.startDate && filters.endDate ? [filters.startDate, filters.endDate] : null;

	const params: Record<string, unknown> = {};
	// TASK-AB1-27（RC-5 契约收敛）：查询参数 camel 书面写（拦截器 snake 化上 wire）。
	// wire 锚：service-pay/internal/handler/dto/dto.go:157-161（GetReconciliationRequest form start_date/end_date）
	if (filters.channel) params.channel = filters.channel;
	if (filters.startDate) params.startDate = filters.startDate;
	if (filters.endDate) params.endDate = filters.endDate;

	const { data: records = [], isLoading, error, refetch } = usePayReconciliation(tenantId, params);
	const { mutate: runReconciliation, isPending: isRunning } = useRunPayReconciliation();

	const handleRunReconciliation = () => {
		runReconciliation(params, {
			onSuccess: () => refetch(),
		});
	};

	const stats = {
		total: records.length,
		matched: records.filter((r) => r.status === 'matched').length,
		mismatched: records.filter((r) => r.status === 'mismatched').length,
		missing: records.filter((r) => r.status === 'missing').length,
	};

	const channelLabels: Record<string, string> = {
		wechat: t('payReconciliation.channel.wechat'),
		alipay: t('payReconciliation.channel.alipay'),
		stripe: t('payReconciliation.channel.stripe'),
	};

	const columns = [
		{ title: t('payReconciliation.id'), dataIndex: 'id', key: 'id', ellipsis: true, width: 160 },
		{
			title: t('payReconciliation.channel'),
			dataIndex: 'channel',
			key: 'channel',
			width: 100,
			render: (v: string) => channelLabels[v] ?? v,
		},
		{
			title: t('payReconciliation.gatewayRef'),
			dataIndex: 'gatewayRef',
			key: 'gatewayRef',
			width: 140,
		},
		{
			title: t('payReconciliation.gatewayAmount'),
			dataIndex: 'gatewayAmount',
			key: 'gatewayAmount',
			width: 120,
			render: (v: string) => parseFloat(v).toFixed(2),
		},
		{
			title: t('payReconciliation.internalRef'),
			dataIndex: 'internalRef',
			key: 'internalRef',
			ellipsis: true,
			width: 140,
		},
		{
			title: t('payReconciliation.internalAmount'),
			dataIndex: 'internalAmount',
			key: 'internalAmount',
			width: 120,
			render: (v: string) => parseFloat(v).toFixed(2),
		},
		{
			title: t('payReconciliation.diffAmount'),
			dataIndex: 'diffAmount',
			key: 'diffAmount',
			width: 120,
			render: (v: string) => {
				const diff = parseFloat(v);
				return (
					<span className={diff !== 0 ? 'text-danger-text font-medium' : 'text-success-text'}>
						{diff.toFixed(2)}
					</span>
				);
			},
		},
		{
			title: t('payReconciliation.status'),
			dataIndex: 'status',
			key: 'status',
			width: 100,
			render: (v: string) => {
				const colorMap: Record<string, string> = {
					matched: 'success',
					mismatched: 'error',
					missing: 'warning',
				};
				const labelMap: Record<string, string> = {
					matched: t('payReconciliation.status.matched'),
					mismatched: t('payReconciliation.status.mismatched'),
					missing: t('payReconciliation.status.missing'),
				};
				return <Tag color={colorMap[v] ?? 'default'}>{labelMap[v] ?? v}</Tag>;
			},
		},
		{
			title: t('payReconciliation.reconciledAt'),
			dataIndex: 'reconciledAt',
			key: 'reconciledAt',
			width: 160,
			render: (v: string) => (v ? new Date(v).toLocaleString() : '-'),
		},
	];

	return (
		<div>
			<AppPageHeader title={t('payReconciliation.title')} />

			{error && (
				<PageError message={t('payReconciliation.loadError')} retry={refetch} className="mb-4" />
			)}

			<Row gutter={16} className="mb-4">
				<Col xs={12} sm={6}>
					<Card size="small">
						<Statistic title={t('payReconciliation.stats.total')} value={stats.total} />
					</Card>
				</Col>
				<Col xs={12} sm={6}>
					<Card size="small">
						<Statistic
							title={t('payReconciliation.stats.matched')}
							value={stats.matched}
							valueStyle={{ color: 'var(--color-success-light)' }}
						/>
					</Card>
				</Col>
				<Col xs={12} sm={6}>
					<Card size="small">
						<Statistic
							title={t('payReconciliation.stats.mismatched')}
							value={stats.mismatched}
							valueStyle={{ color: 'var(--color-error-light)' }}
						/>
					</Card>
				</Col>
				<Col xs={12} sm={6}>
					<Card size="small">
						<Statistic
							title={t('payReconciliation.stats.missing')}
							value={stats.missing}
							valueStyle={{ color: 'var(--color-warning-light)' }}
						/>
					</Card>
				</Col>
			</Row>

			<Card size="small" className="mb-4">
				<Space wrap>
					<Select
						placeholder={t('payReconciliation.channel')}
						allowClear
						className="w-30"
						value={filters.channel}
						onChange={(v) => setFilters({ ...filters, channel: v })}
						options={[
							{ value: 'wechat', label: t('payReconciliation.channel.wechat') },
							{ value: 'alipay', label: t('payReconciliation.channel.alipay') },
							{ value: 'stripe', label: t('payReconciliation.channel.stripe') },
						]}
					/>
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
					<Button
						type="primary"
						icon={<RetweetOutlined />}
						loading={isRunning}
						onClick={handleRunReconciliation}
					>
						{t('payReconciliation.runReconciliation')}
					</Button>
				</Space>
			</Card>

			<DataTable
				rowKey="id"
				columns={columns}
				dataSource={records}
				loading={isLoading}
				pagination={{ pageSize: 10 }}
				scroll={{ x: 1100 }}
			/>
		</div>
	);
}
