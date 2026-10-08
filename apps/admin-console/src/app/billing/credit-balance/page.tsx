'use client';

import React, { useState } from 'react';
import { Tag, Button, Input, Space, Card, Descriptions, Spin, Select } from 'antd';
import { Search } from 'lucide-react';
import { useCreditBalance, useCreditTransactions } from '@/hooks/use-billing-admin';
import { PageError, DataTable } from '@autional/ui/antd';
import { AppPageHeader } from '@autional/ui';
import { useTranslation } from 'react-i18next';
import { usePageTitle } from '@autional/shared';

// A-434：wire decimal 为字符串（dto.go:1146/:1156 decimal.Decimal → `"balance":"0"`）；
// 旧 number 型致 `.toLocaleString()` 恒等空转（String.prototype 规范行为）→ Number 转换后本地化。
function formatDecimal(v?: string): string {
	if (v === undefined || v === null || v === '') return '-';
	return Number(v).toLocaleString('zh-CN');
}

export default function BillingCreditBalancePage() {
	const { t } = useTranslation();
	usePageTitle(t('creditBalance.title'));
	const [tenantId, setTenantId] = useState('');
	const [lookupId, setLookupId] = useState('');
	const [sourceFilter, setSourceFilter] = useState<string | undefined>();
	const [page, setPage] = useState(1);
	const [pageSize, setPageSize] = useState(10);

	const {
		data: balance,
		isLoading: balanceLoading,
		error: balanceError,
		refetch: balanceRefetch,
	} = useCreditBalance(lookupId);

	const {
		data: txData,
		isLoading: txLoading,
		error: txError,
		refetch: txRefetch,
	} = useCreditTransactions(lookupId, { page, pageSize, source: sourceFilter });

	const transactions = txData?.items ?? [];
	const total = txData?.total ?? 0;
	const balanceText = formatDecimal(balance?.balance);

	// A-435：403（跨租户/入口门禁）与网络错分流（旧统一"加载失败"）
	const forbidden = (e: unknown) =>
		(e as { response?: { status?: number } } | null)?.response?.status === 403;

	// A-436①②：来源枚举补第五值 invoice_payment（domain.go:173 五值），列标题校正为「来源」
	// （wire `type` credit/debit 零消费，此前标题「类型」实渲染 source）
	const sourceColorMap: Record<string, string> = {
		proration: 'blue',
		refund: 'orange',
		promo: 'green',
		manual_adjust: 'purple',
		invoice_payment: 'cyan',
	};
	const sourceLabelMap: Record<string, string> = {
		proration: t('creditBalance.source.proration'),
		refund: t('creditBalance.source.refund'),
		promo: t('creditBalance.source.promo'),
		manual_adjust: t('creditBalance.source.manualAdjust'),
		invoice_payment: t('creditBalance.source.invoicePayment'),
	};

	const txColumns = [
		{
			title: t('creditBalance.column.time'),
			dataIndex: 'createdAt',
			key: 'createdAt',
			width: 170,
			render: (v: string) => (v ? new Date(v).toLocaleString('zh-CN') : '-'),
		},
		{
			title: t('creditBalance.column.source'),
			dataIndex: 'source',
			key: 'source',
			width: 100,
			render: (v: string) => (
				<Tag color={sourceColorMap[v] ?? 'default'}>{sourceLabelMap[v] ?? v}</Tag>
			),
		},
		{
			title: t('creditBalance.column.amount'),
			dataIndex: 'amount',
			key: 'amount',
			width: 120,
			render: (v: string) => {
				if (v === undefined || v === null || v === '') return '-';
				const num = Number(v);
				return (
					<span className={num > 0 ? 'text-success-text' : 'text-danger-text'}>
						{num > 0 ? '+' : ''}
						{num.toLocaleString('zh-CN')}
					</span>
				);
			},
		},
		{
			title: t('creditBalance.column.balance'),
			dataIndex: 'balance',
			key: 'balance',
			width: 120,
			render: (v: string) => formatDecimal(v),
		},
		{ title: t('creditBalance.column.remark'), dataIndex: 'remark', key: 'remark', ellipsis: true },
		{
			title: t('creditBalance.column.sourceId'),
			dataIndex: 'sourceId',
			key: 'sourceId',
			ellipsis: true,
			width: 140,
			render: (v: string) => v || '-',
		},
	];

	return (
		<div>
			<AppPageHeader title={t('creditBalance.title')} />

			<Card size="small" className="mb-4 max-w-xs">
				<div className="flex gap-2 items-end">
					<div className="flex-1">
						<label className="text-xs text-neutral-600 mb-1 block">
							{t('creditBalance.tenantId')}
						</label>
						<Input
							value={tenantId}
							onChange={(e) => setTenantId(e.target.value)}
							placeholder={t('creditBalance.tenantIdPlaceholder')}
							onPressEnter={() => {
								setLookupId(tenantId);
								setPage(1);
							}}
						/>
					</div>
					<Button
						icon={<Search size="1em" />}
						onClick={() => {
							setLookupId(tenantId);
							setPage(1);
						}}
					>
						{t('creditBalance.query')}
					</Button>
				</div>
			</Card>

			{!lookupId ? (
				<div className="text-neutral-600 py-8 text-center">{t('creditBalance.enterTenantIdHint')}</div>
			) : (
				<>
					{/* A-435：错误态短路（不与 notFound 并置）；403 与网络错分流 */}
					{balanceError ? (
						<PageError
							message={
								forbidden(balanceError)
									? t('creditBalance.forbidden')
									: t('creditBalance.balanceLoadError')
							}
							retry={balanceRefetch}
							className="mb-4"
						/>
					) : balanceLoading ? (
						<div className="flex justify-center py-8">
							<Spin />
						</div>
					) : balance ? (
						<div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
							<Card size="small">
								<Descriptions column={1} size="small">
									<Descriptions.Item label={t('creditBalance.availableBalance')}>
										<span className="text-lg font-semibold text-success-text">
											{balanceText === '-' ? 0 : balanceText} {balance.currency || ''}
										</span>
									</Descriptions.Item>
								</Descriptions>
							</Card>
							<Card size="small">
								<Descriptions column={1} size="small">
									<Descriptions.Item label={t('creditBalance.tenantIdLabel')}>
										{balance.tenantId || lookupId}
									</Descriptions.Item>
									<Descriptions.Item label={t('creditBalance.updatedAt')}>
										{balance.updatedAt
											? new Date(balance.updatedAt).toLocaleString('zh-CN')
											: '-'}
									</Descriptions.Item>
								</Descriptions>
							</Card>
						</div>
					) : (
						<div className="text-neutral-600 py-4 text-center mb-4">{t('creditBalance.notFound')}</div>
					)}

					{txError && (
						<PageError
							message={
								forbidden(txError)
									? t('creditBalance.forbidden')
									: t('creditBalance.txLoadError')
							}
							retry={txRefetch}
							className="mb-4"
						/>
					)}

					<Card size="small" className="mb-4">
						<Space wrap>
							<Select
								placeholder={t('creditBalance.filter.source')}
								allowClear
								className="w-[140px]"
								value={sourceFilter}
								onChange={(v) => {
									setSourceFilter(v);
									setPage(1);
								}}
								options={[
									{ value: 'proration', label: t('creditBalance.source.proration') },
									{ value: 'refund', label: t('creditBalance.source.refund') },
									{ value: 'promo', label: t('creditBalance.source.promo') },
									{ value: 'manual_adjust', label: t('creditBalance.source.manualAdjust') },
									{
										value: 'invoice_payment',
										label: t('creditBalance.source.invoicePayment'),
									},
								]}
							/>
						</Space>
					</Card>

					<DataTable
						rowKey="id"
						columns={txColumns}
						dataSource={transactions}
						loading={txLoading}
						pagination={{
							current: page,
							pageSize,
							total,
							showSizeChanger: true,
							showTotal: (total) => t('creditBalance.totalItems', { count: total }),
							onChange: (p, ps) => {
								setPage(p);
								setPageSize(ps);
							},
						}}
						scroll={{ x: 900 }}
					/>
				</>
			)}
		</div>
	);
}
