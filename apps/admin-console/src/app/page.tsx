'use client';

import React, { useState, useMemo, memo } from 'react';
import { Card, Col, Row, Statistic, Segmented, Tag, Empty, Spin, Skeleton, List } from 'antd';
import {
	AlertTriangle,
	FileText,
	KeyRound,
	Lock,
	LogIn,
	ShieldCheck,
	UserPlus,
	Users,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import dayjs from 'dayjs';
import { useUsers } from '@/hooks/use-users';
import { useActiveSessions } from '@/hooks/use-users';
import { useRoles } from '@/hooks/use-roles';
import { useAuditLogs, type AuditLogRecord } from '@/hooks/use-audit-logs';
import { useAlerts } from '@/hooks/use-audit-alerts';
import { useAnnouncements, type AnnouncementRecord } from '@/hooks/use-announcements';
import { useTenantSummary } from '@/hooks/use-dashboard-summary';
import { classifyQueryState, type QueryState } from '@autional/shared';
import { AppPageHeader } from '@autional/ui';
import { QueryStateFallback } from '@/components/common/QueryStateFallback';

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
		// F2-04②（RC-B4-02）：audit 只认 start_date/end_date（YYYY-MM-DD）；ISO 串会 60100001 被 400。
		return {
			start_date: dayjs(start).format('YYYY-MM-DD'),
			end_date: dayjs(now).format('YYYY-MM-DD'),
		};
	}, [timeRange]);

	// F2-04①（RC-B4-02）：page_size 上限 100（service-core/base/dto/page.go:45），200 直接 400 → 50（ADM-009 先例）。
	const {
		data: usersResult,
		isLoading: usersLoading,
		error: usersError,
		refetch: usersRefetch,
	} = useUsers({ page: 1, pageSize: 50 });
	const users = usersResult?.items ?? [];
	// RC-B4-01：不做 `= 0` 默认——error 时该值恒 0 即「假 0」；状态判定走 classifyQueryState。
	const {
		data: activeSessions,
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
	// F2（批 5 补修）：原读 auditStats.alerts/pending 为幻影契约（后端 stats 无此字段，恒 undefined→假 0）；
	// 真实源 = 告警列表 status=open 的 total（service-audit ListAlerts → NewListResponse total）。
	const {
		data: alertsResult,
		isLoading: alertsLoading,
		error: alertsError,
	} = useAlerts({ status: 'open', page: 1, page_size: 1 });
	const {
		data: recentLogins,
		isLoading: logsLoading,
		error: auditLogsError,
		refetch: auditLogsRefetch,
	} = useAuditLogs({ action: 'LOGIN', page_size: 10, page: 1, ...timeRangeParams });
	const recentLoginItems = recentLogins?.items ?? [];
	const {
		data: announcements,
		isLoading: announcementsLoading,
		error: announcementsError,
	} = useAnnouncements();
	const summary = useTenantSummary();

	// 六查询逐个分类（AC-B4-W1-01-3；硬序 forbidden > error > loading > empty > ready）。
	const usersState = classifyQueryState({
		isLoading: usersLoading,
		error: usersError,
		data: usersResult,
	});
	const sessionsState = classifyQueryState({
		isLoading: sessionsLoading,
		error: activeSessionsError,
		data: activeSessions,
	});
	const rolesState = classifyQueryState({ isLoading: rolesLoading, error: rolesError, data: rolesResult });
	const alertsState = classifyQueryState({
		isLoading: alertsLoading,
		error: alertsError,
		data: alertsResult,
	});
	const logsState = classifyQueryState({
		isLoading: logsLoading,
		error: auditLogsError,
		data: recentLoginItems,
	});
	const announcementsData = (announcements?.items ?? []).slice(0, 5);
	const announcementsState = classifyQueryState({
		isLoading: announcementsLoading,
		error: announcementsError,
		data: announcementsData,
	});

	/** forbidden/error 的卡级文案；loading/empty/ready 返回 null（由 Skeleton/Empty/数值原位承担）。 */
	const stateText = (state: QueryState): string | null =>
		state === 'forbidden' ? t('common.forbidden') : state === 'error' ? t('common.loadError') : null;

	const totalUsers = summary.memberCount;
	// TASK-AB1-18：useRoles 返回 { items, total }（服务端分页结果）；error/forbidden 时 total 为 undefined，
	// 由 stateText 覆盖显示，杜绝 error → 0（假 0）。
	const roleCount = rolesResult?.total;
	const roleStatValue = stateText(rolesState) ?? roleCount ?? summary.rolesCount ?? (rolesState === 'loading' ? '…' : 0);
	const openAlertsCount = alertsResult?.pagination?.total;

	const todayStart = new Date();
	todayStart.setHours(0, 0, 0, 0);
	const newUsers = users.filter((u) => {
		if (!u.createdAt) return false;
		const d = new Date(u.createdAt);
		return d >= todayStart;
	}).length;

	const timeRangeOptions = [
		{ label: t('dashboard.timeToday'), value: 'today' },
		{ label: t('dashboard.timeWeek'), value: 'week' },
		{ label: t('dashboard.timeMonth'), value: 'month' },
	];

	return (
		<div>
			<AppPageHeader
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

			{/* 四来源错误横幅：文案含来源；403 走无权限（无 retry）；retry 仅 isRetryableError（AC-B4-W1-01-3）。 */}
			<QueryStateFallback
				error={usersError}
				onRetry={usersRefetch}
				errorMessage={t('dashboard.loadErrorUsers')}
				className="mb-4"
			/>
			<QueryStateFallback
				error={activeSessionsError}
				onRetry={activeSessionsRefetch}
				errorMessage={t('dashboard.loadErrorSessions')}
				className="mb-4"
			/>
			<QueryStateFallback
				error={rolesError}
				onRetry={rolesRefetch}
				errorMessage={t('dashboard.loadErrorRoles')}
				className="mb-4"
			/>
			<QueryStateFallback
				error={auditLogsError}
				onRetry={auditLogsRefetch}
				errorMessage={t('dashboard.loadErrorLogins')}
				className="mb-4"
			/>

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
							prefix={<Users size="1em" className="text-info" />}
						/>
					</Col>
					<Col xs={12} sm={8} md={4}>
						{/* AC-B4-W1-01-1：roles 403 呈「无权限」不显 0（无 retry）。 */}
						<Statistic
							title={t('dashboard.roles')}
							value={roleStatValue}
							prefix={<ShieldCheck size="1em" className="text-warning" />}
						/>
					</Col>
					<Col xs={12} sm={8} md={4}>
						<Statistic
							title={t('dashboard.activeSessions')}
							value={summary.activeSessionsCount}
							prefix={<LogIn size="1em" className="text-info" />}
						/>
					</Col>
					<Col xs={12} sm={8} md={4}>
						<Statistic
							title={t('dashboard.apiKeys')}
							value={summary.apiKeysCount}
							prefix={<KeyRound size="1em" className="text-chart-7" />}
						/>
					</Col>
					<Col xs={12} sm={8} md={4}>
						{/* W2-03（U426）：secrets 403/未就绪呈态不显 0（按 roles 模式三态）。 */}
						<Statistic
							title={t('dashboard.secrets')}
							value={
								stateText(summary.secretsState) ??
								summary.secretsCount ??
								(summary.secretsState === 'loading' ? '…' : 0)
							}
							prefix={<Lock size="1em" className="text-danger" />}
						/>
					</Col>
				</Row>
			</Card>

			<Row gutter={[16, 16]}>
				<Col xs={24} sm={12} lg={6}>
					<Card>
						{usersState === 'loading' ? (
							<Skeleton active paragraph={{ rows: 0 }} />
						) : (
							<Statistic
								title={t('dashboard.totalUsers')}
								value={stateText(usersState) ?? totalUsers}
								prefix={<Users size="1em" className="text-info" />}
							/>
						)}
					</Card>
				</Col>
				<Col xs={24} sm={12} lg={6}>
					<Card>
						{usersState === 'loading' ? (
							<Skeleton active paragraph={{ rows: 0 }} />
						) : (
							<Statistic
								title={t('dashboard.newToday')}
								value={stateText(usersState) ?? newUsers}
								prefix={<UserPlus size="1em" className="text-success" />}
							/>
						)}
					</Card>
				</Col>
				<Col xs={24} sm={12} lg={6}>
					<Card>
						{sessionsState === 'loading' ? (
							<Skeleton active paragraph={{ rows: 0 }} />
						) : (
							<Statistic
								title={t('dashboard.activeSessions')}
								value={stateText(sessionsState) ?? activeSessions ?? 0}
								prefix={<LogIn size="1em" className="text-info" />}
							/>
						)}
					</Card>
				</Col>
				<Col xs={24} sm={12} lg={6}>
					<Card>
						{rolesState === 'loading' ? (
							<Skeleton active paragraph={{ rows: 0 }} />
						) : (
							<Statistic
								title={t('dashboard.roleCount')}
								value={stateText(rolesState) ?? roleCount ?? 0}
								prefix={<ShieldCheck size="1em" className="text-warning" />}
							/>
						)}
					</Card>
				</Col>
			</Row>

			<Row gutter={[16, 16]} className="mt-4">
				<Col xs={24} sm={12} lg={6}>
					<Card>
						{alertsState === 'loading' ? (
							<Skeleton active paragraph={{ rows: 0 }} />
						) : (
							<Statistic
								title={t('dashboard.pendingAlerts')}
								value={stateText(alertsState) ?? openAlertsCount ?? 0}
								prefix={<AlertTriangle size="1em" className="text-danger" />}
							/>
						)}
					</Card>
				</Col>
			</Row>

			<Row gutter={[16, 16]} className="mt-6">
				<Col xs={24} lg={12}>
					<Card title={t('dashboard.recentLogins')} className="h-full">
						{logsState === 'loading' ? (
							<div className="py-8 flex justify-center">
								<Spin />
							</div>
						) : stateText(logsState) ? (
							/* error 绝不回落「暂无登录记录」（修伪空态；AC-B4-W1-01-3）。 */
							<Empty description={stateText(logsState)} />
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
						{announcementsState === 'loading' ? (
							<div className="py-8 flex justify-center">
								<Spin />
							</div>
						) : stateText(announcementsState) ? (
							/* 403/失败成态 ≠「暂无公告」；真空数组才空态（AC-B4-W1-01-2）。 */
							<Empty description={stateText(announcementsState)} />
						) : announcementsData.length === 0 ? (
							<Empty description={t('dashboard.noAnnouncements')} />
						) : (
							<div className="space-y-2">
								{announcementsData.map((item: AnnouncementRecord, i: number) => (
									<div key={i} className="flex justify-between items-center py-1">
										<div className="flex items-center gap-2">
											<FileText size="1em" className="text-neutral-500" />
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
