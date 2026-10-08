'use client';

import React from 'react';
import { Tag } from 'antd';
import { useFraudRules, type FraudRule } from '@/hooks/use-wallet-admin';
import { PageError, DataTable } from '@autional/ui/antd';
import { AppPageHeader } from '@autional/ui';
import { useTranslation } from 'react-i18next';

export default function WalletFraudRulesPage() {
	const { t } = useTranslation();
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
			render: (v: string) => (v ? new Date(v).toLocaleString() : '-'),
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
				pagination={{ pageSize: 10 }}
				scroll={{ x: 800 }}
			/>
		</div>
	);
}
