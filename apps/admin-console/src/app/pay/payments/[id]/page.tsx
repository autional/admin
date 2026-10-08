'use client';

import React, { useState } from 'react';
import { useParams, useNavigate } from 'react-router';
import { Card, Descriptions, Tag, Button, Spin, Tabs } from 'antd';
import { ArrowLeft } from 'lucide-react';
import {
	usePayPaymentDetail,
	usePayReceipt,
	usePayRefunds,
	type PaymentItem,
	type Receipt,
} from '@/hooks/use-pay';
import { PageError, DataTable } from '@autional/ui/antd';
import { AppPageHeader, SectionCard } from '@autional/ui';
import { useTenantSlug, usePageTitle } from '@autional/shared';
import { buildNavHref } from '@/lib/nav';
import { useTranslation } from 'react-i18next';

export default function PayPaymentDetailPage() {
	const { t, i18n } = useTranslation();
	const { id } = useParams<{ id: string }>();
	const navigate = useNavigate();
	const tenantSlug = useTenantSlug();
	const [activeTab, setActiveTab] = useState('info');

	const { data: payment, isLoading, error, refetch } = usePayPaymentDetail(id ?? '');
	const { data: receipt, isLoading: rcptLoading } = usePayReceipt(id ?? '');
	const { data: refunds = [], isLoading: refundsLoading } = usePayRefunds({ payment_id: id });

	// A-344④：tab 标题（旧实现恒「Autional 管理控制台」）
	usePageTitle(
		payment?.paymentId
			? `${payment.paymentId} - ${t('paymentDetail.title')}`
			: t('paymentDetail.title'),
	);

	// A-344①：404 = 支付不存在（非系统错误）；旧实现 error 早退把 notFound 分支遮蔽，
	// 且未找到时整页替换连返回键/标题一起消失。
	const notFound = (error as { response?: { status?: number } } | null)?.response?.status === 404;

	const header = (
		<>
			<Button
				type="link"
				icon={<ArrowLeft size="1em" />}
				onClick={() => navigate(buildNavHref('/pay/payments', tenantSlug))}
				className="mb-4 pl-0"
			>
				{t('paymentDetail.backToList')}
			</Button>
			<AppPageHeader title={t('paymentDetail.title')} />
		</>
	);

	if (isLoading) {
		return (
			<div className="flex justify-center py-12">
				<Spin size="large" />
			</div>
		);
	}

	if (error && !notFound) {
		return <PageError message={t('paymentDetail.loadError')} retry={refetch} />;
	}

	if (!payment) {
		// A-344①：未找到态保留整页骨架（返回键 + 标题），不再整页替换
		return (
			<div>
				{header}
				<PageError message={t('paymentDetail.notFound')} />
			</div>
		);
	}

	const statusColorMap: Record<string, string> = {
		created: 'default',
		processing: 'processing',
		succeeded: 'success',
		failed: 'error',
		expired: 'warning',
	};
	const statusLabelMap: Record<string, string> = {
		created: t('paymentDetail.status.created'),
		processing: t('paymentDetail.status.processing'),
		succeeded: t('paymentDetail.status.succeeded'),
		failed: t('paymentDetail.status.failed'),
		expired: t('paymentDetail.status.expired'),
	};
	const channelLabels: Record<string, string> = {
		wechat: t('paymentDetail.channel.wechat'),
		alipay: t('paymentDetail.channel.alipay'),
		stripe: t('paymentDetail.channel.stripe'),
	};
	const currLabels: Record<string, string> = {
		CNY: t('paymentDetail.currency.cny'),
		USD: t('paymentDetail.currency.usd'),
	};
	// A-344⑦：targetType 原值裸英文（order…）⇒ 词表本地化，未知值原样兜底（与列表页共用键）
	const targetTypeLabels: Record<string, string> = {
		order: t('payPayments.targetType.order'),
		wallet_recharge: t('payPayments.targetType.walletRecharge'),
		billing_record: t('payPayments.targetType.billingRecord'),
	};

	return (
		<div>
			{header}

			<Tabs
				activeKey={activeTab}
				onChange={setActiveTab}
				items={[
					{
						key: 'info',
						label: t('paymentDetail.basicInfo'),
						children: (
							<SectionCard title={t('paymentDetail.paymentIntent')}>
								<Descriptions column={2} bordered size="small">
									<Descriptions.Item label={t('paymentDetail.paymentId')}>
										{payment.paymentId}
									</Descriptions.Item>
									<Descriptions.Item label={t('paymentDetail.status')}>
										<Tag color={statusColorMap[payment.status] ?? 'default'}>
											{statusLabelMap[payment.status] ?? payment.status}
										</Tag>
									</Descriptions.Item>
									<Descriptions.Item label={t('paymentDetail.userId')}>
										{payment.payerId}
									</Descriptions.Item>
									<Descriptions.Item label={t('paymentDetail.tenantId')}>
										{payment.tenantId}
									</Descriptions.Item>
									<Descriptions.Item label={t('paymentDetail.amount')}>
										{currLabels[payment.currency] ?? payment.currency}
										{parseFloat(payment.amount).toFixed(2)}
									</Descriptions.Item>
									<Descriptions.Item label={t('paymentDetail.channel')}>
										{channelLabels[payment.channelCode] ?? payment.channelCode}
									</Descriptions.Item>
									<Descriptions.Item label={t('paymentDetail.targetType')}>
										{targetTypeLabels[payment.targetType] ?? (payment.targetType || '-')}
									</Descriptions.Item>
									<Descriptions.Item label={t('paymentDetail.targetId')}>
										{payment.targetId || '-'}
									</Descriptions.Item>
									<Descriptions.Item label={t('paymentDetail.receiptNumber')}>
										{payment.receiptNumber || '-'}
									</Descriptions.Item>
									<Descriptions.Item label={t('paymentDetail.gatewayRef')}>
										{payment.gatewayReference || '-'}
									</Descriptions.Item>
									<Descriptions.Item label={t('paymentDetail.description')}>
										{payment.itemDescription || '-'}
									</Descriptions.Item>
									<Descriptions.Item label={t('paymentDetail.createdAt')}>
										{payment.createdAt ? new Date(payment.createdAt).toLocaleString(i18n.language) : '-'}
									</Descriptions.Item>
									<Descriptions.Item label={t('paymentDetail.paidAt')}>
										{payment.paidAt ? new Date(payment.paidAt).toLocaleString(i18n.language) : '-'}
									</Descriptions.Item>
								</Descriptions>
							</SectionCard>
						),
					},
					{
						key: 'receipt',
						label: t('paymentDetail.receipt'),
						children: (
							<SectionCard title={t('paymentDetail.paymentReceipt')}>
								{rcptLoading ? (
									<div className="flex justify-center py-8">
										<Spin />
									</div>
								) : receipt ? (
									<Descriptions column={1} bordered size="small">
										<Descriptions.Item label={t('paymentDetail.receiptNo')}>
											{receipt.receiptNumber}
										</Descriptions.Item>
										<Descriptions.Item label={t('paymentDetail.amount')}>
											{currLabels[receipt.currency] ?? receipt.currency}
											{parseFloat(receipt.amount).toFixed(2)}
										</Descriptions.Item>
										<Descriptions.Item label={t('paymentDetail.channel')}>
											{channelLabels[receipt.channelCode] ?? receipt.channelCode}
										</Descriptions.Item>
										<Descriptions.Item label={t('paymentDetail.description')}>
											{receipt.itemDescription || '-'}
										</Descriptions.Item>
										<Descriptions.Item label={t('paymentDetail.issuedAt')}>
											{receipt.createdAt ? new Date(receipt.createdAt).toLocaleString(i18n.language) : '-'}
										</Descriptions.Item>
									</Descriptions>
								) : (
									<div className="text-neutral-600 py-4">{t('paymentDetail.noReceipt')}</div>
								)}
							</SectionCard>
						),
					},
					{
						key: 'refunds',
						label: t('paymentDetail.refunds'),
						children: (
							<DataTable
								rowKey="id"
								dataSource={refunds}
								loading={refundsLoading}
								pagination={{ pageSize: 10 }}
								scroll={{ x: 800 }}
								columns={[
									{
										title: t('paymentDetail.refundRecordId'),
										dataIndex: 'id',
										key: 'id',
										ellipsis: true,
									},
									{
										title: t('paymentDetail.amount'),
										dataIndex: 'amount',
										key: 'amount',
										render: (v: string) =>
											typeof v === 'string' ? `${parseFloat(v).toFixed(2)}` : v,
									},
									{
										title: t('paymentDetail.status'),
										dataIndex: 'status',
										key: 'status',
										render: (v: string) => (
											<Tag
												color={
													v === 'succeeded' ? 'success' : v === 'failed' ? 'error' : 'processing'
												}
											>
												{v}
											</Tag>
										),
									},
									{
										title: t('paymentDetail.reason'),
										dataIndex: 'reason',
										key: 'reason',
										ellipsis: true,
									},
									{
										title: t('paymentDetail.time'),
										dataIndex: 'createdAt',
										key: 'createdAt',
										render: (v: string) => (v ? new Date(v).toLocaleString(i18n.language) : '-'),
									},
								]}
							/>
						),
					},
				]}
			/>
		</div>
	);
}
