'use client';

import React from 'react';
import { Tag } from 'antd';
import { usePageTitle } from '@autional/shared';
import { useFraudRules, type FraudRule } from '@/hooks/use-wallet-admin';
import { PageError, DataTable } from '@autional/ui/antd';
import { AppPageHeader } from '@autional/ui';
import { useTranslation } from 'react-i18next';

export default function WalletFraudRulesPage() {
	const { t, i18n } = useTranslation();
	usePageTitle(t('fraudRules.title')); // A-389②：tab 标题（旧实现恒「Autional 管理控制台」，第 30 例）
	const { data: rules = [], isLoading, error, refetch } = useFraudRules();

	const columns = [
		{ title: t('fraudRules.columnName'), dataIndex: 'name', key: 'name' },
		{
			title: t('fraudRules.columnDescription'),
			dataIndex: 'description',
			key: 'description',
			ellipsis: true,
			render: (v: string) => v || '-',
		},
		{
			title: t('fraudRules.columnStatus'),
			dataIndex: 'enabled',
			key: 'enabled',
			width: 80,
			render: (v: boolean) => (
				<Tag color={v ? 'success' : 'default'}>
					{v ? t('fraudRules.enabled') : t('fraudRules.disabled')}
				</Tag>
			),
		},
		{
			title: t('fraudRules.columnConditions'),
			dataIndex: 'conditions',
			key: 'conditions',
			ellipsis: true,
			render: (v: unknown) => (v ? JSON.stringify(v).substring(0, 100) : '-'),
		},
		{
			title: t('fraudRules.columnCreatedAt'),
			dataIndex: 'createdAt',
			key: 'createdAt',
			width: 160,
			// A-389③：toLocaleString 无 locale（旧恒跑宿主默认）
			render: (v: string) => (v ? new Date(v).toLocaleString(i18n.language) : '-'),
		},
	];

	return (
		<div>
			<AppPageHeader title={t('fraudRules.title')} />

			{error && <PageError message={t('fraudRules.loadError')} retry={refetch} className="mb-4" />}

			<DataTable
				rowKey="id"
				columns={columns}
				dataSource={rules}
				loading={isLoading}
				// A-389①：核实零改——该端点无分页参且返回全集（handler_admin.go:423-448
				// NewListResponse(items, len(items), 1, 20) 仅代回显 page_size:20），本地分页对全集
				// 切片 ⇒ 无截断；服务端真分页需后端加参（超本波范围，登记于 w1f-record）。
				pagination={{ pageSize: 10 }}
				scroll={{ x: 800 }}
			/>
		</div>
	);
}
