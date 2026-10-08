'use client';

import React, { useState } from 'react';
import { Card, Tag, Button, Popconfirm, Empty } from 'antd';
import { message } from '@/lib/antd-app';
import { Trash2 } from 'lucide-react';
import { useSessions, useActiveSessionCount, useDeleteSession } from '@/hooks/use-sessions';
import type { SessionRecord } from '@/hooks/use-sessions';
import { handleApiError } from '@/lib/error-handler';
import { DataTable } from '@autional/ui/antd';
import { AppPageHeader } from '@autional/ui';
import { classifyQueryState } from '@autional/shared';
import { useTranslation } from 'react-i18next';
import { QueryStateFallback } from '@/components/common/QueryStateFallback';

export default function SessionsPage() {
	const { t } = useTranslation();
	const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([]);

	const { data, isLoading, error, refetch } = useSessions();
	// RC-B4-01：activeCount 调用点消费 error/loading —— 403/失败时统计卡成态，不显 0（假 0 根因锁）。
	const {
		data: activeCount,
		isLoading: activeCountLoading,
		error: activeCountError,
	} = useActiveSessionCount();
	const activeCountState = classifyQueryState({
		isLoading: activeCountLoading,
		error: activeCountError,
		data: activeCount,
	});
	const activeCountText =
		activeCountState === 'forbidden'
			? t('common.forbidden')
			: activeCountState === 'error'
				? t('common.loadError')
				: activeCountState === 'loading'
					? '…'
					: String(activeCount ?? 0);
	const activeCountReady = activeCountState === 'ready' || activeCountState === 'empty';
	const deleteSessionMutation = useDeleteSession();

	const handleDelete = async (id: string) => {
		try {
			await deleteSessionMutation.mutateAsync(id);
			message.success(t('sessions.revokeSuccess'));
		} catch (err) {
			handleApiError(err, t('sessions.revokeFailed'));
		}
	};

	const handleBatchDelete = async () => {
		try {
			await Promise.all(
				selectedRowKeys.map((id) => deleteSessionMutation.mutateAsync(id as string)),
			);
			message.success(t('sessions.batchRevokeSuccess'));
			setSelectedRowKeys([]);
		} catch (err) {
			handleApiError(err, t('sessions.batchRevokeFailed'));
		}
	};

	const getRiskTag = (score: number | undefined) => {
		// 根因修复 (2026-08-13): 列表接口无 risk_score 字段，缺失时显示 '-' 而非误标低风险
		if (score === undefined || score === null) return <span className="text-neutral-600">-</span>;
		if (score >= 80) return <Tag color="error">{t('sessions.riskHigh')}</Tag>;
		if (score >= 50) return <Tag color="warning">{t('sessions.riskMedium')}</Tag>;
		return <Tag color="success">{t('sessions.riskLow')}</Tag>;
	};

	const columns = [
		{
			title: t('sessions.column.sessionId'),
			dataIndex: 'id',
			key: 'id',
			render: (id: string) => <span title={id}>{id.slice(0, 8)}...</span>,
		},
		{
			// 根因修复 (2026-08-13): 后端字段 user_id（无 username），列映射 userId；
			// 展示 user_id（可用时附 username）。
			title: t('sessions.column.user'),
			key: 'user',
			render: (_: any, record: SessionRecord) =>
				record.username ? `${record.username} (${record.userId?.slice(0, 8)}...)` : (record.userId ?? '-'),
		},
		{
			// 根因修复 (2026-08-13): 后端字段 ip，此前读 ipAddress → 恒为 undefined → 显示 '/'
			title: t('sessions.column.ipAddress'),
			dataIndex: 'ip',
			key: 'ip',
			render: (v: string) => v || '-',
		},
		{
			title: t('sessions.column.device'),
			key: 'device',
			render: (_: any, record: SessionRecord) => {
				const device = record.deviceType || record.device;
				const ua = record.userAgent || '';
				// 从 UA 提取浏览器名（简化）
				const browser = record.browser || (/Chrome\//.test(ua) ? 'Chrome' : /Firefox\//.test(ua) ? 'Firefox' : /Safari\//.test(ua) ? 'Safari' : '');
				return <span>{[device, browser].filter(Boolean).join(' / ') || '-'}</span>;
			},
		},
		{
			title: t('sessions.column.location'),
			dataIndex: 'geoip',
			key: 'location',
			render: (v: string) => v || '-',
		},
		{
			title: t('sessions.column.riskScore'),
			dataIndex: 'riskScore',
			key: 'riskScore',
			render: (score: number | undefined) => getRiskTag(score),
		},
		{ title: t('sessions.column.createdAt'), dataIndex: 'createdAt', key: 'createdAt' },
		{ title: t('sessions.column.lastActive'), dataIndex: 'lastActiveAt', key: 'lastActiveAt' },
		{
			title: t('sessions.column.actions'),
			key: 'action',
			render: (_: any, record: SessionRecord) => (
				<Popconfirm title={t('sessions.revokeConfirm')} onConfirm={() => handleDelete(record.id)}>
					<Button type="link" danger size="small">
						{t('sessions.revoke')}
					</Button>
				</Popconfirm>
			),
		},
	];

	const rowSelection = {
		selectedRowKeys,
		onChange: (keys: React.Key[]) => setSelectedRowKeys(keys),
	};

	const riskDistribution = {
		high: (data || []).filter((d: any) => d.riskScore != null && d.riskScore >= 80).length,
		medium: (data || []).filter((d: any) => d.riskScore != null && d.riskScore >= 50 && d.riskScore < 80).length,
		low: (data || []).filter((d: any) => d.riskScore != null && d.riskScore < 50).length,
	};

	return (
		<div>
			<AppPageHeader
				title={t('sessions.title')}
				actions={
					<>
						{selectedRowKeys.length > 0 && (
							<Popconfirm
								title={t('sessions.batchRevokeConfirm', { count: selectedRowKeys.length })}
								onConfirm={handleBatchDelete}
							>
								<Button type="primary" danger icon={<Trash2 size="1em" />}>
									{t('sessions.batchRevoke', { count: selectedRowKeys.length })}
								</Button>
							</Popconfirm>
						)}
					</>
				}
			/>

			<QueryStateFallback
				error={error}
				onRetry={refetch}
				errorMessage={t('sessions.loadError')}
				className="mb-4"
			/>
			<div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
				<Card>
					<div className="text-neutral-600 text-sm">
						{activeCountReady
							? t('sessions.activeCount', { count: activeCount ?? 0 })
							: t('sessions.activeCountLabel')}
					</div>
					<div className="text-2xl font-bold mt-1">{activeCountText}</div>
				</Card>
				<Card>
					<div className="text-neutral-600 text-sm">{t('sessions.highRisk')}</div>
					<div className="text-2xl font-bold mt-1 text-danger-text">{riskDistribution.high}</div>
				</Card>
				<Card>
					<div className="text-neutral-600 text-sm">{t('sessions.mediumRisk')}</div>
					<div className="text-2xl font-bold mt-1 text-warning-text">{riskDistribution.medium}</div>
				</Card>
				<Card>
					<div className="text-neutral-600 text-sm">{t('sessions.lowRisk')}</div>
					<div className="text-2xl font-bold mt-1 text-success-text">{riskDistribution.low}</div>
				</Card>
			</div>

			<DataTable
				rowKey="id"
				rowSelection={rowSelection}
				columns={columns}
				dataSource={data || []}
				loading={isLoading}
				pagination={{ pageSize: 10 }}
				locale={{ emptyText: <Empty description={t('sessions.noData')} /> }}
			/>
		</div>
	);
}
