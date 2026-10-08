'use client';

import React, { useState } from 'react';
import { Input, Space, Button, Spin, Empty } from 'antd';
import { RefreshCw } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '@/lib/query-keys';
import { getMyAuditLogs } from '@/lib/api.generated';
import { fromPageResult, toPageParams } from '@autional/shared';
import { PageError, DataTable } from '@autional/ui/antd';
import { AppPageHeader, StatusBadge } from '@autional/ui';

/** /auth/me/audit-logs 行契约（service-identity dto.AuditLogResponse 实读，经拦截器深 camel 化）。 */
interface AuditLogItem {
	id: string;
	action: string;
	status?: string;
	resource?: string;
	resourceId?: string;
	ip?: string;
	userAgent?: string;
	details?: string;
	createdAt: string;
}

/**
 * A-69：action 归一单点 —— 沿用审计端点三种命名风格（LOGIN / admin_list / auth.login_success）。
 * 去点号前缀 + 小写后查 logs.action.* 键；未收录动作回退原值（不伪造翻译）。
 */
function normalizeAction(action: string): string {
	const last = action.includes('.') ? action.slice(action.lastIndexOf('.') + 1) : action;
	return last.toLowerCase();
}

export default function LogsPage() {
	const { t } = useTranslation();
	// TASK-AB1-19 / A-66：服务端分页单点驱动——toPageParams 发 page/page_size，
	// total 由列表结果（fromPageResult 归一）直接取，删除前端本地假分页。
	const [page, setPage] = useState(1);
	const pageSize = 10;
	const [keyword, setKeyword] = useState<string | undefined>();

	const queryParams = { ...toPageParams({ page, pageSize }), ...(keyword ? { keyword } : {}) };
	const { data, isLoading, error, refetch } = useQuery({
		queryKey: queryKeys.myAuditLogs.all({ page, pageSize, keyword }),
		queryFn: async () => fromPageResult<AuditLogItem>(await getMyAuditLogs(queryParams)),
	});
	const logs = data?.items ?? [];
	const total = data?.total ?? 0;

	const columns = [
		{
			title: t('logs.column.time'),
			dataIndex: 'createdAt',
			key: 'createdAt',
			render: (v: string) => (v ? new Date(v).toLocaleString() : '-'),
		},
		{
			// A-69：action i18n（归一后查键，未收录回退原值）
			title: t('logs.column.action'),
			dataIndex: 'action',
			key: 'action',
			render: (v: string) =>
				v ? t(`logs.action.${normalizeAction(v)}`, { defaultValue: v }) : '-',
		},
		{
			// A-69：status 语义字符串（success/failed/空=未知）徽标化
			title: t('common.status'),
			dataIndex: 'status',
			key: 'status',
			render: (v?: string) =>
				v === 'success' ? (
					<StatusBadge variant="success">{t('logs.status.success')}</StatusBadge>
				) : v === 'failed' ? (
					<StatusBadge variant="danger">{t('logs.status.failed')}</StatusBadge>
				) : (
					'-'
				),
		},
		// A-69：以下四列对齐 dto.AuditLogResponse 实读键（resource/resource_id/ip/user_agent）——
		// 旧列 targetType/message 恒空（wire 键实为 resource/details，A-65 遗留同源修正）。
		{ title: t('logs.column.target'), dataIndex: 'resource', key: 'resource' },
		{
			title: t('logs.column.targetId'),
			dataIndex: 'resourceId',
			key: 'resourceId',
			render: (v?: string) => v || '-',
		},
		{ title: t('logs.column.ip'), dataIndex: 'ip', key: 'ip', render: (v?: string) => v || '-' },
		{
			title: t('logs.column.userAgent'),
			dataIndex: 'userAgent',
			key: 'userAgent',
			ellipsis: true,
			render: (v?: string) => v || '-',
		},
		{ title: t('logs.column.detail'), dataIndex: 'details', key: 'details', ellipsis: true },
	];

	return (
		<div>
			<AppPageHeader
				title={t('logs.title')}
				actions={
					<>
						<Space>
							<Input.Search
								placeholder={t('logs.search')}
								onSearch={(v) => setKeyword(v || undefined)}
								style={{ width: 240 }}
							/>
							<Button icon={<RefreshCw size="1em" />} onClick={() => refetch()}>
								{t('common.refresh')}
							</Button>
						</Space>
					</>
				}
			/>

			{error && <PageError message={t('logs.loadError')} retry={refetch} className="mb-4" />}

			{isLoading ? (
				<Spin className="flex justify-center py-12" />
			) : logs.length === 0 ? (
				<Empty description={t('logs.noData')} />
			) : (
				<DataTable
					rowKey="id"
					columns={columns}
					dataSource={logs}
					pagination={{
						current: page,
						pageSize,
						total,
						onChange: (p) => setPage(p),
						showSizeChanger: false,
					}}
					scroll={{ x: 800 }}
				/>
			)}
		</div>
	);
}
