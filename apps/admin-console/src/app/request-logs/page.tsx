'use client';

import React, { useState } from 'react';
import { Button, Spin, Empty } from 'antd';
import { RefreshCw } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '@/lib/query-keys';
import { getMyAuditLogs } from '@/lib/api.generated';
import { PageError, DataTable } from '@autional/ui/antd';
import { AppPageHeader } from '@autional/ui';

export default function RequestLogsPage() {
	const { t } = useTranslation();
	const [params, setParams] = useState<Record<string, unknown>>({});

	const { data, isLoading, error, refetch } = useQuery({
		queryKey: queryKeys.myAuditLogs.all(params),
		queryFn: () => getMyAuditLogs(params),
	});

	// ADM-005: apiClient 已把 { code, items } unwrap 成 { items, total }（无 data 字段），
	// 取 items 而非 data
	const logs = Array.isArray(data) ? data : ((data as any)?.items ?? []);

	const columns = [
		{
			title: t('requestLogs.column.time'),
			dataIndex: 'createdAt',
			key: 'createdAt',
			render: (v: string) => (v ? new Date(v).toLocaleString() : '-'),
		},
		{ title: t('requestLogs.column.method'), dataIndex: 'action', key: 'action' },
		{ title: t('requestLogs.column.path'), dataIndex: 'targetType', key: 'targetType' },
		{ title: t('requestLogs.column.status'), dataIndex: 'status', key: 'status' },
		{ title: t('requestLogs.column.detail'), dataIndex: 'message', key: 'message', ellipsis: true },
	];

	return (
		<div>
			<AppPageHeader
				title={t('requestLogs.title')}
				actions={
					<>
						<Button icon={<RefreshCw size="1em" />} onClick={() => refetch()}>
							{t('common.refresh')}
						</Button>
					</>
				}
			/>

			{error && <PageError message={t('requestLogs.loadError')} retry={refetch} className="mb-4" />}

			{isLoading ? (
				<Spin className="flex justify-center py-12" />
			) : logs.length === 0 ? (
				<Empty description={t('requestLogs.noData')} />
			) : (
				<DataTable
					rowKey="id"
					columns={columns}
					dataSource={logs}
					pagination={{ pageSize: 20 }}
					scroll={{ x: 800 }}
				/>
			)}
		</div>
	);
}
