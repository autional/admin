'use client';

import React, { useState } from 'react';
import { useCurrentTenantIdOr, classifyQueryState, type QueryState } from '@autional/shared';
import { Card, Row, Col, Statistic, Select, Spin, Empty } from 'antd';
import { BarChart3 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { getUsageTimeline, getUsageEndpoints } from '@/lib/api.generated';

import { DataTable } from '@autional/ui/antd';
import { AppPageHeader } from '@autional/ui';
import { QueryStateFallback } from '@/components/common/QueryStateFallback';

export default function UsagePage() {
	const { t } = useTranslation();
	const [days, setDays] = useState<number>(7);
	// ADM-008: 用量端点需要 tenantId 路径参数（billing-service router.go 确认）
	const tenantId = useCurrentTenantIdOr('');

	const {
		data: timeline,
		isLoading: tlLoading,
		error: tlError,
		refetch: refetchTimeline,
	} = useQuery({
		queryKey: ['usage', 'timeline', days],
		queryFn: async () => {
			// ADM-008: 需带 tenant_id；U316：改接 admin 面（user 面在 admin 平面被入口平面门禁拒 403）
			const res = await getUsageTimeline(tenantId, { days });
			return res;
		},
	});

	// A-57（RC-B4-02）：端点分布随时间窗变化 —— 必须带 days 且 queryKey 含 days（此前漏参 → 切窗不更新）。
	const {
		data: endpoints,
		isLoading: epLoading,
		error: epError,
		refetch: refetchEndpoints,
	} = useQuery({
		queryKey: ['usage', 'endpoints', days],
		queryFn: async () => {
			const res = await getUsageEndpoints(tenantId, { days });
			return res;
		},
	});

	// RC-B4-02（A-55，命名包裹键）：billing timeline/endpoints 的 payload 在 `.timeline` / `.endpoints`
	//（billing service 响应形状），extractList 只认 items/data —— 此处显式取命名键（防误用 extractList）。
	const timelineData = Array.isArray(timeline) ? timeline : ((timeline as any)?.timeline ?? []);
	const endpointData = Array.isArray(endpoints) ? endpoints : ((endpoints as any)?.endpoints ?? []);

	const timelineState = classifyQueryState({ isLoading: tlLoading, error: tlError, data: timelineData });
	const endpointsState = classifyQueryState({ isLoading: epLoading, error: epError, data: endpointData });
	/** forbidden/error 的成态文案；loading/empty/ready → null（由 Spin/Empty/表格原位承担）。 */
	const stateText = (state: QueryState): string | null =>
		state === 'forbidden' ? t('common.forbidden') : state === 'error' ? t('common.loadError') : null;

	const timelineColumns = [
		{ title: t('usage.column.date'), dataIndex: 'date', key: 'date' },
		// A-55：wire 键 = api_requests（此前 'count' 为死键 → 列恒空）。
		{ title: t('usage.column.requests'), dataIndex: 'apiRequests', key: 'apiRequests' },
	];

	const endpointColumns = [
		{ title: t('usage.column.endpoint'), dataIndex: 'endpoint', key: 'endpoint' },
		// A-55：wire 键 = request_count（此前 'count' 为死键）。
		{ title: t('usage.column.calls'), dataIndex: 'requestCount', key: 'requestCount' },
	];

	return (
		<div>
			<AppPageHeader
				title={t('usage.title')}
				actions={
					<>
						<Select value={days} onChange={setDays} style={{ width: 120 }}>
							<Select.Option value={7}>{t('usage.last7Days')}</Select.Option>
							<Select.Option value={30}>{t('usage.last30Days')}</Select.Option>
							<Select.Option value={90}>{t('usage.last90Days')}</Select.Option>
						</Select>
					</>
				}
			/>

			<QueryStateFallback
				error={tlError}
				onRetry={refetchTimeline}
				errorMessage={t('usage.loadError')}
				className="mb-4"
			/>
			<QueryStateFallback
				error={epError}
				onRetry={refetchEndpoints}
				errorMessage={t('usage.loadEndpointsError')}
				className="mb-4"
			/>

			<Row gutter={[16, 16]} className="mb-6">
				<Col span={8}>
					<Card>
						<Statistic
							title={t('usage.totalRequests')}
							// A-55：总请求 = sum(api_requests)（此前 'count' 死键 → 恒 0）；error 时不显假 0。
							value={
								stateText(timelineState) ??
								timelineData.reduce((s: number, r: any) => s + (r.apiRequests || 0), 0)
							}
							prefix={<BarChart3 size="1em" />}
						/>
					</Card>
				</Col>
			</Row>

			<Card title={t('usage.timeline')} className="mb-6">
				{timelineState === 'loading' ? (
					<Spin className="flex justify-center py-12" />
				) : stateText(timelineState) ? (
					/* error 绝不回落「暂无数据」（伪空态根因锁）。 */
					<Empty description={stateText(timelineState)} />
				) : timelineData.length === 0 ? (
					<Empty description={t('usage.noData')} />
				) : (
					<DataTable
						rowKey="date"
						columns={timelineColumns}
						dataSource={timelineData}
						pagination={false}
						scroll={{ x: 600 }}
					/>
				)}
			</Card>

			<Card title={t('usage.topEndpoints')}>
				{endpointsState === 'loading' ? (
					<Spin className="flex justify-center py-12" />
				) : stateText(endpointsState) ? (
					<Empty description={stateText(endpointsState)} />
				) : endpointData.length === 0 ? (
					<Empty description={t('usage.noData')} />
				) : (
					<DataTable
						rowKey="endpoint"
						columns={endpointColumns}
						dataSource={endpointData}
						pagination={{ pageSize: 10 }}
						scroll={{ x: 600 }}
					/>
				)}
			</Card>
		</div>
	);
}
