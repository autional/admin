'use client';
// @generated-api-exempt: 1 key(s) [WALLET.ADMIN_WALLET_INTEGRITY] lack generated func

import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Card, Input, Button, Typography, Space, Spin, Descriptions } from 'antd';
import { Result } from '@autional/ui';
import {
	SearchOutlined,
	CheckCircleFilled,
	CloseCircleFilled,
	LinkOutlined,
} from '@ant-design/icons';
import { apiClient, API_PATHS, extractItem } from '@autional/shared';

const { Title, Text } = Typography;

interface IntegrityResult {
	walletId: string;
	total: number;
	valid: boolean;
	brokenAt?: number;
	lastHash?: string;
}

export default function WalletEventsPage() {
	const { t } = useTranslation();
	const [walletId, setWalletId] = useState('');
	const [loading, setLoading] = useState(false);
	const [result, setResult] = useState<IntegrityResult | null>(null);
	const [error, setError] = useState<string | null>(null);

	const handleVerify = async () => {
		if (!walletId.trim()) return;
		setLoading(true);
		setError(null);
		setResult(null);
		try {
			const res = await apiClient.get(API_PATHS.WALLET.ADMIN_WALLET_INTEGRITY(walletId.trim()));
			setResult(extractItem(res.data));
		} catch (e: unknown) {
			const msg = e instanceof Error ? e.message : t('walletEvents.verifyFailed');
			setError(msg);
		} finally {
			setLoading(false);
		}
	};

	return (
		<div className="space-y-6">
			<div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 mb-4">
				<Title level={3} className="!mb-0">
					{t('walletEvents.title')}
				</Title>
				<Text type="secondary">{t('walletEvents.description')}</Text>
			</div>

			<Card>
				<Space.Compact className="w-full max-w-[500px]">
					<Input
						placeholder={t('walletEvents.inputPlaceholder')}
						value={walletId}
						onChange={(e) => setWalletId(e.target.value)}
						onPressEnter={handleVerify}
						prefix={<LinkOutlined />}
					/>
					<Button type="primary" icon={<SearchOutlined />} onClick={handleVerify} loading={loading}>
						{t('walletEvents.verifyBtn')}
					</Button>
				</Space.Compact>
			</Card>

			{loading && (
				<Card className="text-center py-12">
					<Spin size="large" tip={t('walletEvents.loading')} />
				</Card>
			)}

			{error && <Result variant="danger" className="mx-auto max-w-md" title={t('walletEvents.verifyError')} description={error} />}

			{result && (
				<Card>
					<Result
						variant={result.valid ? 'success' : 'danger'}
						className="mx-auto max-w-md"
						icon={
							result.valid ? (
								<CheckCircleFilled className="text-success text-5xl" />
							) : (
								<CloseCircleFilled className="text-danger text-5xl" />
							)
						}
						title={
							<span className={result.valid ? 'text-success-text' : 'text-danger-text'}>
								{result.valid
									? `✅ ${t('walletEvents.resultPass')}`
									: `❌ ${t('walletEvents.resultFail')}`}
							</span>
						}
						description={
							<span>
								{t('walletEvents.resultWalletPrefix')} <Text code>{result.walletId}</Text> ·{' '}
								{t('walletEvents.resultTotalEvents', { total: result.total })}
							</span>
						}
					/>
					<Descriptions
						column={1}
						size="small"
						bordered
						className="max-w-[600px] mx-auto mt-4"
						items={[
							{
								key: 'total',
								label: t('walletEvents.resultTotalEvents', { total: result.total }),
								children: result.total,
							},
							{
								key: 'brokenAt',
								label: t('walletEvents.resultBrokenAt'),
								children: result.brokenAt ? result.brokenAt : '-',
							},
							{
								key: 'lastHash',
								label: t('walletEvents.resultLastHash'),
								children: result.lastHash ? (
									<Text code copyable className="text-xs break-all">
										{result.lastHash}
									</Text>
								) : (
									'-'
								),
							},
						]}
					/>
				</Card>
			)}
		</div>
	);
}
