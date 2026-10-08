'use client';

import React from 'react';
import { Card, Row, Col, Statistic, Spin, Empty, Button } from 'antd';
import { CheckCircle2, RefreshCw, XCircle } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { statusOverview } from '@autional/shared/generated/api';
import { PageError } from '@autional/ui/antd';
import { AppPageHeader } from '@autional/ui';

/**
 * GET /status/overview 实读契约（service-status dto.OverviewResponse，DataResponse 信封经
 * 响应拦截器解包 + 深 camel 化后的形状）。
 */
interface StatusOverview {
	overallStatus: string;
	servicesTotal: number;
	servicesHealthy: number;
	activeIncidents: number;
	lastUpdated: string;
}

export default function StatusPage() {
	const { t } = useTranslation();

	// TASK-AB1-19 / A-63：端点返回汇总对象（overall_status/services_total/services_healthy/
	// active_incidents/last_updated），按实读字段重写卡片绑定，删除按列表数组双解包的兼容分支。
	const { data, isLoading, error, refetch } = useQuery({
		queryKey: ['status-overview'],
		queryFn: async () => (await statusOverview()) as StatusOverview,
	});

	const overallText =
		data?.overallStatus === 'operational'
			? t('status.operational')
			: data?.overallStatus === 'degraded'
				? t('status.degraded')
				: t('status.noData');

	return (
		<div>
			<AppPageHeader
				title={t('status.title')}
				actions={
					<>
						<Button icon={<RefreshCw size="1em" />} onClick={() => refetch()}>
							{t('common.refresh')}
						</Button>
					</>
				}
			/>

			{error && <PageError message={t('status.loadError')} retry={refetch} className="mb-4" />}

			{isLoading ? (
				<Spin className="flex justify-center py-12" />
			) : !data ? (
				<Empty description={t('status.noData')} />
			) : (
				<Row gutter={[16, 16]}>
					<Col xs={24} sm={12} lg={6}>
						<Card>
							<Statistic
								title={t('status.overall')}
								value={overallText}
								prefix={
									data.overallStatus === 'operational' ? (
										<CheckCircle2 size="1em" style={{ color: 'var(--color-success)' }} />
									) : (
										<XCircle size="1em" style={{ color: 'var(--color-danger)' }} />
									)
								}
							/>
						</Card>
					</Col>
					<Col xs={24} sm={12} lg={6}>
						<Card>
							<Statistic
								title={t('status.servicesHealthy')}
								value={`${data.servicesHealthy} / ${data.servicesTotal}`}
							/>
						</Card>
					</Col>
					<Col xs={24} sm={12} lg={6}>
						<Card>
							<Statistic title={t('status.activeIncidents')} value={data.activeIncidents} />
						</Card>
					</Col>
					<Col xs={24} sm={12} lg={6}>
						<Card>
							<Statistic
								title={t('status.lastUpdated')}
								value={data.lastUpdated}
								styles={{ content: { fontSize: 16 } }}
							/>
						</Card>
					</Col>
				</Row>
			)}
		</div>
	);
}
