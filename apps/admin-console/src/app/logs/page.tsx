'use client';

import React, { useState } from 'react';
import { Input, Space, Button, Spin, Empty } from 'antd';
import { ReloadOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '@/lib/query-keys';
import { getMyAuditLogs } from '@/lib/api.generated';
import { fromPageResult, toPageParams } from '@autional/shared';
import { PageError, DataTable } from '@autional/ui/antd';
import { AppPageHeader } from '@autional/ui';

/** /auth/me/audit-logs 行契约（service-identity dto.AuditLogResponse 实读，经拦截器深 camel 化）。 */
interface AuditLogItem {
	id: string;
	action: string;
	status?: string;
	details?: string;
	createdAt: string;
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
		{ title: t('logs.column.action'), dataIndex: 'action', key: 'action' },
		{ title: t('logs.column.target'), dataIndex: 'targetType', key: 'targetType' },
		{ title: t('logs.column.detail'), dataIndex: 'message', key: 'message', ellipsis: true },
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
							<Button icon={<ReloadOutlined />} onClick={() => refetch()}>
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
