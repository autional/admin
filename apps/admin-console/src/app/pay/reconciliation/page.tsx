'use client';

import React, { useRef, useState } from 'react';
import { useCurrentTenantId, usePageTitle } from '@autional/shared';
import { Tag, Select, Space, Card, Row, Col, Statistic, Button, Popconfirm } from 'antd';
import { Repeat2, Trash2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { message } from '@/lib/antd-app';
import { handleApiError } from '@/lib/error-handler';

import {
	usePayReconciliation,
	useRunPayReconciliation,
	useDeletePayReconciliation,
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
	const { t, i18n } = useTranslation();
	usePageTitle(t('payReconciliation.title')); // A-351①：tab 标题（旧实现恒「Autional 管理控制台」，第 22 例）
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
	const deleteMut = useDeletePayReconciliation();

	// A-349：后端 Reconcile 无幂等（对同一支付重复 INSERT 重复行）⇒ 执行中双击防护；
	// ref 覆盖 Button loading 生效前的同 tick 窗口（loading 仅挡渲染后点击）。
	const runningRef = useRef(false);
	const handleRunReconciliation = () => {
		if (runningRef.current) return;
		runningRef.current = true;
		runReconciliation(params, {
			onSuccess: () => refetch(),
			onSettled: () => {
				runningRef.current = false;
			},
		});
	};

	// A-349：删除 UI（DELETE 端点 router.go:135 早已存在、零 UI 入口）
	const handleDelete = async (id: string) => {
		try {
			await deleteMut.mutateAsync(id);
			message.success(t('payReconciliation.deleteSuccess'));
		} catch (err) {
			handleApiError(err, t('payReconciliation.deleteFailed'));
		}
	};

	const stats = {
		total: records.length,
		matched: records.filter((r) => r.status === 'matched').length,
		mismatched: records.filter((r) => r.status === 'mismatched').length,
		missing: records.filter((r) => r.status === 'missing').length,
	};

	// A-351④：从未对账 vs 筛选无果同为「暂无数据」——补条件化空态
	const hasFilters = !!(filters.channel || filters.startDate || filters.endDate);

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
			// A-351②：toLocaleString 无 locale（旧恒跑宿主默认）
			render: (v: string) => (v ? new Date(v).toLocaleString(i18n.language) : '-'),
		},
		{
			title: t('payReconciliation.actions'),
			key: 'action',
			width: 80,
			render: (_: unknown, record: ReconciliationRecord) => (
				<Popconfirm
					title={t('payReconciliation.confirmDelete')}
					onConfirm={() => handleDelete(record.id)}
					okText={t('payReconciliation.ok')}
					cancelText={t('payReconciliation.cancel')}
				>
					<Button type="link" danger icon={<Trash2 size="1em" />}>
						{t('payReconciliation.delete')}
					</Button>
				</Popconfirm>
			),
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

			{/* A-349：四卡 = 当前筛选范围内历史累计行数（非「当前状况」）——口径标注防误读 */}
			<div className="text-neutral-600 text-sm mb-4 -mt-2">{t('payReconciliation.statsCumulativeNote')}</div>

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
						icon={<Repeat2 size="1em" />}
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
				// A-351④：从未对账 vs 筛选无果区分（旧同为「暂无数据」）
				locale={{ emptyText: hasFilters ? t('payReconciliation.emptyFiltered') : t('payReconciliation.emptyNever') }}
			/>
		</div>
	);
}
