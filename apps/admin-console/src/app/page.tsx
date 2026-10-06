'use client';

import React, { useState, useMemo, memo } from 'react';
import { Card, Col, Row, Statistic, Segmented, Tag, Empty, Spin, Skeleton, List } from 'antd';
import {
	TeamOutlined,
	UserAddOutlined,
	SafetyOutlined,
	LoginOutlined,
	FileTextOutlined,
	WarningOutlined,
	KeyOutlined,
	LockOutlined,
} from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { useUsers } from '@/hooks/use-users';
import { useActiveSessions } from '@/hooks/use-users';
import { useRoles } from '@/hooks/use-roles';
import { useAuditStats, useAuditLogs, type AuditLogRecord } from '@/hooks/use-audit-logs';
import { useAnnouncements, type AnnouncementRecord } from '@/hooks/use-announcements';
import { useTenantSummary } from '@/hooks/use-dashboard-summary';
import { PageError } from '@autional/ui/antd';
import { ConsolePageHeader } from '@autional/ui';

const DashboardPage = memo(function DashboardPage() {
	const { t } = useTranslation();
	const [timeRange, setTimeRange] = useState<string>('today');

	const timeRangeParams = useMemo(() => {
		const now = new Date();
		let start: Date;
		switch (timeRange) {
			case 'week':
				start = new Date(now.getTime() - 7 * 86400000);
				break;
			case 'month':
				start = new Date(now.getTime() - 30 * 86400000);
				break;
			default:
				start = new Date(now);
				start.setHours(0, 0, 0, 0);
		}
		return { startDate: start.toISOString(), endDate: now.toISOString() };
	}, [timeRange]);

	const {
		data: usersResult,
		isLoading: usersLoading,
		error: usersError,
		refetch: usersRefetch,
	} = useUsers({ page: 1, pageSize: 200 });
	const users = usersResult?.items ?? [];
	const {
		data: activeSessions = 0,
		isLoading: sessionsLoading,
		error: activeSessionsError,
		refetch: activeSessionsRefetch,
	} = useActiveSessions();
	const {
		data: rolesResult,
		isLoading: rolesLoading,
		error: rolesError,
		refetch: rolesRefetch,
	} = useRoles();
	const { data: auditStats = {}, isLoading: auditLoading } = useAuditStats();
	const {
		data: recentLogins,
		isLoading: logsLoading,
		error: auditLogsError,
		refetch: auditLogsRefetch,
	} = useAuditLogs({ action: 'LOGIN', pageSize: 10, page: 1, ...timeRangeParams });
	const recentLoginItems = recentLogins?.items ?? [];
	const { data: announcements, isLoading: announcementsLoading } = useAnnouncements();
	const summary = useTenantSummary();

	const statsLoading = usersLoading || sessionsLoading || rolesLoading || auditLoading;

	const totalUsers = summary.memberCount;
	// TASK-AB1-18：useRoles 返回 { items, total }（服务端分页结果），总数直接取 total（不再取首页数组长度）。
	const roleCount = rolesResult?.total ?? 0;
	const auditAlerts = auditStats?.alerts ?? auditStats?.pending ?? 0;

	const todayStart = new Date();
	todayStart.setHours(0, 0, 0, 0);
	const newUsers = users.filter((u) => {
		if (!u.createdAt) return false;
		const d = new Date(u.createdAt);
		return d >= todayStart;
	}).length;

	const announcementsData = (announcements?.items ?? []).slice(0, 5);

	const timeRangeOptions = [
		{ label: t('dashboard.timeToday'), value: 'today' },
		{ label: t('dashboard.timeWeek'), value: 'week' },
		{ label: t('dashboard.timeMonth'), value: 'month' },
	];

	return (
		<div>
			<ConsolePageHeader
				title={t('dashboard.title')}
				actions={
					<>
						<Segmented
							options={timeRangeOptions}
							value={timeRange}
							onChange={(v) => setTimeRange(v as string)}
						/>
					</>
				}
			/>

			{usersError && (
				<PageError message={t('dashboard.loadError')} retry={usersRefetch} className="mb-4" />
			)}
			{activeSessionsError && (
				<PageError
					message={t('dashboard.loadError')}
					retry={activeSessionsRefetch}
					className="mb-4"
				/>
			)}
			{rolesError && (
				<PageError message={t('dashboard.loadError')} retry={rolesRefetch} className="mb-4" />
			)}
			{auditLogsError && (
				<PageError message={t('dashboard.loadError')} retry={auditLogsRefetch} className="mb-4" />
			)}

			<Card
				title={t('dashboard.tenantOverview')}
				extra={<span className="text-sm text-neutral-600">{summary.tenantName}</span>}
				className="mb-4"
			>
				<Row gutter={[16, 16]}>
					<Col xs={12} sm={8} md={4}>
						<Statistic
							title={t('dashboard.members')}
							value={summary.memberCount}
							prefix={<TeamOutlined className="text-info" />}
						/>
					</Col>
					<Col xs={12} sm={8} md={4}>
						<Statistic
							title={t('dashboard.roles')}
							value={summary.rolesCount}
							prefix={<SafetyOutlined className="text-warning" />}
						/>
					</Col>
					<Col xs={12} sm={8} md={4}>
						<Statistic
							title={t('dashboard.activeSessions')}
							value={summary.activeSessionsCount}
							prefix={<LoginOutlined className="text-info" />}
						/>
					</Col>
					<Col xs={12} sm={8} md={4}>
						<Statistic
							title={t('dashboard.apiKeys')}
							value={summary.apiKeysCount}
							prefix={<KeyOutlined className="text-purple-500" />}
						/>
					</Col>
					<Col xs={12} sm={8} md={4}>
						<Statistic
							title={t('dashboard.secrets')}
							value={summary.secretsCount}
							prefix={<LockOutlined className="text-danger" />}
						/>
					</Col>
				</Row>
			</Card>

			<Row gutter={[16, 16]}>
				<Col xs={24} sm={12} lg={6}>
					<Card>
						{statsLoading ? (
							<Skeleton active paragraph={{ rows: 0 }} />
						) : (
							<Statistic
								title={t('dashboard.totalUsers')}
								value={totalUsers}
								prefix={<TeamOutlined className="text-info" />}
							/>
						)}
					</Card>
				</Col>
				<Col xs={24} sm={12} lg={6}>
					<Card>
						{statsLoading ? (
							<Skeleton active paragraph={{ rows: 0 }} />
						) : (
							<Statistic
								title={t('dashboard.newToday')}
								value={newUsers}
								prefix={<UserAddOutlined className="text-success" />}
							/>
						)}
					</Card>
				</Col>
				<Col xs={24} sm={12} lg={6}>
					<Card>
						{statsLoading ? (
							<Skeleton active paragraph={{ rows: 0 }} />
						) : (
							<Statistic
								title={t('dashboard.activeSessions')}
								value={activeSessions}
								prefix={<LoginOutlined className="text-info" />}
							/>
						)}
					</Card>
				</Col>
				<Col xs={24} sm={12} lg={6}>
					<Card>
						{statsLoading ? (
							<Skeleton active paragraph={{ rows: 0 }} />
						) : (
							<Statistic
								title={t('dashboard.roleCount')}
								value={roleCount}
								prefix={<SafetyOutlined className="text-warning" />}
							/>
						)}
					</Card>
				</Col>
			</Row>

			<Row gutter={[16, 16]} className="mt-4">
				<Col xs={24} sm={12} lg={6}>
					<Card>
						{statsLoading ? (
							<Skeleton active paragraph={{ rows: 0 }} />
						) : (
							<Statistic
								title={t('dashboard.pendingAlerts')}
								value={auditAlerts}
								prefix={<WarningOutlined className="text-danger" />}
							/>
						)}
					</Card>
				</Col>
			</Row>

			<Row gutter={[16, 16]} className="mt-6">
				<Col xs={24} lg={12}>
					<Card title={t('dashboard.recentLogins')} className="h-full">
						{logsLoading ? (
							<div className="py-8 flex justify-center">
								<Spin />
							</div>
						) : recentLoginItems.length === 0 ? (
							<Empty description={t('dashboard.noLogins')} />
						) : (
							<List
								size="small"
								dataSource={recentLoginItems}
								renderItem={(item: AuditLogRecord) => (
									<List.Item className="flex justify-between">
										<div className="flex items-center gap-2">
											<span className="font-medium text-sm">
												{item.operatorId || t('dashboard.unknownUser')}
											</span>
											<Tag color={item.status === 200 ? 'success' : 'error'}>
												{item.status === 200
													? t('dashboard.loginSuccess')
													: t('dashboard.loginFailure')}
											</Tag>
										</div>
										<div className="text-xs text-neutral-600">
											<span className="mr-2">{item.ip || '-'}</span>
											<span>
												{item.timestamp ? new Date(item.timestamp).toLocaleString('zh-CN') : '-'}
											</span>
										</div>
									</List.Item>
								)}
							/>
						)}
					</Card>
				</Col>
				<Col xs={24} lg={12}>
					<Card title={t('dashboard.announcements')} className="h-full">
						{announcementsLoading ? (
							<div className="py-8 flex justify-center">
								<Spin />
							</div>
						) : announcementsData.length === 0 ? (
							<Empty description={t('dashboard.noAnnouncements')} />
						) : (
							<div className="space-y-2">
								{announcementsData.map((item: AnnouncementRecord, i: number) => (
									<div key={i} className="flex justify-between items-center py-1">
										<div className="flex items-center gap-2">
											<FileTextOutlined className="text-neutral-500" />
											<span className="text-sm">{item.title}</span>
										</div>
										<span className="text-xs text-neutral-600">
											{item.publishAt
												? new Date(item.publishAt).toLocaleDateString('zh-CN')
												: '-'}
										</span>
									</div>
								))}
							</div>
						)}
					</Card>
				</Col>
			</Row>
		</div>
	);
});
export default DashboardPage;
