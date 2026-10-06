'use client';

import React, { useEffect, useRef, useState, useMemo } from 'react';
import { Card, Row, Col, Statistic, Skeleton, Tag, Typography, Empty, Segmented } from 'antd';
import { ArrowUpOutlined, BellOutlined, EyeOutlined, SendOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import {
	useNotificationStats,
	useNotificationTrend,
	useNotificationsReadReport,
} from '@/hooks/use-notifications';
import { PageError, DataTable } from '@autional/ui/antd';
import {
	LineChart,
	Line,
	XAxis,
	YAxis,
	CartesianGrid,
	Tooltip,
	ResponsiveContainer,
	Legend,
} from 'recharts';

const { Title } = Typography;

const typeColors: Record<string, string> = {
	system: 'blue',
	user: 'green',
	alert: 'red',
	reminder: 'orange',
	promotion: 'purple',
};

export default function NotificationStatsPage() {
	const { t } = useTranslation();
	const { data: stats, isLoading, error, refetch } = useNotificationStats();
	const [trendDays, setTrendDays] = useState(30);
	const { data: trend = [], isLoading: trendLoading } = useNotificationTrend(trendDays);
	const { data: readReport = { totalSent: 0, readCount: 0, unreadCount: 0, readRate: 0 } } =
		useNotificationsReadReport();
	const intervalRef = useRef<ReturnType<typeof setInterval>>(undefined);
	const refetchRef = useRef(refetch);
	refetchRef.current = refetch;

	useEffect(() => {
		intervalRef.current = setInterval(() => {
			refetchRef.current();
		}, 30000);
		return () => clearInterval(intervalRef.current);
	}, []);

	const typeLabels: Record<string, string> = {
		system: t('notifications.stats.type.system'),
		user: t('notifications.stats.type.user'),
		alert: t('notifications.stats.type.alert'),
		reminder: t('notifications.stats.type.reminder'),
		promotion: t('notifications.stats.type.promotion'),
	};

	const byTypeData = useMemo(() => {
		if (!stats?.byType) return [];
		return Object.entries(stats.byType).map(([type, count]) => ({
			key: type,
			type: typeLabels[type] || type,
			count,
			color: typeColors[type] || 'default',
		}));
	}, [stats?.byType, typeLabels]);

	const chartData = useMemo(() => {
		if (!trend || trend.length === 0) return [];
		return trend.map((p) => {
			const d = new Date(p.date);
			return {
				date: `${d.getMonth() + 1}/${d.getDate()}`,
				Sent: p.sent,
				Read: p.read,
			};
		});
	}, [trend]);

	return (
		<div>
			<div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 mb-6">
				<Title level={4} className="!mb-0">
					{t('notifications.stats.title')}
				</Title>
				<span className="text-neutral-600 text-xs">{t('notifications.stats.autoRefresh')}</span>
			</div>

			{error && (
				<PageError message={t('notifications.stats.loadError')} retry={refetch} className="mb-4" />
			)}

			<Row gutter={[16, 16]}>
				<Col xs={24} sm={8}>
					<Card>
						{isLoading ? (
							<Skeleton active paragraph={{ rows: 0 }} />
						) : (
							<Statistic
								title={t('notifications.stats.totalSent')}
								value={stats?.totalSent ?? 0}
								prefix={<SendOutlined className="text-info" />}
							/>
						)}
					</Card>
				</Col>
				<Col xs={24} sm={8}>
					<Card>
						{isLoading ? (
							<Skeleton active paragraph={{ rows: 0 }} />
						) : (
							<Statistic
								title={t('notifications.stats.totalRead')}
								value={stats?.totalRead ?? 0}
								prefix={<EyeOutlined className="text-success" />}
							/>
						)}
					</Card>
				</Col>
				<Col xs={24} sm={8}>
					<Card>
						{isLoading ? (
							<Skeleton active paragraph={{ rows: 0 }} />
						) : (
							<Statistic
								title={t('notifications.stats.readRate')}
								value={stats?.readRate ? Math.round(stats.readRate * 10000) / 100 : 0}
								suffix="%"
								precision={1}
								prefix={<ArrowUpOutlined className="text-info" />}
								valueStyle={{
									color:
										(stats?.readRate ?? 0) > 0.4
											? 'var(--color-success-light)'
											: 'var(--color-error-light)',
								}}
							/>
						)}
					</Card>
				</Col>
			</Row>

			<Card
				title={t('notifications.stats.sendReadTrend')}
				extra={
					<Segmented
						size="small"
						value={trendDays.toString()}
						onChange={(v) => setTrendDays(Number(v))}
						options={[
							{ label: t('notifications.stats.days7'), value: '7' },
							{ label: t('notifications.stats.days30'), value: '30' },
							{ label: t('notifications.stats.days90'), value: '90' },
						]}
					/>
				}
				className="mt-6"
			>
				{trendLoading ? (
					<Skeleton active paragraph={{ rows: 6 }} />
				) : chartData.length === 0 ? (
					<Empty description={t('notifications.stats.noTrendData')} />
				) : (
					<ResponsiveContainer width="100%" height={300}>
						<LineChart data={chartData}>
							<CartesianGrid strokeDasharray="3 3" />
							<XAxis dataKey="date" tick={{ fontSize: 12 }} />
							<YAxis tick={{ fontSize: 12 }} />
							<Tooltip />
							<Legend />
							<Line
								type="monotone"
								dataKey="Sent"
								stroke="var(--color-chart-1)"
								strokeWidth={2}
								dot={false}
							/>
							<Line
								type="monotone"
								dataKey="Read"
								stroke="var(--color-chart-2)"
								strokeWidth={2}
								dot={false}
							/>
						</LineChart>
					</ResponsiveContainer>
				)}
			</Card>

			<Card title={t('notifications.stats.byType')} className="mt-6">
				{isLoading ? (
					<Skeleton active paragraph={{ rows: 4 }} />
				) : (
					<DataTable
						dataSource={byTypeData}
						pagination={false}
						size="small"
						scroll={{ x: 800 }}
						columns={[
							{
								title: t('notifications.stats.notificationType'),
								dataIndex: 'type',
								key: 'type',
								render: (text: string, record: { color: string }) => (
									<Tag color={record.color}>{text}</Tag>
								),
							},
							{
								title: t('notifications.stats.sentCount'),
								dataIndex: 'count',
								key: 'count',
								render: (val: number) => val.toLocaleString(),
							},
						]}
					/>
				)}
			</Card>

			<Card title={t('notifications.stats.readReport')} className="mt-6">
				{isLoading ? (
					<Skeleton active paragraph={{ rows: 4 }} />
				) : (
					<Row gutter={[16, 16]}>
						<Col xs={24} sm={6}>
							<Statistic
								title={t('notifications.stats.totalSent')}
								value={readReport.totalSent ?? 0}
							/>
						</Col>
						<Col xs={24} sm={6}>
							<Statistic
								title={t('notifications.stats.readCount')}
								value={readReport.readCount ?? 0}
								valueStyle={{ color: 'var(--color-success-light)' }}
							/>
						</Col>
						<Col xs={24} sm={6}>
							<Statistic
								title={t('notifications.stats.unreadCount')}
								value={readReport.unreadCount ?? 0}
								valueStyle={{
									color: (readReport.unreadCount ?? 0) > 0 ? 'var(--color-error-light)' : undefined,
								}}
							/>
						</Col>
						<Col xs={24} sm={6}>
							<Statistic
								title={t('notifications.stats.readRate')}
								value={readReport.readRate ? Math.round(readReport.readRate * 10000) / 100 : 0}
								suffix="%"
								precision={1}
								valueStyle={{
									color:
										(readReport.readRate ?? 0) > 0.4
											? 'var(--color-success-light)'
											: 'var(--color-error-light)',
								}}
							/>
						</Col>
					</Row>
				)}
			</Card>
		</div>
	);
}
