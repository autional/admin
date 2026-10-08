'use client';

import React, { useEffect, useRef, useState, useMemo } from 'react';
import { Card, Row, Col, Statistic, Skeleton, Tag, Typography, Empty, Segmented } from 'antd';
import { ArrowUp, Eye, Send } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import dayjs from 'dayjs';
import { usePageTitle } from '@autional/shared';
import {
	useNotificationStats,
	useNotificationTrend,
	useNotificationsReadReport,
	type TrendPoint,
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

// A-163：阅读率着色阈值单源（原硬编码两处）+ 零数据中性（原 (0>0.4)=false → 恒失败色标红）
const READ_RATE_THRESHOLD = 0.4;

/** A-163：零值 → 无色；>0 才按阈值着成功/失败色。 */
export function readRateColor(rate?: number) {
	if (!rate) return undefined;
	return rate > READ_RATE_THRESHOLD
		? 'var(--color-success-light)'
		: 'var(--color-error-light)';
}

/** A-163：趋势零填充——后端仅返回有数据日期（notification_repository.go:265-285），
 *  按首末日期逐日补齐缺口（sent/read=0），避免线图跨空日直连的平滑假象。 */
export function zeroFillTrend(points: TrendPoint[]): TrendPoint[] {
	if (!points || points.length === 0) return [];
	const byDate = new Map(points.map((p) => [dayjs(p.date).format('YYYY-MM-DD'), p]));
	const keys = [...byDate.keys()].sort();
	const start = dayjs(keys[0]);
	const end = dayjs(keys[keys.length - 1]);
	const filled: TrendPoint[] = [];
	for (let d = start; !d.isAfter(end, 'day'); d = d.add(1, 'day')) {
		const key = d.format('YYYY-MM-DD');
		const p = byDate.get(key);
		filled.push(p ?? { date: key, sent: 0, read: 0 });
	}
	return filled;
}

const typeColors: Record<string, string> = {
	system: 'blue',
	user: 'green',
	alert: 'red',
	reminder: 'orange',
	promotion: 'purple',
};

export default function NotificationStatsPage() {
	const { t } = useTranslation();
	// A-163：页面标题（与面包屑同源；原 tab 恒默认站名）
	usePageTitle(t('notifications.stats.title'));
	const { data: stats, isLoading, error, refetch } = useNotificationStats();
	const [trendDays, setTrendDays] = useState(30);
	// A-162：trend/readReport 解构 error+refetch（原实现错误被伪装成空态/零值）
	const {
		data: trend = [],
		isLoading: trendLoading,
		error: trendError,
		refetch: refetchTrend,
	} = useNotificationTrend(trendDays);
	const {
		data: readReport = { totalSent: 0, readCount: 0, unreadCount: 0, readRate: 0 },
		isLoading: reportLoading,
		error: reportError,
		refetch: refetchReport,
	} = useNotificationsReadReport();
	const intervalRef = useRef<ReturnType<typeof setInterval>>(undefined);
	// A-163：30s 自动刷新覆盖三查询（原仅 stats 主查询；文案承诺与实际不一致）
	const refetchRef = useRef(refetch);
	refetchRef.current = refetch;
	const refetchTrendRef = useRef(refetchTrend);
	refetchTrendRef.current = refetchTrend;
	const refetchReportRef = useRef(refetchReport);
	refetchReportRef.current = refetchReport;

	useEffect(() => {
		intervalRef.current = setInterval(() => {
			refetchRef.current();
			refetchTrendRef.current();
			refetchReportRef.current();
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
		// A-163：零填充后再成图（单点数据也走该路径，输出恒 1 点）
		return zeroFillTrend(trend).map((p) => {
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
								prefix={<Send size="1em" className="text-info" />}
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
								prefix={<Eye size="1em" className="text-success" />}
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
								prefix={<ArrowUp size="1em" className="text-info" />}
								valueStyle={{ color: readRateColor(stats?.readRate) }}
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
				{/* A-162：错误分支在空态之前（原实现失败被伪装成"暂无趋势数据"） */}
				{trendError ? (
					<PageError
						message={t('notifications.stats.trendLoadFailed')}
						retry={refetchTrend}
					/>
				) : trendLoading ? (
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
				{/* A-162：readReport 错误分支（原实现失败走零值兜底 → 全 0 静默不可辨） */}
				{reportError ? (
					<PageError
						message={t('notifications.stats.reportLoadFailed')}
						retry={refetchReport}
					/>
				) : reportLoading ? (
					<Skeleton active paragraph={{ rows: 4 }} />
				) : (
					// A-163：去重——totalSent/readRate 已在顶部三卡（同源恒同值），本卡仅留已读/未读
					<Row gutter={[16, 16]}>
						<Col xs={24} sm={12}>
							<Statistic
								title={t('notifications.stats.readCount')}
								value={readReport.readCount ?? 0}
								valueStyle={{ color: 'var(--color-success-light)' }}
							/>
						</Col>
						<Col xs={24} sm={12}>
							<Statistic
								title={t('notifications.stats.unreadCount')}
								value={readReport.unreadCount ?? 0}
								valueStyle={{
									color: (readReport.unreadCount ?? 0) > 0 ? 'var(--color-error-light)' : undefined,
								}}
							/>
						</Col>
					</Row>
				)}
			</Card>
		</div>
	);
}
